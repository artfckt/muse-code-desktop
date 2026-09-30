const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Notification,
  protocol,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { subscriptionEnvironment } = require("./muse-host.cjs");
const { NativeTerminal } = require("./native-terminal.cjs");
const { DesktopEngine } = require("./desktop-engine.cjs");
const { DesktopServices, localPath } = require("./desktop-services.cjs");
const {
  trustedWindow,
  trustedDocument,
  authorizeAgent,
} = require("./renderer-security.cjs");
const securityOptions = {
  appRoot: path.join(__dirname, ".."),
  devUrl: !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined,
};
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
      corsEnabled: true,
      stream: true,
    },
  },
]);
const windows = new Set();
const configuredSessions = new WeakSet();
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
    try {
      return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    } catch {
      return JSON.parse(fs.readFileSync(`${settingsPath()}.bak`, "utf8"));
    }
  } catch {
    return {};
  }
}
function saveSettings(value) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const staged = `${settingsPath()}.tmp`;
  fs.writeFileSync(staged, JSON.stringify({ ...settings(), ...value }));
  fs.copyFileSync(staged, `${settingsPath()}.bak.tmp`);
  fs.renameSync(`${settingsPath()}.bak.tmp`, `${settingsPath()}.bak`);
  fs.renameSync(staged, settingsPath());
}
function emit(channel, payload) {
  if (channel === "muse:event" && payload?.params?.item)
    services?.observeItems(payload.params.sessionId, [payload.params.item]);
  for (const target of windows) {
    if (target.isDestroyed()) continue;
    if (
      target.agentSessionId &&
      (channel !== "muse:event" ||
        payload?.params?.sessionId !== target.agentSessionId)
    )
      continue;
    target.webContents.send(channel, payload);
  }
}
function externalUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Only web links can be opened.");
  return url.href;
}
async function openCli(login = false, context = {}) {
  const binary = muse.executable(),
    cwd = context.sessionId
      ? await muse.workspaceForSession(context.sessionId)
      : context.workspaceRoot || app.getPath("home"),
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
      ...(agent ? { partition: `muse-agent-${agent.sessionId}` } : {}),
    },
  });
  configureSession(target.webContents.session);
  windows.add(target);
  target.agentSessionId = agent?.sessionId;
  target.parentSessionId = agent?.parentSessionId;
  if (agent) muse?.pinSession(agent.sessionId);
  target.on("closed", () => {
    windows.delete(target);
    if (
      agent &&
      ![...windows].some((other) => other.agentSessionId === agent.sessionId)
    ) {
      muse?.unpinSession(agent.sessionId);
      void muse
        ?.query("view/unsubscribe", { sessionId: agent.sessionId })
        .catch(() => {});
    }
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
  if (securityOptions.devUrl)
    target.loadURL(
      `${securityOptions.devUrl}${agent ? `?agent=${encodeURIComponent(agent.sessionId)}&parent=${encodeURIComponent(agent.parentSessionId || "")}` : ""}`,
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
function configureSession(targetSession) {
  if (configuredSessions.has(targetSession)) return;
  configuredSessions.add(targetSession);
  targetSession.protocol.handle("muse-media", (request) =>
    services.serveMedia(request),
  );
  // protocol.handle has no sender identity. Check the requesting webContents
  // before the file handler and also require a main-issued file capability.
  targetSession.webRequest.onBeforeRequest(
    { urls: ["muse-media://*/*"] },
    (details, callback) => {
      const target = [...windows].find(
        (window) =>
          !window.isDestroyed() &&
          window.webContents.id === details.webContentsId,
      );
      const mediaSession = new URL(details.url).searchParams.get("session");
      const allowed =
        target &&
        (!target.agentSessionId || mediaSession === target.agentSessionId) &&
        trustedDocument(target.webContents.getURL(), securityOptions) &&
        details.frame &&
        details.frame === target.webContents.mainFrame;
      callback({ cancel: !allowed });
    },
  );
}
app.whenReady().then(() => {
  if (process.platform === "win32")
    app.setAppUserModelId("site.lunada.musedesktop");
  muse = new DesktopEngine({
    home: app.getPath("home"),
    binary: settings().binary,
    version: app.getVersion(),
    standaloneRoot: path.join(app.getPath("userData"), "standalone"),
    emit,
    policies: settings().sessionProfiles,
    savePolicies: (sessionProfiles) => saveSettings({ sessionProfiles }),
  });
  services = new DesktopServices(app.getPath("userData"), muse);
  configureSession(session.defaultSession);
  const handle = (name, fn) =>
    ipcMain.handle(`muse:${name}`, (event, ...args) => {
      const target = trustedWindow(
        windows,
        event.sender,
        event.senderFrame,
        securityOptions,
      );
      authorizeAgent(target, name, args, muse);
      if (target.agentSessionId && name === "resolve-media")
        return services.resolveMedia(String(args[0]), args[1], true);
      if (target.agentSessionId && name === "open-local")
        return services
          .approvedPath(String(args[0]), target.agentSessionId, true)
          .then((file) => shell.showItemInFolder(file));
      return fn(...args);
    });
  const observedSession = async (id, resume = false) => {
    const result = resume
      ? await muse.command("session/resume", {
          sessionId: id,
          excludeItems: false,
        })
      : await muse.query("session/read", {
          sessionId: id,
          excludeItems: false,
        });
    services.observeItems(
      id,
      result.history?.items || result.history?.snapshot?.state?.items,
    );
    return result;
  };
  handle("agent-appearance", () => settings().appearance || null);
  handle("sync-appearance", (appearance) => {
    if (!appearance || JSON.stringify(appearance).length > 20000)
      throw new Error("Invalid appearance preferences.");
    saveSettings({ appearance });
    for (const target of windows)
      if (!target.isDestroyed() && target.agentSessionId)
        target.webContents.send("muse:appearance", appearance);
    return { saved: true };
  });
  handle("diagnose", () => muse.diagnose());
  ipcMain.handle("muse:window-theme", (event, colors) => {
    const senderWindow = trustedWindow(
      windows,
      event.sender,
      event.senderFrame,
      securityOptions,
    );
    authorizeAgent(senderWindow, "window-theme", [colors], muse);
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
    appVersion: app.getVersion(),
    storage: services.storageStats(),
    channel: "beta",
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
  handle("resolve-media", (file, id) =>
    services.resolveMedia(String(file), id),
  );
  handle("discard-attachment", (id) => services.discardAttachment(String(id)));
  handle("storage-stats", () => services.storageStats());
  handle("purge-attachments", async (retained = []) => {
    if (
      !Array.isArray(retained) ||
      retained.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid draft attachments.");
    const unused = services.unusedAttachments(retained);
    if (!unused.length) return { removed: 0 };
    const decision = await dialog.showMessageBox(window, {
      type: "question",
      buttons: ["Cancel", "Delete unused copies"],
      defaultId: 0,
      cancelId: 0,
      message: `Delete ${unused.length} unused attachment copies?`,
      detail:
        "Sent attachments, saved drafts, project files and native conversation history are kept.",
    });
    return decision.response === 1
      ? services.purgeAttachments(
          retained,
          unused.map((file) => file.id),
        )
      : { cancelled: true };
  });
  handle("forget-workspace", (root) => {
    saveSettings({
      workspaces: (settings().workspaces || []).filter(
        (value) => value !== root,
      ),
      ...(settings().workspace === root ? { workspace: null } : {}),
    });
    return { workspaces: settings().workspaces || [] };
  });
  handle("export-session", async (id) => {
    const result = await observedSession(id);
    const items =
      result.history?.items || result.history?.snapshot?.state?.items || [];
    const title =
      result.session?.name || result.session?.title || "Muse conversation";
    const content = [
      `# ${title}`,
      `Exported from Muse Desktop ${app.getVersion()}`,
      ...items
        .filter((item) => !item.retracted)
        .map((item) => {
          const text =
            item.text ||
            item.visibleOutput ||
            item.result?.summary ||
            (Array.isArray(item.summary)
              ? item.summary.join("\n")
              : item.summary) ||
            "";
          return `## ${item.kind === "userMessage" ? "You" : item.kind === "agentMessage" ? "Muse" : item.tool || item.kind}\n\n${text}`;
        }),
    ].join("\n\n");
    const selected = await dialog.showSaveDialog(window, {
      title: "Export conversation",
      defaultPath: `${
        String(title)
          .replace(/[^a-z0-9 _-]/gi, "")
          .slice(0, 80) || "Muse-conversation"
      }.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (selected.canceled || !selected.filePath) return { cancelled: true };
    fs.writeFileSync(selected.filePath, content);
    return { saved: true };
  });
  handle("open-local", async (value) => {
    const file = localPath(value, false);
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
    const record = await muse.query("session/read", {
      sessionId: agent.sessionId,
      excludeItems: true,
    });
    const parent =
      muse.parents.get(agent.sessionId) ||
      record.session?.parentSessionId ||
      "";
    if (agent.parentSessionId && agent.parentSessionId !== parent)
      throw new Error("Invalid agent parent identity.");
    createWindow({ sessionId: agent.sessionId, parentSessionId: parent });
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
  handle("subscribe-session", (id) => {
    muse.pinSession(id);
    return muse.query("view/subscribe", { sessionId: id });
  });
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
  handle("open-cli", (context) => openCli(false, context));
  handle("terminal-start", async (size = {}) => {
    const account = await muse.account();
    if (["apiKey", "envKey"].includes(account.state))
      throw new Error(
        "Sign in with a Muse account before using subscription mode in the terminal.",
      );
    const selectedCwd = size.sessionId
      ? await muse.workspaceForSession(size.sessionId)
      : size.workspaceRoot || app.getPath("home");
    const result = terminal.start(
      muse.executable(),
      selectedCwd,
      process.env,
      Math.max(2, Math.min(500, size.cols || 100)),
      Math.max(2, Math.min(500, size.rows || 30)),
    );
    if (!result.reused) terminal.sessionId = size.sessionId || "";
    return { ...result, selectedCwd, sessionId: terminal.sessionId };
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
    if ([...new Set(muse.sessions.values())].some((host) => host.inFlight))
      throw new Error(
        "Wait for the running operation before changing the CLI.",
      );
    for (const id of muse.sessions.keys()) {
      const snapshot = await muse.query("session/read", {
        sessionId: id,
        excludeItems: false,
      });
      if (
        snapshot.session?.activeTurnId ||
        (
          snapshot.history?.items ||
          snapshot.history?.snapshot?.state?.items ||
          []
        ).some(
          (item) =>
            item.status === "inProgress" &&
            ["subagent", "workflow", "userShell"].includes(item.kind),
        )
      )
        throw new Error(
          "Stop running turns and agents before changing the CLI.",
        );
    }
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
  handle("pick-workspace", async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose a project folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle(
    "system-fonts",
    () =>
      new Promise((resolve, reject) => {
        const windows = process.platform === "win32";
        const child = spawn(
          windows ? "powershell.exe" : "fc-list",
          windows
            ? [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; @((New-Object System.Drawing.Text.InstalledFontCollection).Families.Name | Sort-Object -Unique) | ConvertTo-Json -Compress",
              ]
            : ["--format", "%{family}\\n"],
          { windowsHide: true },
        );
        let output = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Font discovery timed out."));
        }, 10000);
        child.stdout.on("data", (data) => {
          if (output.length < 1024 * 1024) output += data;
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code !== 0)
            return reject(new Error("Cannot read installed fonts."));
          try {
            const fonts = windows
              ? JSON.parse(output.replace(/^\uFEFF/, ""))
              : output.split(/[\n,]/);
            resolve(
              [
                ...new Set(
                  (Array.isArray(fonts) ? fonts : [fonts])
                    .map((font) => String(font).trim())
                    .filter(Boolean),
                ),
              ].sort(),
            );
          } catch (error) {
            reject(error);
          }
        });
      }),
  );
  handle("agent-available", async (id) => {
    try {
      const result = await muse.query("session/read", {
        sessionId: String(id),
        excludeItems: true,
      });
      return !!result.session;
    } catch {
      return false;
    }
  });
  handle("start-session", async (options = {}) => {
    if (options.workspaceRoot) {
      const connected = await muse.chooseWorkspace(
        String(options.workspaceRoot),
      );
      saveSettings({
        workspace: connected.workspace,
        workspaces: [
          ...new Set([...(settings().workspaces || []), connected.workspace]),
        ],
      });
    } else if (options.noFolder) {
      muse.workspace = null;
      saveSettings({ workspace: null });
    }
    return muse.startSession(options);
  });
  handle("resume-session", (id) => observedSession(id, true));
  handle("read-session", (id) => observedSession(id));
  handle("view-page", async (id, cursor) => {
    const page = await muse.query("view/page", {
      sessionId: id,
      direction: "backward",
      limit: 500,
      ...(cursor ? { cursor } : {}),
    });
    for (const event of page.events || [])
      services.observeItems(id, event.params?.item ? [event.params.item] : []);
    return page;
  });
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
