const { subscriptionEnvironment } = require("./muse-host.cjs");
class NativeTerminal {
  constructor(emit) {
    this.emit = emit;
    this.process = null;
    this.cwd = null;
    this.buffer = "";
  }
  start(binary, cwd, env, cols = 100, rows = 30) {
    if (this.process)
      return { cwd: this.cwd, buffer: this.buffer, reused: true };
    const pty = require("node-pty");
    this.buffer = "";
    this.cwd = cwd;
    const child = pty.spawn(binary, [], {
      name: "xterm-256color",
      cwd,
      cols,
      rows,
      env: {
        ...subscriptionEnvironment(env),
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });
    this.process = child;
    child.onData((data) => {
      this.buffer = (this.buffer + data).slice(-1024 * 1024);
      this.emit("muse:terminal-data", data);
    });
    child.onExit((exit) => {
      if (this.process !== child) return;
      this.process = null;
      this.emit("muse:terminal-exit", exit);
    });
    return { cwd, buffer: "", reused: false };
  }
  write(data) {
    if (typeof data === "string" && data.length <= 65536)
      this.process?.write(data);
  }
  resize(cols, rows) {
    if (
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols >= 2 &&
      rows >= 2 &&
      cols < 1000 &&
      rows < 1000
    )
      this.process?.resize(cols, rows);
  }
  close() {
    const child = this.process;
    this.process = null;
    try {
      child?.kill();
    } catch {}
  }
}
module.exports = { NativeTerminal };
