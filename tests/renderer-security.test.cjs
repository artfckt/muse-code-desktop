const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const {
  trustedDocument,
  trustedWindow,
  authorizeAgent,
} = require("../electron/renderer-security.cjs");
const { DesktopServices } = require("../electron/desktop-services.cjs");
const options = { appRoot: path.resolve(__dirname, "..") };
const appUrl = pathToFileURL(
  path.join(options.appRoot, "dist", "index.html"),
).href;
test("IPC rejects unknown windows, subframes, changed documents and agent identity spoofing", () => {
  const frame = { url: appUrl };
  const sender = { mainFrame: frame };
  const window = { webContents: sender, isDestroyed: () => false };
  const windows = new Set([window]);
  assert.equal(trustedWindow(windows, sender, frame, options), window);
  assert.throws(
    () => trustedWindow(new Set(), sender, frame, options),
    /Untrusted/,
  );
  assert.throws(
    () => trustedWindow(windows, sender, { url: appUrl }, options),
    /Untrusted/,
  );
  frame.url = "data:text/html,attack";
  assert.throws(
    () => trustedWindow(windows, sender, frame, options),
    /Untrusted/,
  );
  frame.url = appUrl + "?agent=other";
  assert.throws(
    () => trustedWindow(windows, sender, frame, options),
    /identity/,
  );
  assert.equal(
    trustedDocument("https://example.com/", { devUrl: "https://example.com/" }),
    false,
  );
});
test("agent window can read its own transcript and parent, but not another session or privileged operations", () => {
  const target = { agentSessionId: "child", parentSessionId: "parent" };
  for (const channel of [
    "read-session",
    "view-page",
    "session-media",
    "read-output",
    "subscribe-session",
  ]) {
    assert.doesNotThrow(() => authorizeAgent(target, channel, ["child"], {}));
    assert.throws(
      () => authorizeAgent(target, channel, ["other"], {}),
      /cannot/,
    );
  }
  assert.doesNotThrow(() =>
    authorizeAgent(target, "open-conversation", ["parent"], {}),
  );
  for (const channel of [
    "send-turn",
    "terminal-start",
    "login",
    "save-attachment",
    "usage",
    "set-permissions",
  ])
    assert.throws(() => authorizeAgent(target, channel, [], {}), /cannot/);
});
test("local media needs a file-specific grant; canonical roots reject sibling and symlink escapes", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muse-security-"));
  try {
    const root = path.join(temp, "project");
    const outside = path.join(temp, "project-sibling");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const name = "literal %20 # (é).png";
    const valid = path.join(root, name);
    const secret = path.join(outside, "private.png");
    fs.writeFileSync(valid, "workspace image");
    fs.writeFileSync(secret, "outside image");
    const engine = { workspaceForSession: async () => root };
    const service = new DesktopServices(path.join(temp, "desktop"), engine);
    const granted = await service.resolveMedia(valid, "chat");
    const response = await service.serveMedia(new Request(granted));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "workspace image");
    assert.equal(
      (
        await service.serveMedia(
          new Request(`muse-media://local/?path=${encodeURIComponent(secret)}`),
        )
      ).status,
      404,
    );
    const modified = new URL(granted);
    modified.searchParams.set("path", secret);
    assert.equal((await service.serveMedia(new Request(modified))).status, 403);
    await assert.rejects(service.resolveMedia(secret, "chat"), /outside/);
    await assert.rejects(
      service.resolveMedia("../project-sibling/private.png", "chat"),
      /outside/,
    );
    if (process.platform !== "win32") {
      fs.symlinkSync(secret, path.join(root, "escape.png"));
      await assert.rejects(
        service.resolveMedia(path.join(root, "escape.png"), "chat"),
        /outside/,
      );
    }
    service.observeItems("chat", [
      { modelVisibleContent: [{ path: secret, mediaType: "image/png" }] },
    ]);
    assert.equal(
      (
        await service.serveMedia(
          new Request(await service.resolveMedia(secret, "chat")),
        )
      ).status,
      200,
    );
    await assert.rejects(service.resolveMedia(secret, "other"), /outside/);
    for (const range of [
      "bytes=-",
      "bytes=-0",
      "bytes=9999-",
      "bytes=9007199254740992-",
      "bytes=2-1",
    ])
      assert.equal(
        (await service.serveMedia(new Request(granted, { headers: { range } })))
          .status,
        416,
      );
    assert.equal(
      await (
        await service.serveMedia(
          new Request(granted, { headers: { range: "bytes=0-3" } }),
        )
      ).text(),
      "work",
    );
    assert.equal(
      (await service.serveMedia(new Request(granted, { method: "POST" })))
        .status,
      405,
    );
    assert.match(response.headers.get("content-security-policy"), /sandbox/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test("corrupt attachment manifest recovers complete session associations and keeps damaged evidence", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muse-storage-"));
  try {
    const service = new DesktopServices(temp, {});
    const file = service.saveAttachment({
      name: "reference.png",
      mediaType: "image/png",
      base64Data: Buffer.from("image").toString("base64"),
    });
    service.rememberMedia("session", "command", [file.id]);
    fs.writeFileSync(service.manifestPath, "{broken");
    const reopened = new DesktopServices(temp, {});
    assert.equal(reopened.sessionMedia("session").command[0].id, file.id);
    assert.equal(reopened.discardAttachment(file.id).removed, false);
    assert.ok(
      fs
        .readdirSync(path.dirname(service.manifestPath))
        .some((file) => file.includes(".corrupt-")),
    );
    const unsent = reopened.saveAttachment({
      name: "draft.txt",
      mediaType: "text/plain",
      base64Data: Buffer.from("draft").toString("base64"),
    });
    assert.equal(reopened.discardAttachment(unsent.id).removed, true);
    assert.equal(fs.existsSync(unsent.path), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test(
  "a granted pathname cannot be redirected by replacing an ancestor directory",
  { skip: process.platform === "win32" },
  async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "muse-grant-race-"));
    try {
      const root = path.join(temp, "workspace");
      const output = path.join(root, "output");
      const outside = path.join(temp, "outside");
      fs.mkdirSync(output, { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(output, "image.png"), "PUBLIC");
      fs.writeFileSync(path.join(outside, "image.png"), "PRIVATE");
      const service = new DesktopServices(path.join(temp, "desktop"), {
        workspaceForSession: async () => root,
      });
      const capability = await service.resolveMedia(
        path.join(output, "image.png"),
        "chat",
      );
      fs.renameSync(output, output + "-old");
      fs.symlinkSync(outside, output);
      const response = await service.serveMedia(new Request(capability));
      assert.equal(response.status, 403);
      assert.notEqual(await response.text(), "PRIVATE");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
);
test("only actual descendants can be opened from an agent; siblings cannot", () => {
  const { DesktopEngine } = require("../electron/desktop-engine.cjs");
  const engine = Object.create(DesktopEngine.prototype);
  engine.owners = new Map([
    ["a", "root"],
    ["b", "root"],
    ["nested", "root"],
  ]);
  engine.parents = new Map([
    ["a", "root"],
    ["b", "root"],
    ["nested", "a"],
  ]);
  assert.equal(engine.isDescendant("b", "a"), false);
  assert.equal(engine.isDescendant("nested", "a"), true);
  assert.throws(
    () =>
      authorizeAgent(
        { agentSessionId: "a" },
        "open-agent",
        [{ sessionId: "b", parentSessionId: "other" }],
        engine,
      ),
    /cannot/,
  );
  assert.doesNotThrow(() =>
    authorizeAgent(
      { agentSessionId: "a" },
      "open-agent",
      [{ sessionId: "nested", parentSessionId: "a" }],
      engine,
    ),
  );
});
