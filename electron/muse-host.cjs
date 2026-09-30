const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const execute = promisify(require("node:child_process").execFile);

// Preserve the CLI home, keychain and backend. Never silently bill an ambient key.
function subscriptionEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => key.toUpperCase() !== "META_API_KEY",
    ),
  );
}
function findMuseBinary({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  override,
  exists = fs.existsSync,
  read = fs.readFileSync,
} = {}) {
  const selected = override || env.MUSE_BINARY;
  if (selected) {
    if (!exists(selected))
      throw new Error(
        "Selected Muse executable is missing. Choose it again in Settings.",
      );
    return selected;
  }
  const windows = platform === "win32";
  const dirs = [
    env.MUSE_INSTALL_DIR,
    windows &&
      env.LOCALAPPDATA &&
      path.join(env.LOCALAPPDATA, "Programs", "muse"),
    path.join(home, ".local", "bin"),
    path.join(home, ".muse", "bin"),
    !windows && "/usr/local/bin",
    !windows && "/opt/homebrew/bin",
    ...(env.Path || env.PATH || "").split(windows ? ";" : ":"),
  ].filter(Boolean);
  for (const dir of [...new Set(dirs)]) {
    try {
      const version = String(
        read(path.join(dir, ".muse-version"), "utf8"),
      ).trim();
      if (/^\d+\.\d+\.\d+-R\d+(\.\d+)?$/.test(version)) {
        const binary = path.join(
          dir,
          `muse-bin-${version}${windows ? ".exe" : ""}`,
        );
        if (exists(binary)) return binary;
      }
    } catch {
      /* Try the executable instead. */
    }
    const binary = path.join(dir, windows ? "muse.exe" : "muse");
    if (exists(binary)) return binary;
  }
  return windows ? "muse.exe" : "muse";
}
function bounded(promise, label, timeout = 30000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out. The CLI may still be processing it; refresh before submitting again.`,
            ),
          ),
        timeout,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
class MuseHost {
  constructor({
    emit = () => {},
    version = "0.2.0",
    home = os.homedir(),
    env = process.env,
    binary,
    args = ["serve"],
  } = {}) {
    Object.assign(this, { emit, version, home, env, binary, args });
    this.host = null;
    this.workspace = null;
    this.connecting = null;
    this.stderr = [];
    this.generation = 0;
  }
  executable() {
    return findMuseBinary({
      env: this.env,
      home: this.home,
      override: this.binary,
    });
  }
  async connect() {
    if (this.host) return this.host;
    if (this.connecting) return this.connecting;
    this.connecting = this.spawn().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  async spawn() {
    const { spawnMspConnection } = await import("@muse-code/sdk");
    const generation = ++this.generation;
    this.stderr = [];
    const handshake = spawnMspConnection({
      command: this.executable(),
      args: this.args,
      cwd: this.home,
      env: subscriptionEnvironment(this.env),
      shutdownTimeoutMs: 2500,
      onStderr: (chunk) => {
        this.stderr = [...this.stderr, String(chunk)].slice(-12);
        this.emit("muse:stderr", String(chunk));
      },
    });
    // Receipt acknowledgements only. Decisions are separate GUI commands.
    handshake.onServerRequest(async (request) => {
      if (
        request.method === "approval/request" ||
        request.method === "userInput/request"
      ) {
        this.emit("muse:event", {
          method: request.method.replace("/request", "/requested"),
          params: request.params,
        });
        return {};
      }
      throw new Error(`Unsupported Muse server request: ${request.method}`);
    });
    handshake.onNotification((event) => {
      if (generation === this.generation) this.emit("muse:event", event);
    });
    handshake.onProtocolError((error) =>
      this.emit("muse:protocol-error", error.message),
    );
    try {
      const host = await bounded(
        handshake.initialize({
          clientInfo: { name: "muse_desktop", version: this.version },
          capabilities: {
            experimentalApi: true,
            userInputDialogs: true,
            requestedCapabilities: ["userShell", "sessionListStream"],
          },
        }),
        "Starting Muse Code",
      );
      this.host = host;
      host.exited.then(
        (exit) => {
          if (generation !== this.generation) return;
          this.host = null;
          this.emit("muse:host-exit", exit);
        },
        (error) => {
          if (generation !== this.generation) return;
          this.host = null;
          this.emit("muse:host-exit", { error: error.message });
        },
      );
      return host;
    } catch (error) {
      await handshake.close().catch(() => {});
      throw new Error(
        `${error.message}${this.stderr.length ? "\n" + this.stderr.join("").slice(-2000) : ""}`,
      );
    }
  }
  async query(method, params = {}) {
    const host = await this.connect();
    return bounded(
      host.connection.request(method, params),
      method,
      method === "session/list" ? 120000 : 30000,
    );
  }
  async command(method, params = {}) {
    const host = await this.connect();
    return bounded(
      host.connection.command(method, params, { maxAttempts: 1 }),
      method,
    );
  }
  async account() {
    try {
      return await this.query("account/read");
    } catch (error) {
      if (error.code === -32601)
        return {
          state: "unknown",
          credentialRequired: true,
          message: "Update Muse Code for desktop sign-in, or use its terminal.",
        };
      throw error;
    }
  }
  async requireSubscription() {
    const account = await this.account();
    if (account.state === "unknown" && account.credentialRequired)
      throw new Error(
        "Update Muse Code to verify subscription authentication before sending a task.",
      );
    if (account.state === "envKey" || account.state === "apiKey")
      throw new Error(
        "Muse Code is using an API key. Sign in with your Muse account to use the subscription.",
      );
    if (account.state === "loggedOut" && account.credentialRequired)
      throw new Error(
        "Sign in with Muse Code first. Your existing CLI login is reused automatically.",
      );
    return account;
  }
  async diagnose() {
    let installed = false;
    try {
      const binary = this.executable();
      const version = await execute(binary, ["--version"], {
        env: subscriptionEnvironment(this.env),
        cwd: this.home,
        windowsHide: true,
        timeout: 15000,
      });
      installed = true;
      return {
        cliInstalled: true,
        binary,
        version: String(version.stdout || version.stderr).trim(),
        account: await this.account(),
        connected: Boolean(this.host),
        workspace: this.workspace,
        initializeResult: this.host?.initializeResult,
        fingerprintWarning: this.host?.fingerprintWarning,
      };
    } catch (error) {
      return {
        cliInstalled: installed,
        connected: false,
        account: { state: "unknown", credentialRequired: true },
        workspace: this.workspace,
        error: error.message,
      };
    }
  }
  async chooseWorkspace(cwd) {
    const root = path.resolve(cwd);
    if (!fs.statSync(root).isDirectory())
      throw new Error("Choose an existing project folder.");
    await this.connect();
    this.workspace = root;
    return { workspace: root, account: await this.account() };
  }
  async startSession(options = {}) {
    if (!this.workspace) throw new Error("Open a project first.");
    await this.requireSubscription();
    const params = { workspaceRoot: this.workspace };
    if (options.modelId) params.modelId = options.modelId;
    if (options.approvalMode) params.approvalMode = options.approvalMode;
    const result = await this.command("session/start", params);
    if (!result.session?.sessionId)
      throw new Error("Muse did not return a session identity.");
    return { sessionId: result.session.sessionId, raw: result };
  }
  async sendTurn(payload) {
    await this.requireSubscription();
    if (
      !payload.sessionId ||
      (!payload.text?.trim() && !payload.images?.length && !payload.skill)
    )
      throw new Error("Enter a prompt or attach an image.");
    if (payload.reasoningEffort)
      await this.command("session/setReasoningEffort", {
        sessionId: payload.sessionId,
        reasoningEffort: payload.reasoningEffort,
      });
    const input = [{ type: "text", text: payload.text || "" }];
    if (payload.skill)
      input.unshift({
        type: "skill",
        selector: payload.skill.selector,
        arguments: payload.skill.arguments || "",
      });
    for (const image of payload.images || []) {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          image.mediaType,
        ) ||
        typeof image.base64Data !== "string" ||
        image.base64Data.length > 14000000
      )
        throw new Error("Unsupported image or image exceeds 10 MB.");
      input.push({
        type: "image",
        mediaType: image.mediaType,
        base64Data: image.base64Data,
      });
    }
    return this.command("turn/start", {
      sessionId: payload.sessionId,
      input,
      ifBusy: payload.ifBusy || "queue",
    });
  }
  async close() {
    if (this.connecting) await this.connecting.catch(() => {});
    ++this.generation;
    const host = this.host;
    this.host = null;
    await host?.close().catch(() => {});
  }
}
module.exports = { MuseHost, findMuseBinary, subscriptionEnvironment, bounded };
