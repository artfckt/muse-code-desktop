const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Notification,
  protocol,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { subscriptionEnvironment } = require("./muse-host.cjs");
const { NativeTerminal } = require("./native-terminal.cjs");
const { DesktopEngine } = require("./desktop-engine.cjs");
const { DesktopServices, localPath } = require("./desktop-services.cjs");
const commandCatalog = require("./command-catalog.cjs");
if (process.env.MUSE_DESKTOP_DATA_DIR) {
  const directory = path.resolve(process.env.MUSE_DESKTOP_DATA_DIR);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath("userData", directory);
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "muse-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const windows = new Set();
let services;
const terminal = new NativeTerminal(emit);
let window,
  muse,
  requestedSession,
  quitting = false;
function focusSession(id) {
  if (!window || window.isDestroyed()) {
    requestedSession = id;
    createWindow();
  } else window.webContents.send("muse:navigate-session", id);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
const settingsPath = () =>
  path.join(app.getPath("userData"), "desktop-settings.json");
function settings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}
function saveSettings(value) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...settings(), ...value }));
}
function emit(channel, payload) {
  for (const target of windows)
    if (!target.isDestroyed()) target.webContents.send(channel, payload);
}
function externalUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Only web links can be opened.");
  return url.href;
}
async function openCli(login = false) {
  const binary = muse.executable(),
    cwd = muse.workspace || app.getPath("home"),
    env = subscriptionEnvironment(process.env);
  let command, launchArgs;
  if (process.platform === "win32") {
    const literal = (value) => `'${value.replace(/'/g, "''")}'`;
    const script = `Set-Location -LiteralPath ${literal(cwd)}; & ${literal(binary)} ${login ? "login" : ""}`;
    command = "powershell.exe";
    launchArgs = [
      "-NoLogo",
      "-NoExit",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ];
  } else if (process.platform === "darwin") {
    const quote = (value) => "'" + value.replace(/'/g, "'\\''") + "'";
    const script = `cd ${quote(cwd)} && ${quote(binary)} ${login ? "login" : ""}`;
    command = "osascript";
    launchArgs = [
      "-e",
      `tell application "Terminal" to do script ${JSON.stringify(script)}`,
      "-e",
      'tell application "Terminal" to activate',
    ];
  } else {
    command = "x-terminal-emulator";
    launchArgs = ["-e", binary, ...(login ? ["login"] : [])];
  }
  await new Promise((resolve, reject) => {
    const child = spawn(command, launchArgs, {
      cwd,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return {
    mode: "visible-terminal",
    message:
      "Muse Code terminal opened. Complete sign-in, then refresh your account.",
  };
}
function createWindow(agent) {
  const target = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#111315",
    title: "Muse Desktop",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#111315", symbolColor: "#c7c9cb", height: 42 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.add(target);
  target.agentSessionId = agent?.sessionId;
  target.on("closed", () => {
    windows.delete(target);
    if (
      agent &&
      ![...windows].some((other) => other.agentSessionId === agent.sessionId)
    )
      void muse
        ?.query("view/unsubscribe", { sessionId: agent.sessionId })
        .catch(() => {});
  });
  if (!agent) window = target;
  target.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(externalUrl(url));
    } catch {}
    return { action: "deny" };
  });
  target.webContents.on("will-navigate", (event, url) => {
    if (url !== target.webContents.getURL()) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL)
    target.loadURL(
      `${process.env.VITE_DEV_SERVER_URL}${agent ? `?agent=${encodeURIComponent(agent.sessionId)}&parent=${encodeURIComponent(agent.parentSessionId || "")}` : ""}`,
    );
  else
    target.loadFile(
      path.join(__dirname, "..", "dist", "index.html"),
      agent
        ? {
            query: {
              agent: agent.sessionId,
              parent: agent.parentSessionId || "",
            },
          }
        : {},
    );
  if (agent) target.setTitle("Muse Agent");
  return target;
}
app.whenReady().then(() => {
  if (process.platform === "win32")
    app.setAppUserModelId("site.lunada.musedesktop");
  muse = new DesktopEngine({
    home: app.getPath("home"),
    binary: settings().binary,
    version: app.getVersion(),
    emit,
    policies: settings().sessionProfiles,
    savePolicies: (sessionProfiles) => saveSettings({ sessionProfiles }),
  });
  services = new DesktopServices(app.getPath("userData"), muse);
  protocol.handle("muse-media", (request) => services.serveMedia(request));
  const handle = (name, fn) =>
    ipcMain.handle(`muse:${name}`, (_event, ...args) => fn(...args));
  handle("diagnose", () => muse.diagnose());
  ipcMain.handle("muse:window-theme", (event, colors) => {
    if (
      !colors ||
      !/^#[0-9a-f]{6}$/i.test(colors.background) ||
      !/^#[0-9a-f]{6}$/i.test(colors.foreground)
    )
      throw new Error("Invalid window theme colors.");
    const target = BrowserWindow.fromWebContents(event.sender);
    if (target && !target.isDestroyed()) {
      target.setBackgroundColor(colors.background);
      if (process.platform === "win32")
        target.setTitleBarOverlay({
          color: colors.background,
          symbolColor: colors.foreground,
          height: 42,
        });
    }
  });
  handle("bootstrap", async () => ({
    diagnostic: await muse.diagnose(),
    lastWorkspace: settings().workspace || null,
    workspaces: settings().workspaces || [],
    sessionProfiles: settings().sessionProfiles || {},
    requestedSession,
  }));
  handle("open-conversation", (id) => focusSession(String(id)));
  handle("commands", () => commandCatalog);
  handle("mcp-inventory", () => services.mcpInventory());
  handle("save-attachment", (attachment) =>
    services.saveAttachment(attachment),
  );
  handle("session-media", (id) => services.recoverMedia(String(id)));
  handle("open-local", async (value) => {
    const file = localPath(value);
    if (!require("node:fs").existsSync(file))
      throw new Error("This file no longer exists.");
    shell.showItemInFolder(file);
  });
  handle("notify", (payload) => {
    if (!Notification.isSupported()) return { supported: false };
    const notification = new Notification({
      title: String(payload.title || "Muse Desktop").slice(0, 100),
      body: String(payload.body || "").slice(0, 250),
      silent: payload.silent !== false,
    });
    notification.on("click", () => {
      focusSession(payload.sessionId || "");
    });
    notification.show();
    return { supported: true };
  });
  handle("open-agent", async (agent) => {
    if (
      !agent ||
      typeof agent.sessionId !== "string" ||
      !/^[\w-]{1,100}$/.test(agent.sessionId)
    )
      throw new Error("Invalid agent identity.");
    await muse.query("session/read", {
      sessionId: agent.sessionId,
      excludeItems: true,
    });
    createWindow(agent);
    return { opened: true };
  });
  handle("agent-control", (action, payload) => {
    if (
      ![
        "sendMessage",
        "followupTask",
        "interrupt",
        "stop",
        "resume",
        "reopen",
        "close",
        "readResult",
      ].includes(action)
    )
      throw new Error("Unknown agent action.");
    return muse.command(`subagent/${action}`, payload);
  });
  handle("set-permissions", (id, profile, mode) =>
    muse.setPermissions(id, profile, mode),
  );
  handle("fork-session", (id) =>
    muse.command("session/fork", { sessionId: id }),
  );
  handle("subscribe-session", (id) =>
    muse.query("view/subscribe", { sessionId: id }),
  );
  handle("login", async () => {
    try {
      const result = await muse.query("account/loginStart", {
        type: "deviceCode",
      });
      if (!result.verificationUrl || !result.userCode)
        throw new Error(
          "Muse did not return a sign-in code. Update Muse Code and try again.",
        );
      return { ...result, mode: "device-code" };
    } catch (error) {
      if (error.code === -32601) return openCli(true);
      throw error;
    }
  });
  handle("cancel-login", () => muse.query("account/loginCancel"));
  handle("open-external", (url) => shell.openExternal(externalUrl(url)));
  handle("open-cli", () => openCli());
  handle("terminal-start", async (size = {}) => {
    const account = await muse.account();
    if (["apiKey", "envKey"].includes(account.state))
      throw new Error(
        "Sign in with a Muse account before using subscription mode in the terminal.",
      );
    return terminal.start(
      muse.executable(),
      muse.workspace || app.getPath("home"),
      process.env,
      Math.max(2, Math.min(500, size.cols || 100)),
      Math.max(2, Math.min(500, size.rows || 30)),
    );
  });
  handle("terminal-write", (data) => terminal.write(data));
  handle("terminal-resize", (cols, rows) => terminal.resize(cols, rows));
  handle("terminal-restart", async () => {
    if (terminal.process) {
      const result = await dialog.showMessageBox(window, {
        type: "question",
        buttons: ["Keep running", "Restart Muse"],
        defaultId: 0,
        cancelId: 0,
        message: "Restart the native Muse terminal?",
        detail:
          "This stops its current session and any work it is running. Retained conversations remain in Muse history.",
      });
      if (result.response !== 1) return { cancelled: true };
    }
    terminal.close();
    return { cancelled: false };
  });
  handle("choose-binary", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Select the official Muse executable",
      properties: ["openFile"],
      ...(process.platform === "win32"
        ? { filters: [{ name: "Muse Code", extensions: ["exe"] }] }
        : {}),
    });
    if (result.canceled) return null;
    await muse.setBinary(result.filePaths[0]);
    saveSettings({ binary: muse.binary });
    return muse.diagnose();
  });
  handle("choose-workspace", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Open a project",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const connected = await muse.chooseWorkspace(result.filePaths[0]);
    saveSettings({
      workspace: connected.workspace,
      workspaces: [
        ...new Set([...(settings().workspaces || []), connected.workspace]),
      ],
    });
    return connected;
  });
  handle("connect-workspace", async (cwd) => {
    const result = await muse.chooseWorkspace(String(cwd));
    saveSettings({
      workspace: result.workspace,
      workspaces: [
        ...new Set([...(settings().workspaces || []), result.workspace]),
      ],
    });
    return result;
  });
  handle("list-sessions", () => muse.listSessions());
  handle("start-session", (options) => muse.startSession(options));
  handle("resume-session", (id) =>
    muse.command("session/resume", { sessionId: id, excludeItems: false }),
  );
  handle("read-session", (id) =>
    muse.query("session/read", { sessionId: id, excludeItems: false }),
  );
  handle("view-page", (id, cursor) =>
    muse.query("view/page", {
      sessionId: id,
      direction: "backward",
      limit: 500,
      ...(cursor ? { cursor } : {}),
    }),
  );
  handle("send-turn", async (payload) => {
    const result = await muse.sendTurn(payload);
    const media = services.rememberMedia(
      payload.sessionId,
      result.commandId,
      payload.attachmentIds,
    );
    if (media)
      emit("muse:event", {
        method: "desktop/media",
        params: {
          sessionId: payload.sessionId,
          commandId: result.commandId,
          media,
        },
      });
    return result;
  });
  handle("interrupt", (id, turnId) =>
    muse.command("turn/interrupt", {
      sessionId: id,
      retract: false,
      ...(turnId ? { turnId } : {}),
    }),
  );
  handle("list-models", (id) =>
    muse.query("model/list", id ? { sessionId: id } : {}),
  );
  handle("list-skills", (id) => muse.query("skill/list", { sessionId: id }));
  handle("usage", () => muse.query("usage/read"));
  handle("pending", (id) =>
    muse.query("approval/listPending", { sessionId: id }),
  );
  handle("decide-approval", (decision) =>
    muse.command("approval/decide", decision),
  );
  handle("answer-input", (answer) => muse.command("userInput/answer", answer));
  handle("cancel-input", (answer) => muse.command("userInput/cancel", answer));
  handle("set-model", (id, model) =>
    muse.command("session/setModel", {
      sessionId: id,
      model: {
        modelId: model.modelId,
        providerId: model.providerId,
        profileId: model.profileId,
      },
    }),
  );
  handle("set-approval-mode", (id, mode) =>
    muse.command("session/setApprovalMode", { sessionId: id, mode }),
  );
  handle("user-shell", (id, commandText) =>
    muse.command("session/userShell", { sessionId: id, commandText }),
  );
  handle("compact", (id) => muse.command("session/compact", { sessionId: id }));
  handle("rename", (id, name) =>
    muse.command("session/rename", { sessionId: id, name }),
  );
  handle("read-output", (id, itemId, outputRef) =>
    muse.query("item/readOutput", { sessionId: id, itemId, outputRef }),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  terminal.close();
  void muse?.close().finally(() => app.quit());
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
