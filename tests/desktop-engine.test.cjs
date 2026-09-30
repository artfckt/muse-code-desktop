const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DesktopEngine } = require("../electron/desktop-engine.cjs");
const {
  DesktopServices,
  localPath,
} = require("../electron/desktop-services.cjs");
function fixture() {
  const hosts = [];
  const engine = new DesktopEngine({
    hostFactory: (options) => {
      const host = {
        options,
        workspace: "",
        closed: false,
        query: async () => ({
          session: { activeTurnId: null },
          history: { items: [] },
        }),
        command: async (method, params) => ({
          session: { sessionId: params.sessionId },
        }),
        close: async () => {
          host.closed = true;
        },
        startSession: async (opts) => {
          host.startOptions = opts;
          return { sessionId: `chat-${hosts.indexOf(host)}` };
        },
        sendTurn: async (payload) => ({ commandId: payload.sessionId }),
      };
      hosts.push(host);
      return host;
    },
  });
  engine.workspace = "workspace";
  return { engine, hosts };
}
test("YOLO uses an isolated unsandboxed host and never changes another chat", async () => {
  const { engine, hosts } = fixture();
  const standard = await engine.startSession();
  const yolo = await engine.startSession({ permissionProfile: "yolo" });
  assert.deepEqual(hosts[1].options.args, ["serve"]);
  assert.deepEqual(hosts[2].options.args, [
    "serve",
    "--disable-sandbox",
    "--trust-workspace",
  ]);
  assert.equal(hosts[2].startOptions.approvalMode, "allowAll");
  await engine.setPermissions(yolo.sessionId, "readonly", "onRequest");
  assert.equal(hosts[1].closed, false);
  assert.equal(hosts[2].closed, true);
  assert.deepEqual(hosts[3].options.args, [
    "serve",
    "--disable-write",
    "--disable-shell",
  ]);
  assert.equal(
    (await engine.sendTurn({ sessionId: standard.sessionId })).commandId,
    standard.sessionId,
  );
});
test("active turns, agents and invalid profiles cannot restart a host", async () => {
  const { engine, hosts } = fixture();
  const { sessionId } = await engine.startSession();
  hosts[1].query = async () => ({ session: { activeTurnId: "active" } });
  await assert.rejects(
    engine.setPermissions(sessionId, "yolo", "allowAll"),
    /Stop the running/,
  );
  hosts[1].query = async () => ({
    session: {},
    history: { items: [{ kind: "subagent", status: "inProgress" }] },
  });
  await assert.rejects(
    engine.setPermissions(sessionId, "yolo", "allowAll"),
    /Stop the running/,
  );
  await assert.rejects(
    engine.setPermissions(sessionId, "unknown", "allowAll"),
    /Unknown/,
  );
  assert.equal(hosts[1].closed, false);
});
test("global history paginates and native children use the parent's engine", async () => {
  const { engine, hosts } = fixture();
  hosts[0].query = async (method, params) => {
    assert.equal(params.workspaceRoot, undefined);
    return params.cursor
      ? { sessions: [{ sessionId: "b" }], nextCursor: null }
      : { sessions: [{ sessionId: "a" }], nextCursor: "page-2" };
  };
  assert.deepEqual(
    (await engine.listSessions()).sessions.map((row) => row.sessionId),
    ["a", "b"],
  );
  const { sessionId } = await engine.startSession();
  engine.registerChildren(
    { history: { items: [{ childSessionId: "child" }] } },
    sessionId,
  );
  assert.equal(engine.hostFor("child"), hosts[1]);
  await assert.rejects(
    engine.setPermissions("child", "yolo", "allowAll"),
    /inherit/,
  );
});
test("subscription observations from a chat survive refreshing the control host", async () => {
  const { engine, hosts } = fixture();
  await engine.startSession();
  hosts[0].query = async () => ({});
  const usage = { observedAtMs: 1000, window: { usedPercent: 40 } };
  hosts[1].options.emit("muse:event", {
    method: "usage/changed",
    params: usage,
  });
  assert.deepEqual((await engine.query("usage/read")).usage, usage);
  hosts[0].query = async () => ({
    usage: { observedAtMs: 999, window: { usedPercent: 20 } },
  });
  assert.deepEqual((await engine.query("usage/read")).usage, usage);
  engine.publish("muse:event", {
    method: "account/loginCompleted",
    params: { outcome: "granted" },
  });
  assert.equal(engine.latestUsage, null);
});
test("media is retained per command, streams ranges, and rejects non-media files", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "muse-media-test-"));
  try {
    const service = new DesktopServices(directory, {});
    const image = service.saveAttachment({
      name: "reference.png",
      mediaType: "image/png",
      base64Data: Buffer.from("media-fixture").toString("base64"),
    });
    service.rememberMedia("chat", "command", [image.id]);
    const reopened = new DesktopServices(directory, {});
    assert.equal(
      reopened.sessionMedia("chat").command[0].name,
      "reference.png",
    );
    const response = await reopened.serveMedia(
      new Request(image.url, { headers: { range: "bytes=1-4" } }),
    );
    assert.equal(response.status, 206);
    assert.equal(await response.text(), "edia");
    assert.equal(
      (
        await reopened.serveMedia(
          new Request(
            `muse-media://local/?path=${encodeURIComponent(__filename)}`,
          ),
        )
      ).status,
      415,
    );
    await assert.rejects(
      async () =>
        reopened.saveAttachment({ mediaType: "text/html", base64Data: "YQ==" }),
      /Unsupported/,
    );
    if (process.platform === "win32")
      assert.equal(
        localPath("/E:/Danny/Project%20%28Ruby%29/file.py"),
        "E:\\Danny\\Project (Ruby)\\file.py",
      );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("images from pre-desktop native logs are recovered without replacing saved video", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "muse-legacy-media-"),
  );
  try {
    const log = path.join(directory, "native.jsonl");
    fs.writeFileSync(
      log,
      JSON.stringify({
        payload: {
          kind: "command_intake",
          record: {
            command_id: "old-command",
            command: {
              payload: {
                attachments: [
                  {
                    kind: "image",
                    value: { media_type: "image/png", base64_data: "YQ==" },
                  },
                ],
              },
            },
          },
        },
      }),
    );
    const services = new DesktopServices(directory, {
      query: async () => ({ session: { path: log } }),
    });
    const recovered = await services.recoverMedia("old-chat");
    assert.equal(recovered["old-command"][0].mediaType, "image/png");
    const video = services.saveAttachment({
      name: "clip.mp4",
      mediaType: "video/mp4",
      base64Data: "Yg==",
    });
    services.rememberMedia("old-chat", "old-command", [video.id]);
    assert.equal(
      (await services.recoverMedia("old-chat"))["old-command"][0].mediaType,
      "video/mp4",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "real native engines keep concurrent chats isolated and resume after permission changes",
  { skip: !process.env.MUSE_TEST_BINARY, timeout: 45000 },
  async () => {
    const { MuseHost } = require("../electron/muse-host.cjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "muse-engine-echo-"));
    const config = path.join(root, ".config", "muse");
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(
      path.join(config, "settings.json"),
      JSON.stringify({ schema_version: 1, provider: "echo" }),
    );
    const events = [];
    const engine = new DesktopEngine({
      binary: process.env.MUSE_TEST_BINARY,
      home: root,
      env: {
        ...process.env,
        HOME: root,
        USERPROFILE: root,
        XDG_CONFIG_HOME: path.join(root, ".config"),
        TBH_CREDENTIAL_BACKEND: "file",
        TBH_DISABLE_TELEMETRY: "1",
      },
      emit: (channel, event) => {
        if (channel === "muse:event") events.push(event);
      },
      hostFactory: (options) => {
        const host = new MuseHost(options);
        host.requireSubscription = async () => ({});
        return host;
      }, // Only isolated echo provider; no paid requests.
    });
    try {
      await engine.chooseWorkspace(root);
      const one = await engine.startSession({ permissionProfile: "yolo" });
      const two = await engine.startSession();
      await Promise.all([
        engine.sendTurn({ sessionId: one.sessionId, text: "one" }),
        engine.sendTurn({ sessionId: two.sessionId, text: "two" }),
      ]);
      const deadline = Date.now() + 10000;
      while (
        events.filter((event) => event.method === "turn/completed").length <
          2 &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(
        events.filter((event) => event.method === "turn/completed").length,
        2,
      );
      const old = engine.hostFor(one.sessionId);
      await engine.setPermissions(one.sessionId, "readonly", "onRequest");
      assert.notEqual(engine.hostFor(one.sessionId), old);
      const read = await engine.query("session/read", {
        sessionId: one.sessionId,
        excludeItems: false,
      });
      assert.ok(
        read.history.items.some((item) => item.kind === "agentMessage"),
      );
      assert.equal(engine.hostFor(two.sessionId).profile, "standard");
      assert.ok(
        (await engine.listSessions()).sessions.some(
          (row) => row.sessionId === one.sessionId,
        ),
      );
    } finally {
      await engine.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
