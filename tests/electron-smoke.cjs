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
          const terminal = pty.spawn(process.execPath, ["--version"], {
            name: "xterm-256color",
            cols: 80,
            rows: 24,
            cwd: app.getPath("home"),
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          });
          let output = "";
          const timer = setTimeout(() => {
            terminal.kill();
            reject(new Error("Native PTY timed out"));
          }, 10000);
          terminal.onData((data) => {
            output += data;
          });
          terminal.onExit(() => {
            clearTimeout(timer);
            resolve(output);
          });
        }),
    );
    assert.match(
      String(terminalOutput),
      /v\d+\./,
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
