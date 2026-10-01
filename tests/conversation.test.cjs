const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const Module = require("node:module");
const compiled = ts.transpileModule(
  fs.readFileSync(require.resolve("../src/conversation.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const instance = new Module("conversation");
instance._compile(compiled, "conversation.cjs");
const {
  conversationWindow,
  conversationPreview,
  nativeAgents,
  agentWorking,
  nativeCommentary,
  activityLabel,
} = instance.exports;
const message = (id) => ({
  itemId: id,
  kind: "agentMessage",
  status: "completed",
});
test("hundreds of activities do not evict the actual conversation", () => {
  const items = [
    { ...message("request"), kind: "userMessage" },
    message("reply"),
    ...Array.from({ length: 500 }, (_, i) => ({
      itemId: `tool-${i}`,
      kind: "toolCall",
    })),
  ];
  assert.deepEqual(conversationWindow(items, 200), {
    visible: items,
    remaining: 0,
  });
  const long = Array.from({ length: 300 }, (_, i) => message(`message-${i}`));
  assert.equal(conversationWindow(long, 200).visible[0].itemId, "message-100");
  assert.equal(conversationWindow(long, 200).remaining, 100);
});
test("reminder deliveries cannot create agents or overwrite their running state", () => {
  const agent = {
    itemId: "agent",
    kind: "subagent",
    subagentId: "research",
    childSessionId: "child",
    revision: 2,
    status: "inProgress",
    controlStatus: "running",
  };
  const agents = nativeAgents([
    agent,
    { ...agent, itemId: "agent", revision: 1, controlStatus: "closed" },
    {
      itemId: "reminder",
      kind: "reminderChild",
      childSessionId: "child",
      status: "completed",
    },
  ]);
  assert.deepEqual(agents, [agent]);
  assert.equal(agentWorking(agents[0]), true);
  assert.equal(agentWorking({ ...agent, controlStatus: "resultReady" }), false);
  assert.equal(
    agentWorking({ ...agent, controlStatus: "unknownFutureState" }),
    false,
  );
});
test("commentary only exposes supplied summaries and activity labels handle verbatim JSON arguments", () => {
  assert.equal(
    nativeCommentary([{ kind: "reasoning", text: "raw internal reasoning" }]),
    "",
  );
  assert.equal(
    nativeCommentary([
      {
        kind: "reasoning",
        summary: ["Checking the layout.", "Reviewing keyboard navigation."],
      },
    ]),
    "Checking the layout.\nReviewing keyboard navigation.",
  );
  assert.equal(
    activityLabel({
      kind: "toolCall",
      tool: "read_file",
      args: '{"path":"C:\\\\app\\\\src\\\\App.tsx"}',
    }),
    "Reading App.tsx",
  );
  assert.equal(
    activityLabel({ kind: "toolCall", tool: "edit_file", args: "not JSON" }),
    "Editing files",
  );
  assert.equal(activityLabel({ kind: "reminderChild" }), "Agent update");
});

test("disk previews retain messages across tool floods within a bounded budget", () => {
  const items = [
    { ...message("request"), kind: "userMessage" },
    message("reply"),
    {
      itemId: "agent",
      kind: "subagent",
      subagentId: "worker",
      status: "inProgress",
    },
    ...Array.from({ length: 500 }, (_, i) => ({
      itemId: `step-${i}`,
      kind: "toolCall",
    })),
  ];
  const preview = conversationPreview(items);
  assert.equal(preview[0].itemId, "request");
  assert.equal(preview[1].itemId, "reply");
  assert.equal(preview[2].itemId, "agent");
  assert.equal(preview.length, 83);
  assert.equal(preview.at(-1).itemId, "step-499");
  const long = Array.from({ length: 500 }, (_, i) => message(`m-${i}`));
  assert.equal(conversationPreview(long).length, 200);
});
