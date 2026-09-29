const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

let mainWindow = null;
let mspSession = null;
let connection = null;
let activeWorkspace = null;
let stderrTail = [];

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function safePayload(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { value: String(value) };
  }
}

function powerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function findMuseBinary() {
  if (process.platform !== "win32") return "muse";

  const dirs = [];
  if (process.env.MUSE_INSTALL_DIR?.trim()) {
    dirs.push(process.env.MUSE_INSTALL_DIR.trim());
  }
  if (process.env.LOCALAPPDATA?.trim()) {
    dirs.push(path.join(process.env.LOCALAPPDATA.trim(), "Programs", "muse"));
  }

  const pathDirs = String(process.env.Path || process.env.PATH || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  dirs.push(...pathDirs);

  for (const dir of dirs) {
    try {
      const versionPath = path.join(dir, ".muse-version");
      if (fs.existsSync(versionPath)) {
        const version = fs.readFileSync(versionPath, "utf8").trim();
        const binary = path.join(dir, `muse-bin-${version}.exe`);
        if (fs.existsSync(binary)) return binary;
      }

      const exe = path.join(dir, "muse.exe");
      if (fs.existsSync(exe)) return exe;
    } catch {
      // Keep probing other install locations.
    }
  }

  return "muse";
}

async function runMuse(args, options = {}) {
  const command = findMuseBinary();
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: process.env,
    shell: process.platform === "win32" && command === "muse",
    windowsHide: true,
    timeout: options.timeout || 15000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

async function diagnoseMuse() {
  const authPath = path.join(app.getPath("home"), ".config", "muse", "auth.json");
  try {
    const version = await runMuse(["--version"]);
    return {
      cliInstalled: true,
      version: version.stdout || version.stderr || "Muse Code",
      authConfigPresent: fs.existsSync(authPath),
      authPath,
      workspace: activeWorkspace,
      connected: Boolean(connection),
    };
  } catch (error) {
    return {
      cliInstalled: false,
      version: null,
      authConfigPresent: fs.existsSync(authPath),
      authPath,
      workspace: activeWorkspace,
      connected: false,
      error: String(error?.message || error),
    };
  }
}

async function closeMuseHost() {
  const current = mspSession;
  mspSession = null;
  connection = null;
  activeWorkspace = null;
  stderrTail = [];
  if (current?.close) {
    try {
      await current.close();
    } catch {
      // Host may already be gone.
    }
  }
}

async function connectMuse(cwd) {
  if (!cwd) throw new Error("Choose a project folder first.");
  if (connection && activeWorkspace === cwd) {
    return { workspace: cwd, reused: true, initializeResult: mspSession?.initializeResult || null };
  }

  await closeMuseHost();

  const sdk = await import("@muse-code/sdk");
  const handshake = sdk.spawnMspConnection({
    command: findMuseBinary(),
    args: ["serve"],
    cwd,
    env: process.env,
    onStderr: (chunk) => {
      const text = String(chunk || "").trim();
      if (!text) return;
      stderrTail.push(...text.split(/\r?\n/));
      stderrTail = stderrTail.slice(-20);
      send("muse:stderr", text);
    },
  });

  try {
    mspSession = await handshake.initialize({
      clientInfo: {
        name: "muse-desktop",
        version: app.getVersion(),
      },
      capabilities: {
        requestedCapabilities: ["userShell"],
      },
    });
  } catch (error) {
    const tail = stderrTail.join("\n").trim();
    await closeMuseHost();
    throw new Error(tail ? `${String(error?.message || error)}\n${tail}` : String(error?.message || error));
  }

  connection = mspSession.connection;
  activeWorkspace = cwd;

  connection.onNotification((notification) => {
    send("muse:event", safePayload(notification));
  });

  if (connection.onProtocolError) {
    connection.onProtocolError((error) => {
      send("muse:protocol-error", String(error?.message || error));
    });
  }

  if (mspSession.exited?.then) {
    mspSession.exited.then(
      (exit) => {
        send("muse:host-exit", safePayload(exit));
        connection = null;
        mspSession = null;
      },
      (error) => {
        send("muse:host-exit", { error: String(error?.message || error) });
        connection = null;
        mspSession = null;
      }
    );
  }

  return {
    workspace: cwd,
    reused: false,
    initializeResult: safePayload(mspSession.initializeResult || null),
    fingerprintWarning: safePayload(mspSession.fingerprintWarning || null),
  };
}

function requireConnection() {
  if (!connection) {
    throw new Error("Muse is not connected. Choose a project folder first.");
  }
  return connection;
}

async function query(method, params = {}) {
  const conn = requireConnection();
  if (typeof conn.request === "function") {
    return conn.request(method, params);
  }
  return conn.command(method, params);
}

async function command(method, params = {}) {
  return requireConnection().command(method, params);
}

function sessionIdFrom(result) {
  const id = result?.session?.sessionId;
  if (!id || typeof id !== "string") {
    throw new Error("Muse did not return a session id.");
  }
  return id;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: "#090a0f",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("muse:diagnose", diagnoseMuse);

  ipcMain.handle("muse:login", async () => {
    const diagnostic = await diagnoseMuse();
    if (!diagnostic.cliInstalled) {
      throw new Error(
        "Muse Code is installed but this app cannot find it yet. Close Muse Desktop completely, open a new PowerShell and confirm 'muse --version', then reopen the app."
      );
    }

    const museBinary = findMuseBinary();
    const cwd = activeWorkspace || app.getPath("home");

    if (process.platform === "win32") {
      const script = [
        "$Host.UI.RawUI.WindowTitle = 'Muse Code Sign In'",
        `Set-Location -LiteralPath ${powerShellLiteral(cwd)}`,
        "if (-not $env:TBH_CREDENTIAL_BACKEND) { $env:TBH_CREDENTIAL_BACKEND = 'file' }",
        "Write-Host ''",
        "Write-Host 'Muse Code sign-in' -ForegroundColor Cyan",
        "Write-Host 'Complete the browser sign-in. If Muse opens directly, type /login.' -ForegroundColor DarkGray",
        "Write-Host ''",
        `& ${powerShellLiteral(museBinary)} login`,
        "if ($LASTEXITCODE -ne 0) {",
        "  Write-Host ''",
        "  Write-Host 'Direct login command was not accepted by this Muse version. Opening Muse interactive mode instead...' -ForegroundColor Yellow",
        `  & ${powerShellLiteral(museBinary)}`,
        "}",
      ].join("; ");

      await new Promise((resolve, reject) => {
        const child = spawn(
          "cmd.exe",
          ["/d", "/c", "start", "", "powershell.exe", "-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", script],
          {
            cwd,
            env: process.env,
            windowsHide: true,
            stdio: "ignore",
          }
        );

        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Could not open Muse sign-in terminal (launcher exit code ${code}).`));
        });
      });

      return {
        started: true,
        mode: "visible-terminal",
        museBinary,
        cwd,
        message: "Muse sign-in terminal opened. Complete browser authentication there.",
      };
    }

    const child = spawn(museBinary, ["login"], {
      cwd,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => undefined);
    child.unref();
    return { started: true, mode: "process", museBinary, cwd };
  });

  ipcMain.handle("muse:choose-workspace", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a project for Muse Code",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return connectMuse(result.filePaths[0]);
  });

  ipcMain.handle("muse:connect-workspace", async (_event, cwd) => connectMuse(String(cwd || "")));

  ipcMain.handle("muse:list-sessions", async () => {
    const result = await query("session/list", {
      workspaceRoot: activeWorkspace,
      limit: 80,
    });
    return safePayload(result);
  });

  ipcMain.handle("muse:start-session", async (_event, options = {}) => {
    const params = {
      workspaceRoot: activeWorkspace,
      approvalMode: options.approvalMode || "onRequest",
    };
    if (options.modelId) params.modelId = options.modelId;
    const result = await command("session/start", params);
    return { sessionId: sessionIdFrom(result), raw: safePayload(result) };
  });

  ipcMain.handle("muse:resume-session", async (_event, sessionId) => {
    const result = await command("session/resume", {
      sessionId: String(sessionId),
      excludeItems: false,
    });
    return safePayload(result);
  });

  ipcMain.handle("muse:read-session", async (_event, sessionId) => {
    const result = await query("session/read", {
      sessionId: String(sessionId),
      excludeItems: false,
    });
    return safePayload(result);
  });

  ipcMain.handle("muse:view-page", async (_event, sessionId) => {
    const result = await query("view/page", {
      sessionId: String(sessionId),
      direction: "backward",
      limit: 300,
    });
    return safePayload(result);
  });

  ipcMain.handle("muse:send-turn", async (_event, payload = {}) => {
    const sessionId = String(payload.sessionId || "");
    const text = String(payload.text || "").trim();
    if (!sessionId) throw new Error("No active Muse session.");
    if (!text) throw new Error("Prompt is empty.");

    if (payload.reasoningEffort) {
      await command("session/setReasoningEffort", {
        sessionId,
        reasoningEffort: payload.reasoningEffort,
      });
    }

    const result = await command("turn/start", {
      sessionId,
      input: [{ type: "text", text }],
      ifBusy: payload.ifBusy || "queue",
    });
    return safePayload(result);
  });

  ipcMain.handle("muse:interrupt", async (_event, sessionId, turnId) => {
    const params = { sessionId: String(sessionId), retract: false };
    if (turnId) params.turnId = String(turnId);
    return safePayload(await command("turn/interrupt", params));
  });

  ipcMain.handle("muse:list-models", async (_event, sessionId) => {
    const params = sessionId ? { sessionId: String(sessionId) } : {};
    return safePayload(await query("model/list", params));
  });

  ipcMain.handle("muse:usage", async () => {
    return safePayload(await query("usage/read", {}));
  });

  ipcMain.handle("muse:pending", async (_event, sessionId) => {
    return safePayload(await query("approval/listPending", { sessionId: String(sessionId) }));
  });

  ipcMain.handle("muse:decide-approval", async (_event, decision = {}) => {
    return safePayload(await command("approval/decide", {
      sessionId: String(decision.sessionId),
      approvalId: String(decision.approvalId),
      requirementId: decision.requirementId,
      choiceId: String(decision.choiceId),
      feedback: decision.feedback || null,
    }));
  });

  ipcMain.handle("muse:set-model", async (_event, sessionId, model) => {
    return safePayload(await command("session/setModel", {
      sessionId: String(sessionId),
      model,
    }));
  });

  ipcMain.handle("muse:set-approval-mode", async (_event, sessionId, mode) => {
    return safePayload(await command("session/setApprovalMode", {
      sessionId: String(sessionId),
      mode: String(mode),
    }));
  });

  ipcMain.handle("muse:user-shell", async (_event, sessionId, commandText) => {
    return safePayload(await command("session/userShell", {
      sessionId: String(sessionId),
      commandText: String(commandText),
    }));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  void closeMuseHost();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
