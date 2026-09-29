const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const packaged = process.env.MUSE_PACKAGED_EXE;
  const application = await electron.launch(
    packaged
      ? { executablePath: path.resolve(packaged), args: [] }
      : { args: [path.resolve("electron/main.cjs")] },
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
    const terminalOutput = await application.evaluate(
      ({ app }) =>
        new Promise((resolve, reject) => {
          const pty = process.mainModule.require("node-pty");
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
      "Packaged Electron renderer and sandboxed native preload passed.",
    );
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
