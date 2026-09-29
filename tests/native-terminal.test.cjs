const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { NativeTerminal } = require("../electron/native-terminal.cjs");

test(
  "real native Muse terminal preserves its trust prompt and accepts keyboard input",
  {
    skip: !process.env.MUSE_TEST_BINARY,
    timeout: 20000,
  },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "muse-native-test-"));
    const config = path.join(home, ".config", "muse");
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(
      path.join(config, "settings.json"),
      JSON.stringify({ schema_version: 1, provider: "echo" }),
    );
    let output = "";
    let responded = false;
    const terminal = new NativeTerminal((channel, data) => {
      if (channel !== "muse:terminal-data") return;
      output += data;
      if (data.includes("\x1b[6n")) terminal.write("\x1b[1;1R");
      if (!responded && output.includes("Do you trust this workspace?")) {
        responded = true;
        terminal.write("\r");
      }
    });
    try {
      const env = {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        TBH_CREDENTIAL_BACKEND: "file",
        TBH_DISABLE_TELEMETRY: "1",
      };
      terminal.start(process.env.MUSE_TEST_BINARY, home, env, 120, 30);
      const deadline = Date.now() + 12000;
      while (!responded && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(
        responded,
        "real CLI renders the native workspace trust prompt",
      );
      const first = terminal.process;
      terminal.resize(100, 32);
      assert.equal(
        terminal.start(process.env.MUSE_TEST_BINARY, home, env).reused,
        true,
      );
      assert.equal(
        terminal.process,
        first,
        "switching views retains the native process",
      );
      assert.ok(terminal.buffer.includes("Trust and continue"));
    } finally {
      terminal.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  },
);
