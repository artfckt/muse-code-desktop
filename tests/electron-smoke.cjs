const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
(async () => {
  const packaged = process.env.MUSE_PACKAGED_EXE;
  const isolatedHome = process.env.MUSE_TEST_BINARY
    ? fs.mkdtempSync(path.join(os.tmpdir(), "muse-electron-smoke-"))
    : null;
  const env = { ...process.env };
  const desktopData = fs.mkdtempSync(
    path.join(os.tmpdir(), "muse-desktop-smoke-data-"),
  );
  env.MUSE_DESKTOP_DATA_DIR = desktopData;
  if (isolatedHome) {
    const config = path.join(isolatedHome, ".config", "muse");
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(
      path.join(config, "settings.json"),
      JSON.stringify({ schema_version: 1, provider: "echo" }),
    );
    Object.assign(env, {
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
      TBH_CREDENTIAL_BACKEND: "file",
      TBH_DISABLE_TELEMETRY: "1",
      MUSE_BINARY: process.env.MUSE_TEST_BINARY,
    });
  }
  const platformArgs =
    process.platform === "linux" && process.getuid?.() === 0
      ? ["--no-sandbox"]
      : [];
  const application = await electron.launch(
    packaged
      ? { executablePath: path.resolve(packaged), args: platformArgs, env }
      : { args: [...platformArgs, process.cwd()], env },
  );
  try {
    const window = await application.firstWindow();
    await window.waitForSelector(".app-shell", { timeout: 20000 });
    assert.equal(
      await window.evaluate(() => typeof globalThis.muse?.login),
      "function",
      "sandboxed preload exposes native Muse bridge",
    );
    assert.equal(
      await window.evaluate(() => typeof globalThis.muse?.answerInput),
      "function",
    );
    for (const method of [
      "pickWorkspace",
      "systemFonts",
      "agentAvailable",
      "commands",
      "mcpInventory",
      "saveAttachment",
      "sessionMedia",
      "setPermissions",
      "openAgent",
      "openConversation",
      "agentControl",
      "notify",
    ])
      assert.equal(
        await window.evaluate(
          (method) => typeof globalThis.muse[method],
          method,
        ),
        "function",
      );
    const fonts = await window.evaluate(() => globalThis.muse.systemFonts());
    assert.ok(
      Array.isArray(fonts),
      "native installed font discovery returns a list",
    );
    if (process.platform === "win32") assert.ok(fonts.includes("Segoe UI"));
    const media = await window.evaluate(() =>
      globalThis.muse.saveAttachment({
        name: "probe.png",
        mediaType: "image/png",
        base64Data:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GZAAAAAASUVORK5CYII=",
      }),
    );
    assert.equal(
      await window.evaluate(
        (url) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth);
            img.onerror = () => resolve(0);
            img.src = url;
          }),
        media.url,
      ),
      1,
      "packaged local media protocol decodes persisted image",
    );
    const blocked = await application.evaluate(
      async ({ BrowserWindow, app }, media) => {
        const path = process.getBuiltinModule("node:path");
        const attacker = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        await attacker.loadURL(
          "data:text/html,<title>Isolated security probe</title>",
        );
        const probes = await attacker.webContents.executeJavaScript(
          `Promise.all(${JSON.stringify([media.url, `muse-media://local/?path=${encodeURIComponent(media.path)}`])}.map(async url => { try { const response = await fetch(url); return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }; } catch { return { blocked: true }; } }))`,
        );
        attacker.destroy();
        const unknown = new BrowserWindow({
          show: false,
          webPreferences: {
            preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        await unknown.loadFile(
          path.join(app.getAppPath(), "dist", "index.html"),
        );
        const ipc = await unknown.webContents.executeJavaScript(
          "window.muse.listSessions().then(() => false, error => /Untrusted/.test(error.message))",
        );
        unknown.destroy();
        return { probes, ipc };
      },
      media,
    );
    assert.ok(
      blocked.probes.every((probe) => probe.blocked || probe.status >= 400),
      "unknown data origin cannot read local media, including copied capabilities",
    );
    assert.equal(
      blocked.ipc,
      true,
      "even the same renderer document in an unregistered window cannot call IPC",
    );
    const productionPolicy = await window
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    assert.match(productionPolicy, /script-src 'self';/);
    assert.match(productionPolicy, /frame-src 'none'/);
    assert.ok(
      await window
        .getByRole("heading", { name: "Make room for your next idea." })
        .isVisible(),
    );
    const diagnostic = await window.evaluate(() => globalThis.muse.diagnose());
    assert.equal(typeof diagnostic.cliInstalled, "boolean");
    await window.getByRole("button", { name: /^Settings/ }).click();
    await window.locator('.theme-choice:has(input[value="paper"])').click();
    assert.equal(
      await window.locator("html").getAttribute("data-theme"),
      "paper",
    );
    await window.getByRole("button", { name: "Close dialog" }).click();
    await window.evaluate(() =>
      globalThis.muse.setWindowTheme({
        background: "#f7f3eb",
        foreground: "#302b26",
      }),
    );
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.getBackgroundColor().toLowerCase() !== "#f7f3eb")
        throw new Error("Native window theme was not applied");
    });
    await window.getByRole("button", { name: /^Settings/ }).click();
    await window.locator('.theme-choice:has(input[value="muse"])').click();
    await window.getByRole("button", { name: "Close dialog" }).click();
    if (process.env.MUSE_TEST_BINARY) {
      await application.evaluate(({ app }) => {
        const { createRequire } = process.getBuiltinModule("node:module");
        const path = process.getBuiltinModule("node:path");
        // The isolated echo provider has no account or paid requests.
        createRequire(path.join(app.getAppPath(), "package.json"))(
          "./electron/muse-host.cjs",
        ).MuseHost.prototype.requireSubscription = async () => ({});
      });
      await window.evaluate(
        (root) => globalThis.muse.connectWorkspace(root),
        isolatedHome,
      );
      const session = await window.evaluate(() =>
        globalThis.muse.startSession({ permissionProfile: "yolo" }),
      );
      await window.evaluate(async () => {
        localStorage.setItem(
          "private-isolation-marker",
          "SYNTHETIC_OTHER_SESSION",
        );
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open("muse-desktop-drafts", 2);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("drafts");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("drafts", "readwrite");
          transaction
            .objectStore("drafts")
            .put(
              {
                text: "SYNTHETIC_OTHER_SESSION",
                images: [{ frames: [{ base64Data: "SYNTHETIC_BYTES" }] }],
              },
              "isolation-probe",
            );
          transaction.oncomplete = resolve;
          transaction.onerror = reject;
        });
        database.close();
      });
      await window.evaluate(
        async ({ id, attachment }) =>
          globalThis.muse.sendTurn({
            sessionId: id,
            text: "Synthetic media isolation check",
            attachmentIds: [attachment],
            images: [],
          }),
        { id: session.sessionId, attachment: media.id },
      );
      const opened = application.waitForEvent("window");
      await window.evaluate(
        (sessionId) => globalThis.muse.openAgent({ sessionId }),
        session.sessionId,
      );
      const agentWindow = await opened;
      await agentWindow.waitForSelector(".agent-window", { timeout: 15000 });
      assert.equal(await agentWindow.locator(".agent-window h2").count(), 1);
      assert.equal(
        await agentWindow.evaluate(() =>
          globalThis.muse.usage().then(
            () => false,
            (error) => /cannot perform/.test(error.message),
          ),
        ),
        true,
        "agent cannot read global account usage",
      );
      assert.equal(
        await agentWindow.evaluate(() =>
          globalThis.muse.readSession("another-session").then(
            () => false,
            (error) => /cannot perform/.test(error.message),
          ),
        ),
        true,
        "agent cannot read another session",
      );
      assert.ok(await agentWindow.locator(".beta-badge").isVisible());
      assert.equal(
        await agentWindow.evaluate(() =>
          localStorage.getItem("private-isolation-marker"),
        ),
        null,
        "agent storage cannot see main preferences or drafts",
      );
      const sharedDraft = await agentWindow.evaluate(async () => {
        const request = indexedDB.open("muse-desktop-drafts", 2);
        const database = await new Promise((resolve, reject) => {
          request.onupgradeneeded = () =>
            request.result.createObjectStore("drafts");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const values = await new Promise((resolve, reject) => {
          const read = database
            .transaction("drafts")
            .objectStore("drafts")
            .getAll();
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        });
        database.close();
        return values;
      });
      assert.deepEqual(
        sharedDraft,
        [],
        "agent IndexedDB cannot read another session's draft bytes",
      );
      const agentMedia = await agentWindow.evaluate(async (id) => {
        const media = await globalThis.muse.sessionMedia(id);
        const entry = Object.values(media).flat()[0];
        if (!entry) return 0;
        return new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image.naturalWidth);
          image.onerror = () => resolve(0);
          image.src = entry.url;
        });
      }, session.sessionId);
      assert.equal(
        agentMedia,
        1,
        "agent partition serves only its own granted attachment",
      );
      await agentWindow.close();
      await window
        .getByRole("button", { name: "Muse CLI Native", exact: true })
        .click();
      await window.waitForSelector(".terminal-canvas .xterm");
      await window.waitForFunction(
        () =>
          document
            .querySelector(".xterm-rows")
            ?.textContent.includes("trust this workspace"),
        undefined,
        { timeout: 15000 },
      );
      await window.locator(".xterm-helper-textarea").press("Enter");
      await window
        .getByRole("button", { name: "Conversation", exact: true })
        .click();
      assert.equal(await window.locator(".terminal-canvas .xterm").count(), 1);
    }
    if (process.platform === "win32") {
      const prebuiltBindings = await application.evaluate(({ app }) => {
        const { createRequire } = process.getBuiltinModule("node:module");
        const path = process.getBuiltinModule("node:path");
        const appRequire = createRequire(
          path.join(app.getAppPath(), "package.json"),
        );
        return ["conpty", "conpty_console_list", "pty"].map((name) => ({
          name,
          exports: Object.keys(
            appRequire(`node-pty/prebuilds/win32-x64/${name}.node`),
          ),
        }));
      });
      assert.ok(
        prebuiltBindings.every((binding) => binding.exports.length > 0),
        "Windows N-API prebuilds used by the VPS installer load in Electron",
      );
    }
    const terminalOutput = await application.evaluate(
      ({ app }) =>
        new Promise((resolve, reject) => {
          const { createRequire } = process.getBuiltinModule("node:module");
          const path = process.getBuiltinModule("node:path");
          const pty = createRequire(
            path.join(app.getAppPath(), "package.json"),
          )("node-pty");
          const windows = process.platform === "win32";
          // Keep the shell alive until ConPTY has delivered its output.
          // A short-lived --version process may exit before Windows flushes it.
          const terminal = pty.spawn(
            windows ? "cmd.exe" : "/bin/sh",
            windows ? ["/d", "/q"] : [],
            {
              name: "xterm-256color",
              cols: 80,
              rows: 24,
              cwd: app.getPath("home"),
              env: { ...process.env },
            },
          );
          let output = "";
          const timer = setTimeout(() => {
            terminal.kill();
            reject(new Error("Native PTY timed out"));
          }, 10000);
          terminal.onData((data) => {
            output += data;
            if (output.includes("MUSE_PTY_OK")) {
              clearTimeout(timer);
              terminal.kill();
              resolve(output);
            }
          });
          terminal.onExit(() => {
            clearTimeout(timer);
            resolve(output);
          });
          terminal.write(`echo MUSE_PTY_OK${windows ? "\r" : "\n"}`);
        }),
    );
    assert.match(
      String(terminalOutput),
      /MUSE_PTY_OK/,
      "Electron can load the packaged native PTY binding",
    );
    console.log(
      `${packaged ? "Packaged" : "Development"} Electron renderer, sandboxed native preload and native PTY passed.`,
    );
  } finally {
    await application.close();
    if (isolatedHome) fs.rmSync(isolatedHome, { recursive: true, force: true });
    fs.rmSync(desktopData, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
