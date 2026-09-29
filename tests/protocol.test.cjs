const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const Module = require("node:module");
const compiled = ts.transpileModule(
  fs.readFileSync(require.resolve("../src/protocol.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const moduleInstance = new Module("protocol");
moduleInstance._compile(compiled, "protocol.cjs");
const { Transcript, historyItems, subscriptionUsage } = moduleInstance.exports;
const item = (id, revision, text = "", status = "inProgress") => ({
  itemId: id,
  revision,
  text,
  status,
  kind: "agentMessage",
});

test("streaming deduplicates cursors and final item replaces accumulated text", () => {
  const store = new Transcript();
  store.apply({
    method: "item/started",
    params: { item: item("a", 1), viewCursor: "1" },
  });
  const delta = {
    method: "item/delta",
    params: { itemId: "a", delta: "Hello ", field: "text", viewCursor: "2" },
  };
  store.apply(delta);
  store.apply(delta);
  store.apply({
    method: "item/delta",
    params: { itemId: "a", delta: "world", viewCursor: "3" },
  });
  assert.equal(store.list()[0].text, "Hello world");
  store.apply({
    method: "item/completed",
    params: {
      item: item("a", 2, "Authoritative answer", "completed"),
      viewCursor: "4",
    },
  });
  store.apply({
    method: "item/started",
    params: { item: item("a", 1, "stale"), viewCursor: "5" },
  });
  assert.equal(store.list()[0].text, "Authoritative answer");
});
test("tool output and reasoning summary target the correct fields", () => {
  const store = new Transcript();
  store.seed([item("tool", 1), item("reason", 1)]);
  store.apply({
    method: "item/delta",
    params: { itemId: "tool", field: "output", delta: "OK" },
  });
  store.apply({
    method: "item/delta",
    params: { itemId: "reason", field: "summary.0", delta: "Thinking" },
  });
  assert.equal(store.list()[0].visibleOutput, "OK");
  assert.equal(store.list()[1].summary[0], "Thinking");
});
test("history keeps first-opened order and upgrades completed revisions", () => {
  const store = new Transcript();
  for (const entry of [
    item("user", 1, "Question"),
    item("agent", 1),
    item("agent", 2, "Answer", "completed"),
  ])
    store.apply({ method: "item/completed", params: { item: entry } });
  assert.deepEqual(
    store.list().map((row) => row.itemId),
    ["user", "agent"],
  );
  assert.equal(store.list()[1].text, "Answer");
  assert.equal(
    historyItems({ history: { snapshot: { state: { items: store.list() } } } })
      .length,
    2,
  );
});
test("absent subscription usage is unknown, not a fabricated zero", () => {
  assert.equal(subscriptionUsage({}), null);
  assert.equal(
    subscriptionUsage({ usage: { observedAtMs: 100, tier: "pro" } }).tier,
    "pro",
  );
});
