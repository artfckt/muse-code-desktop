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
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
