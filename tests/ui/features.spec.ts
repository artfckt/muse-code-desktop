import { test, expect } from "@playwright/test";
import path from "node:path";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
});
test("a slow global history scan never blocks starting and sending a new chat", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).muse.listSessions = () => new Promise(() => {});
  });
  await page.reload();
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Run while history loads");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finished" })).toBeVisible();
});
async function item(page: any, value: any) {
  await page.evaluate(
    (value: any) =>
      (window as any).testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "session-1",
          item: {
            itemId: "fixture",
            revision: 1,
            status: "completed",
            ...value,
          },
        },
      }),
    value,
  );
}
test("all workspace chats remain available while another workspace runs", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).testBridge.setSessions([
      {
        sessionId: "one",
        name: "Project one chat",
        workspaceRoot: "/projects/one",
        updatedAt: new Date().toISOString(),
      },
      {
        sessionId: "two",
        name: "Project two chat",
        workspaceRoot: "/projects/two",
        updatedAt: new Date().toISOString(),
      },
    ]);
    (window as any).testBridge.emit({
      method: "turn/started",
      params: { sessionId: "one", turnId: "active" },
    });
  });
  await expect(page.locator(".workspace-group")).toHaveCount(3);
  await expect(page.locator(".session-row.running")).toContainText(
    "Project one chat",
  );
  await page.getByRole("button", { name: /Project two chat/ }).click();
  await expect(page.locator(".session-row.running")).toContainText(
    "Project one chat",
  );
  await expect(page.locator(".breadcrumb")).toContainText("two");
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "turn/completed",
      params: { sessionId: "one", turnId: "active", terminal: "completed" },
    }),
  );
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.some(
        (call: any) => call[0] === "notify" && call[1].sessionId === "one",
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle one", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Project one chat/ }),
  ).toHaveCount(0);
});
test("completed activity collapses and final response stays visible", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await item(page, {
    kind: "toolCall",
    tool: "read_file",
    text: "Long tool output",
  });
  await item(page, {
    itemId: "answer",
    kind: "agentMessage",
    text: "## Answer\nReady.",
  });
  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  await expect(page.getByText("Long tool output")).toHaveCount(0);
  await page.getByRole("button", { name: /1 activity step/ }).click();
  await page.locator(".tool-card summary").click();
  await expect(page.getByText("Long tool output")).toBeVisible();
  await page.getByRole("button", { name: /Activity 1/ }).click();
  await expect(
    page.getByRole("heading", { name: "Session details" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".tool-card summary")
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(40);
});
test("Markdown renders Windows links, GFM, formulas, highlighted code and diagrams safely", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await item(page, {
    kind: "agentMessage",
    text: "[prepare_intro.py](/E:/Danny/JM3 Bus Stop (Ruby)/06_scripts/prepare_intro.py)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Done\n\n$$x^2 + y^2$$\n\n```js\nconst n = 3;\n```\n\n```mermaid\ngraph LR\n A-->B\n```\n\n[unsafe](javascript:alert(1))",
  });
  await expect(
    page.getByRole("link", { name: "prepare_intro.py" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "prepare_intro.py" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (call: any) => call[0] === "openLocal",
        )[1],
    ),
  ).toContain("JM3 Bus Stop (Ruby)");
  await expect(page.locator(".markdown table")).toBeVisible();
  await expect(page.locator(".katex-display")).toBeVisible();
  await expect(page.locator(".hljs-keyword")).toContainText("const");
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.getByRole("link", { name: "unsafe" })).not.toHaveAttribute(
    "href",
    /javascript:/,
  );
});
test("custom permission dropdown supports keyboard selection and real YOLO payload", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  const select = page.getByRole("combobox", {
    name: "Permissions",
    exact: true,
  });
  await select.click();
  await select.press("End");
  await select.press("Enter");
  await expect(select).toContainText("YOLO");
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.find(
        (call: any) => call[0] === "setPermissions",
      ),
    ),
  ).toEqual(["setPermissions", "session-1", "yolo", "allowAll"]);
  await expect(page.locator("select")).toHaveCount(0);
});
test("slash palette includes native commands and skills, forwards native-only command to CLI", async ({
  page,
}) => {
  const input = page.getByRole("textbox", { name: "Message Muse" });
  await input.fill("/");
  await expect(page.getByRole("option", { name: /\/plan/ })).toBeVisible();
  await input.fill("/rew");
  await input.press("Enter");
  await input.press("Enter");
  await expect(
    page.getByRole("region", { name: "Native Muse CLI" }),
  ).toBeVisible();
  await expect(page.getByText("/rewind", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Insert command" }).click();
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.some(
        (call: any) => call[0] === "terminalWrite" && call[1] === "/rewind",
      ),
    ),
  ).toBe(true);
});
test("native agents have separate windows and follow-up controls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await item(page, {
    kind: "subagent",
    role: "Researcher",
    objective: "Inspect the code",
    childSessionId: "child-1",
    subagentId: "agent-1",
    status: "inProgress",
  });
  await page.getByRole("button", { name: /Agents 1/ }).click();
  await page
    .getByRole("button", { name: "Open Researcher separately" })
    .click();
  await page.getByRole("button", { name: "Manage Researcher" }).click();
  await page
    .getByRole("textbox", { name: "Message Researcher" })
    .fill("Check tests too");
  await page.getByRole("button", { name: "Follow-up", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (call: any) => call[0] === "openAgent",
        )[1],
    ),
  ).toEqual({ sessionId: "child-1", parentSessionId: "session-1" });
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.find(
        (call: any) => call[0] === "agentControl",
      ),
    ),
  ).toEqual([
    "agentControl",
    "followupTask",
    { sessionId: "session-1", subagentId: "agent-1", body: "Check tests too" },
  ]);
});
test("custom colors, fonts, selection and sidebar size persist", async ({
  page,
}) => {
  await page
    .getByRole("separator", { name: "Resize conversations sidebar" })
    .press("ArrowRight");
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page
    .getByRole("textbox", { name: "accent color", exact: true })
    .fill("#4488ff");
  await page.getByRole("combobox", { name: "Interface font" }).click();
  await page
    .getByRole("option", { name: "Cascadia Code", exact: true })
    .click();
  await expect(page.locator("body")).toHaveCSS("user-select", "none");
  await page.reload();
  await expect(
    page.getByRole("separator", { name: "Resize conversations sidebar" }),
  ).toHaveAttribute("aria-valuenow", "242");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent"),
    ),
  ).toBe("#4488ff");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("Cascadia Code");
});
test("session usage details, MCP inventory and completion notifications use native events", async ({
  page,
}) => {
  await expect(page.getByText("project-tools", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.getByRole("tab", { name: "Notifications", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Notify while the app is focused" })
    .check();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await page.evaluate(() => {
    (window as any).testBridge.emit({
      method: "session/contextUsage",
      params: {
        sessionId: "session-1",
        usedTokens: 500,
        windowTokens: 2000,
        pressure: "normal",
      },
    });
    (window as any).testBridge.emit({
      method: "session/tokenUsage",
      params: {
        sessionId: "session-1",
        cumulative: { promptTokens: 100, outputTokens: 200, totalTokens: 300 },
      },
    });
    (window as any).testBridge.emit({
      method: "turn/completed",
      params: { sessionId: "session-1", turnId: "turn", terminal: "completed" },
    });
  });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("500 / 2,000 (normal)")).toBeVisible();
  await expect(page.getByText("300", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.some(
        (call: any) =>
          call[0] === "notify" && call[1].sessionId === "session-1",
      ),
    ),
  ).toBe(true);
});
