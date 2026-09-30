const { MuseHost } = require("./muse-host.cjs");

const profiles = {
  standard: ["serve"],
  readonly: ["serve", "--disable-write", "--disable-shell"],
  yolo: ["serve", "--disable-sandbox", "--trust-workspace"],
};

// Sandbox posture belongs to a host process. Give each root chat its own host
// so changing one chat's permissions never changes another running chat.
class DesktopEngine {
  constructor(options = {}) {
    this.options = options;
    this.workspace = null;
    this.binary = options.binary;
    this.sessions = new Map();
    this.owners = new Map();
    this.policies = { ...(options.policies || {}) };
    this.latestUsage = null;
    this.makeHost = options.hostFactory || ((options) => new MuseHost(options));
    this.control = this.makeHost({
      ...options,
      emit: (channel, payload) => this.publish(channel, payload),
    });
  }
  publish(channel, payload) {
    if (
      channel === "muse:event" &&
      payload?.method === "usage/changed" &&
      payload.params?.observedAtMs
    ) {
      if (
        !this.latestUsage ||
        payload.params.observedAtMs >= this.latestUsage.observedAtMs
      )
        this.latestUsage = payload.params;
    }
    if (
      channel === "muse:event" &&
      payload?.method === "account/loginCompleted" &&
      payload.params?.outcome === "granted"
    )
      this.latestUsage = null;
    this.options.emit?.(channel, payload);
  }
  get home() {
    return this.control.home;
  }
  get host() {
    return this.control.host;
  }
  executable() {
    return this.control.executable();
  }
  account() {
    return this.control.account();
  }
  connect() {
    return this.control.connect();
  }
  async diagnose() {
    return { ...(await this.control.diagnose()), workspace: this.workspace };
  }
  async chooseWorkspace(root) {
    const result = await this.control.chooseWorkspace(root);
    this.workspace = result.workspace;
    return result;
  }
  newHost(profile = "standard") {
    if (!profiles[profile]) throw new Error("Unknown permission profile.");
    let owner;
    const host = this.makeHost({
      ...this.options,
      binary: this.binary,
      args: profiles[profile],
      emit: (channel, payload) => {
        const item = payload?.params?.item;
        if (item?.childSessionId && owner)
          this.owners.set(item.childSessionId, owner);
        this.publish(
          channel,
          channel === "muse:host-exit"
            ? { ...payload, sessionId: owner }
            : payload,
        );
      },
    });
    host.profile = profile;
    host.setOwner = (id) => {
      owner = id;
    };
    return host;
  }
  hostFor(id) {
    return this.sessions.get(this.owners.get(id) || id);
  }
  registerChildren(result, parent) {
    for (const item of result?.history?.items ||
      result?.history?.snapshot?.state?.items ||
      []) {
      if (item.childSessionId)
        this.owners.set(item.childSessionId, this.owners.get(parent) || parent);
      for (const child of item.children || [])
        if (child.childSessionId)
          this.owners.set(
            child.childSessionId,
            this.owners.get(parent) || parent,
          );
    }
  }
  async query(method, params = {}) {
    const result = await (this.hostFor(params.sessionId) || this.control).query(
      method,
      params,
    );
    this.registerChildren(result, params.sessionId);
    if (method === "usage/read") {
      if (
        result.usage?.observedAtMs &&
        (!this.latestUsage ||
          result.usage.observedAtMs >= this.latestUsage.observedAtMs)
      )
        this.latestUsage = result.usage;
      return this.latestUsage ? { ...result, usage: this.latestUsage } : result;
    }
    return result;
  }
  async command(method, params = {}) {
    if (method === "session/resume" && !this.hostFor(params.sessionId)) {
      const host = this.newHost(this.policies[params.sessionId] || "standard");
      host.setOwner(params.sessionId);
      try {
        const result = await host.command(method, params);
        this.sessions.set(params.sessionId, host);
        this.registerChildren(result, params.sessionId);
        return { ...result, permissionProfile: host.profile };
      } catch (error) {
        await host.close();
        throw error;
      }
    }
    const host = this.hostFor(params.sessionId) || this.control;
    const result = await host.command(method, params);
    this.registerChildren(
      result,
      result.session?.sessionId || params.sessionId,
    );
    if (method === "session/fork" && result.session?.sessionId) {
      this.sessions.set(result.session.sessionId, host);
      this.policies[result.session.sessionId] = host.profile || "standard";
      this.options.savePolicies?.(this.policies);
    }
    return method === "session/resume"
      ? { ...result, permissionProfile: host.profile || "standard" }
      : result;
  }
  async startSession(options = {}) {
    const profile = options.permissionProfile || "standard";
    const host = this.newHost(profile);
    host.workspace = this.workspace;
    try {
      const result = await host.startSession({
        ...options,
        approvalMode: profile === "yolo" ? "allowAll" : options.approvalMode,
      });
      host.setOwner(result.sessionId);
      this.sessions.set(result.sessionId, host);
      this.policies[result.sessionId] = profile;
      this.options.savePolicies?.(this.policies);
      return { ...result, permissionProfile: profile };
    } catch (error) {
      await host.close();
      throw error;
    }
  }
  async sendTurn(payload) {
    const host = this.hostFor(payload.sessionId);
    if (!host)
      throw new Error("Resume the conversation before sending a message.");
    return host.sendTurn(payload);
  }
  async setPermissions(id, profile, mode) {
    if (!profiles[profile]) throw new Error("Unknown permission profile.");
    const current = this.hostFor(id);
    if (this.owners.has(id))
      throw new Error(
        "Child agents inherit their parent's permission profile.",
      );
    const snapshot = await this.query("session/read", {
      sessionId: id,
      excludeItems: false,
    });
    const items =
      snapshot.history?.items || snapshot.history?.snapshot?.state?.items || [];
    if (
      snapshot.session?.activeTurnId ||
      items.some(
        (item) =>
          ["subagent", "workflow", "userShell"].includes(item.kind) &&
          item.status === "inProgress",
      )
    )
      throw new Error(
        "Stop the running turn and its agents before changing the sandbox profile.",
      );
    // Forks sharing a host must first release that host's leases together.
    const siblings = [...this.sessions.entries()].filter(
      ([, host]) => host === current && current,
    );
    if (current && profile !== current.profile && siblings.length > 1)
      throw new Error(
        "This fork shares its engine with another chat. Use the chosen profile in a new conversation.",
      );
    if (!current || profile !== current.profile) {
      if (current) await current.close();
      const host = this.newHost(profile);
      host.setOwner(id);
      this.sessions.set(id, host);
      try {
        await host.command("session/resume", {
          sessionId: id,
          excludeItems: true,
        });
      } catch (error) {
        this.sessions.delete(id);
        await host.close();
        throw error;
      }
      this.policies[id] = profile;
      this.options.savePolicies?.(this.policies);
    }
    const result = await this.command("session/setApprovalMode", {
      sessionId: id,
      mode: profile === "yolo" ? "allowAll" : mode || "onRequest",
    });
    return { ...result, permissionProfile: profile };
  }
  async listSessions() {
    const sessions = [];
    const seen = new Set();
    let cursor;
    do {
      const result = await this.control.query("session/list", {
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      for (const row of result.sessions || [])
        if (!seen.has(row.sessionId)) {
          seen.add(row.sessionId);
          sessions.push({
            ...row,
            permissionProfile: this.policies[row.sessionId] || "standard",
          });
        }
      if (result.nextCursor === cursor) break;
      cursor = result.nextCursor;
    } while (cursor);
    return { sessions };
  }
  async close() {
    await Promise.allSettled(
      [...new Set([this.control, ...this.sessions.values()])].map((host) =>
        host.close(),
      ),
    );
    this.sessions.clear();
    this.owners.clear();
  }
  async setBinary(binary) {
    await this.close();
    this.binary = binary;
    this.control.binary = binary;
  }
}
module.exports = { DesktopEngine, profiles };
