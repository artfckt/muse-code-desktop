const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  MuseHost,
  findMuseBinary,
  subscriptionEnvironment,
} = require("../electron/muse-host.cjs");

test("subscription process removes only ambient META_API_KEY and preserves CLI backend", () => {
  const env = {
    META_API_KEY: "never-used",
    HOME: "/existing-user",
    TBH_CREDENTIAL_BACKEND: "keychain",
    PATH: "/bin",
  };
  assert.deepEqual(subscriptionEnvironment(env), {
    HOME: "/existing-user",
    TBH_CREDENTIAL_BACKEND: "keychain",
    PATH: "/bin",
  });
  assert.equal(env.META_API_KEY, "never-used");
});
test("Windows installation is discoverable even when GUI PATH is stale", () => {
  const root = path.join("C:", "Users", "Dan", "AppData", "Local");
  const dir = path.join(root, "Programs", "muse");
  const exe = path.join(dir, "muse-bin-1.4.1-R4503.1.exe");
  assert.equal(
    findMuseBinary({
      platform: "win32",
      home: "/user",
      env: { LOCALAPPDATA: root, PATH: "C:\\Windows" },
      exists: (value) => value === exe,
      read: (value) => {
        if (value === path.join(dir, ".muse-version")) return "1.4.1-R4503.1";
        throw new Error();
      },
    }),
    exe,
  );
});
test("macOS/Linux installation is discoverable outside GUI PATH", () => {
  const exe = path.join("/user", ".local", "bin", "muse");
  assert.equal(
    findMuseBinary({
      platform: "darwin",
      home: "/user",
      env: { PATH: "/usr/bin" },
      exists: (value) => value === exe,
      read: () => {
        throw new Error();
      },
    }),
    exe,
  );
});
test("stored API keys block subscription turns before any mutation", async () => {
  const host = new MuseHost();
  let submitted = false;
  host.account = async () => ({ state: "apiKey", credentialRequired: true });
  host.command = async () => {
    submitted = true;
  };
  await assert.rejects(
    host.sendTurn({ sessionId: "session", text: "hello" }),
    /API key/,
  );
  assert.equal(submitted, false);
});
test("already logged-in account submits through native session with skill/image parts", async () => {
  const host = new MuseHost();
  const calls = [];
  host.account = async () => ({
    state: "accountLogin",
    credentialRequired: true,
  });
  host.command = async (method, params) => {
    calls.push({ method, params });
    return { status: "accepted" };
  };
  await host.sendTurn({
    sessionId: "s",
    text: "Use this reference",
    skill: { selector: "design", arguments: "landing page" },
    images: [{ mediaType: "image/png", base64Data: "YQ==" }],
    reasoningEffort: "high",
  });
  assert.equal(calls[0].method, "session/setReasoningEffort");
  assert.equal(calls[1].method, "turn/start");
  assert.equal(calls[1].params.ifBusy, "queue");
  assert.deepEqual(
    calls[1].params.input.map((part) => part.type),
    ["skill", "text", "image"],
  );
});
test(
  "real Muse Code echo host: handshake, account, turn, resume, models and shutdown",
  { skip: !process.env.MUSE_TEST_BINARY, timeout: 45000 },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "muse-desktop-test-"));
    const workspace = path.join(home, "workspace");
    fs.mkdirSync(workspace);
    const config = path.join(home, ".config", "muse");
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(
      path.join(config, "settings.json"),
      JSON.stringify({ schema_version: 1, provider: "echo" }),
    );
    const events = [];
    const host = new MuseHost({
      binary: process.env.MUSE_TEST_BINARY,
      home,
      env: {
        HOME: home,
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        TBH_CREDENTIAL_BACKEND: "file",
        TBH_DISABLE_TELEMETRY: "1",
        MUSE_EXPERIMENTAL_SDK_ENABLED: "on",
      },
      args: ["serve"],
      emit: (channel, event) => {
        if (channel === "muse:event") events.push(event);
      },
    });
    try {
      const diagnostic = await host.diagnose();
      assert.equal(diagnostic.connected, true, diagnostic.error);
      assert.equal(diagnostic.account.state, "loggedOut");
      host.requireSubscription = async () => diagnostic.account; // Echo test provider has no paid account; production authentication is tested above.
      await host.chooseWorkspace(workspace);
      const { sessionId } = await host.startSession();
      await host.sendTurn({ sessionId, text: "Muse desktop smoke test" });
      const deadline = Date.now() + 10000;
      while (
        !events.some((event) => event.method === "turn/completed") &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok(
        events.some((event) => event.method === "item/delta"),
        "live text deltas received",
      );
      assert.ok(
        events.some(
          (event) =>
            event.method === "turn/completed" &&
            event.params.terminal === "completed",
        ),
      );
      const read = await host.query("session/read", {
        sessionId,
        excludeItems: false,
      });
      assert.ok(
        (read.history.items || read.history.snapshot?.state?.items).some(
          (item) => item.kind === "agentMessage",
        ),
      );
      const list = await host.query("session/list", {
        workspaceRoot: workspace,
      });
      assert.ok(list.sessions.some((row) => row.sessionId === sessionId));
      await host.query("model/list", { sessionId });
      await host.query("skill/list", { sessionId });
      await host.query("approval/listPending", { sessionId });
      await host.close();
      const resumed = await host.command("session/resume", {
        sessionId,
        excludeItems: false,
      });
      assert.equal(resumed.session.sessionId, sessionId);
      const page = await host.query("view/page", {
        sessionId,
        direction: "backward",
        limit: 500,
      });
      assert.ok(page.events.length);
    } finally {
      await host.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  },
);
