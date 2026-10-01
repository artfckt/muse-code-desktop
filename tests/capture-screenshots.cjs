// Public product screenshots use illustrative data and the test-only bridge.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("docs", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto(process.env.MUSE_PREVIEW_URL || "http://127.0.0.1:5173");
  await page.getByText("Using your CLI sign-in").waitFor();
  await page.evaluate(() => {
    const roots = [
      "/projects/muse-desktop",
      "/projects/luna-dashboard",
      "/projects/brand-studio",
    ];
    const names = [
      "Refine the desktop experience",
      "Review authentication flow",
      "Polish the project sidebar",
      "Build the analytics dashboard",
      "Add accessible chart controls",
      "Explore a new visual direction",
    ];
    window.testBridge.setSessions(
      names.map((name, i) => ({
        sessionId: `demo-${i}`,
        name,
        workspaceRoot: roots[Math.floor(i / 2)],
        modelId: "muse-spark-1.3",
        providerId: "meta",
        status: "idle",
        turnCount: 4,
        updatedAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      })),
    );
  });
  await page.locator(".session-row").first().waitFor();
  await page.screenshot({ path: "docs/desktop-preview.png" });
  await page.evaluate(() => {
    window.muse.resumeSession = async (id) => ({
      session: {
        sessionId: id,
        workspaceRoot: "/projects/muse-desktop",
        modelId: "muse-spark-1.3",
        providerId: "meta",
        turnCount: 4,
      },
      history: { items: [] },
    });
  });
  await page
    .getByRole("button", { name: /Refine the desktop experience/ })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".chat-scroll")?.getAttribute("aria-busy") ===
      "false",
  );
  await page.evaluate(() => {
    const items = [
      {
        itemId: "old-user",
        kind: "userMessage",
        text: "Make the desktop feel more focused. Keep the Muse palette, tighten the navigation, and improve the activity timeline.",
      },
      {
        itemId: "read",
        kind: "toolCall",
        tool: "read_file",
        args: { path: "src/desktop.css" },
        text: "Reviewed sidebar spacing, typography and activity layout.",
        durationMs: 318,
      },
      {
        itemId: "edit",
        kind: "toolCall",
        tool: "apply_patch",
        text: "Updated compact navigation and activity steps.",
        patchSummary: { added: 48, removed: 26 },
        durationMs: 642,
      },
      {
        itemId: "old-answer",
        kind: "agentMessage",
        text: "## A calmer, more focused workspace\n\nThe desktop now gives your conversation more room, with the familiar Muse palette.\n\n- **Compact navigation** keeps projects and chats easy to scan.\n- **Activity steps** gather tool calls into a quiet, expandable summary.\n- **Clear loading states** make opening a long conversation feel predictable.\n\n```css\n.session-row {\n  min-height: 25px;\n  border-radius: 6px;\n}\n```\n\nThe session details stay pinned above the activity feed, so context stays close while you explore the work.",
      },
    ];
    for (const item of items)
      window.testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "demo-0",
          item: { revision: 5, status: "completed", ...item },
        },
      });
    window.testBridge.emit({
      method: "session/tokenUsage",
      params: {
        sessionId: "demo-0",
        cumulative: {
          promptTokens: 4820,
          outputTokens: 1250,
          totalTokens: 6070,
        },
      },
    });
    window.testBridge.emit({
      method: "session/contextUsage",
      params: {
        sessionId: "demo-0",
        usedTokens: 6070,
        windowTokens: 128000,
        pressure: "normal",
      },
    });
  });
  await page
    .getByRole("heading", { name: "A calmer, more focused workspace" })
    .waitFor();
  await page.locator(".chat-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "docs/conversation-preview.png" });
  await page.getByRole("button", { name: /Activity 2/ }).click();
  await page.locator(".tool-card summary").first().click();
  await page.screenshot({ path: "docs/activity-preview.png" });
  await page.evaluate(() => {
    for (const item of [
      {
        itemId: "agent-1",
        role: "Reviewer",
        status: "inProgress",
        objective:
          "Review accessibility and keyboard navigation across the desktop.",
        subagentId: "reviewer",
        childSessionId: "demo-reviewer",
        agentPath: "root/reviewer",
        modelId: "muse-spark-1.3",
        providerId: "meta",
        controlStatus: "running",
      },
      {
        itemId: "agent-2",
        role: "Researcher",
        status: "completed",
        objective:
          "Inspect the project structure and check the native Muse integration.",
        subagentId: "researcher",
        childSessionId: "demo-researcher",
        agentPath: "root/researcher",
        modelId: "muse-spark-1.3",
        providerId: "meta",
        durationMs: 32800,
        result: {
          summary:
            "Checked session routing and the native permission profiles. The desktop continues to use the installed Muse runtime.",
        },
      },
    ])
      window.testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "demo-0",
          item: { kind: "subagent", revision: 1, ...item },
        },
      });
  });
  await page.getByRole("button", { name: /Agents 2/ }).click();
  await page
    .getByRole("button", { name: "Open Reviewer separately" })
    .waitFor();
  await page.screenshot({ path: "docs/agents-preview.png" });
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.screenshot({ path: "docs/appearance-preview.png" });
  await page.getByRole("combobox", { name: "Interface font" }).click();
  await page.screenshot({ path: "docs/font-preview.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await page.screenshot({ path: "docs/updates-preview.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await page.screenshot({ path: "docs/collapsed-sidebar-preview.png" });
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("radio").first().check();
  await page.screenshot({ path: "docs/new-conversation-preview.png" });
  await browser.close();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Nine current beta screenshots captured; sample content is illustrative.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
