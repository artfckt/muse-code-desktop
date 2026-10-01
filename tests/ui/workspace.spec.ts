import { test, expect } from "@playwright/test";
import path from "node:path";
const rows = [
  {
    sessionId: "a",
    name: "Chat Alpha",
    workspaceRoot: "/projects/studio",
    updatedAt: "2026-10-01T06:00:00Z",
  },
  {
    sessionId: "b",
    name: "Chat Beta",
    workspaceRoot: "/projects/studio",
    updatedAt: "2026-10-01T05:00:00Z",
  },
  {
    sessionId: "c",
    name: "Chat Gamma",
    workspaceRoot: "/projects/apps",
    updatedAt: "2026-10-01T04:00:00Z",
  },
];
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
  await page.evaluate(
    (rows) => (window as any).testBridge.setSessions(rows),
    rows,
  );
  await expect(page.locator(".session-row")).toHaveCount(3);
});
const chat = (page: any, name: string) =>
  page.locator(".session-row").filter({ hasText: name });
async function message(page: any, id: string, text: string) {
  await page.evaluate(
    ({ id, text }) =>
      (window as any).testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: id,
          item: {
            itemId: "answer",
            kind: "agentMessage",
            revision: 1,
            status: "completed",
            text,
          },
        },
      }),
    { id, text },
  );
  await expect(
    page.locator(".assistant-message").filter({ hasText: text }),
  ).toContainText(text);
}
test("compact project hierarchy, collapsed rail and account usage stay in the left sidebar", async ({
  page,
}) => {
  const height = await chat(page, "Chat Alpha").evaluate(
    (el: any) => el.getBoundingClientRect().height,
  );
  expect(height).toBeLessThanOrEqual(26);
  await expect(page.locator(".project-conversations")).toHaveCount(2);
  await expect(page.locator(".inspector .usage-section")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  const width = await page
    .locator(".workspace-sidebar")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(60);
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search conversations" }),
  ).toBeVisible();
});
test("dragged chat and project order survives reopening without changing native workspace", async ({
  page,
}) => {
  const a = page.locator(".session-row-wrap").filter({ hasText: "Chat Alpha" }),
    b = page.locator(".session-row-wrap").filter({ hasText: "Chat Beta" });
  await b.dragTo(a);
  await expect(page.locator(".session-row b")).toHaveText([
    "Chat Beta",
    "Chat Alpha",
    "Chat Gamma",
  ]);
  const apps = page.locator(".workspace-heading").filter({ hasText: "apps" }),
    studio = page.locator(".workspace-heading").filter({ hasText: "studio" });
  await apps.dragTo(studio);
  await expect(page.locator(".workspace-name b")).toHaveText([
    "apps",
    "studio",
  ]);
  await page.addInitScript(
    (rows) => (window as any).testBridge.setSessions(rows),
    rows,
  );
  await page.reload();
  await expect(page.locator(".workspace-name b")).toHaveText([
    "apps",
    "studio",
  ]);
  await expect(page.locator(".session-row b")).toHaveText([
    "Chat Gamma",
    "Chat Beta",
    "Chat Alpha",
  ]);
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.filter((c: any) =>
        ["connectWorkspace", "setPermissions"].includes(c[0]),
      ),
    ),
  ).toEqual([["connectWorkspace", "/projects/studio"]]);
});
test("a warm chat displays immediately while native synchronization is slow", async ({
  page,
}) => {
  await chat(page, "Chat Alpha").click();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toHaveCount(0);
  await message(page, "a", "Cached Alpha answer");
  await chat(page, "Chat Beta").click();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).muse.resumeSession = (id: string) =>
      new Promise((resolve) => {
        (window as any).releaseResume = () =>
          resolve({
            session: { sessionId: id, workspaceRoot: "/projects/studio" },
            history: {
              items: [
                {
                  itemId: "fresh",
                  kind: "agentMessage",
                  revision: 1,
                  status: "completed",
                  text: "Fresh authoritative answer",
                },
              ],
            },
          });
      });
  });
  const start = Date.now();
  await chat(page, "Chat Alpha").click();
  await expect(
    page
      .locator(".assistant-message")
      .filter({ hasText: "Cached Alpha answer" }),
  ).toContainText("Cached Alpha answer");
  expect(Date.now() - start).toBeLessThan(1000);
  await expect(page.getByText("Updating from Muse…")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Next question");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).releaseResume());
  await expect(page.locator(".assistant-message")).toContainText(
    "Fresh authoritative answer",
  );
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeEnabled();
});
test("the persistent chat preview restores after a renderer restart", async ({
  page,
}) => {
  await chat(page, "Chat Alpha").click();
  await message(page, "a", "Persistent local preview");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const open = indexedDB.open("muse-conversation-cache", 1);
            open.onsuccess = () => {
              const request = open.result
                .transaction("chats")
                .objectStore("chats")
                .get("a");
              request.onsuccess = () => {
                resolve(
                  request.result?.items?.some(
                    (item: any) => item.text === "Persistent local preview",
                  ),
                );
                open.result.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.addInitScript((rows) => {
    (window as any).testBridge.setSessions(rows);
    (window as any).muse.resumeSession = () => new Promise(() => {});
  }, rows);
  await page.reload();
  await chat(page, "Chat Alpha").click();
  await expect(
    page
      .locator(".assistant-message")
      .filter({ hasText: "Persistent local preview" }),
  ).toContainText("Persistent local preview");
  await expect(page.getByText("Updating from Muse…")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toHaveCount(0);
});
test("activity uses an event feed and agents appear alongside the conversation", async ({
  page,
}) => {
  await chat(page, "Chat Alpha").click();
  await message(page, "a", "Conversation content");
  await page.evaluate(() => {
    for (const item of [
      {
        itemId: "tool",
        kind: "toolCall",
        tool: "read_file",
        visibleOutput: "source",
        status: "completed",
      },
      {
        itemId: "agent",
        kind: "subagent",
        role: "Reviewer",
        objective: "Check accessibility",
        subagentId: "reviewer",
        childSessionId: "review",
        status: "inProgress",
      },
    ])
      (window as any).testBridge.emit({
        method: "item/completed",
        params: { sessionId: "a", item: { revision: 1, ...item } },
      });
  });
  await page.getByRole("button", { name: /Activity 2/ }).click();
  await expect(page.locator(".activity-entry")).toHaveCount(2);
  await expect(page.locator(".assistant-message")).toHaveCount(0);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await page.getByRole("button", { name: /Show agents.*1 total/ }).click();
  await expect(page.locator(".agent-grid .agent-card")).toHaveCount(1);
  await expect(page.locator(".activity-entry")).toHaveCount(0);
  await expect(
    page
      .locator(".assistant-message")
      .filter({ hasText: "Conversation content" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agents / })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message Reviewer" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Manage Reviewer" }).click();
  await expect(
    page.getByRole("textbox", { name: "Message Reviewer" }),
  ).toBeVisible();
});
test("thinking toggle submits a native reasoning effort and the input aligns with the transcript", async ({
  page,
}) => {
  await chat(page, "Chat Alpha").click();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toHaveCount(0);
  const thinking = page.getByRole("button", { name: "Thinking mode" });
  await thinking.click();
  await expect(thinking).toHaveAttribute("aria-pressed", "false");
  await thinking.click();
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Think through this carefully");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testBridge.calls.find(
            (c: any) => c[0] === "sendTurn",
          )?.[1].reasoningEffort,
      ),
    )
    .toBe("high");
  const geometry = await page.evaluate(() => {
    const a = document
        .querySelector(".main-panel .transcript")!
        .getBoundingClientRect(),
      b = document.querySelector(".composer-wrap")!.getBoundingClientRect();
    return {
      left: Math.abs(a.left - b.left),
      width: Math.abs(a.width - b.width),
    };
  });
  expect(geometry.left).toBeLessThan(1);
  expect(geometry.width).toBeLessThan(1);
  const fonts = await page.evaluate(() => {
    const a = getComputedStyle(document.querySelector(".user-message")!),
      b = getComputedStyle(document.querySelector(".markdown")!);
    return {
      user: a.fontSize,
      answer: b.fontSize,
      userFamily: a.fontFamily,
      answerFamily: b.fontFamily,
    };
  });
  expect(fonts.user).toBe(fonts.answer);
  expect(fonts.userFamily).toBe(fonts.answerFamily);
});
test("settings categories expose update checks and official downloads", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.checkUpdates = async (options: any) => {
      (window as any).testBridge.calls.push(["checkUpdates", options]);
      return {
        available: true,
        version: "0.8.0-beta.1",
        checkedAt: Date.now(),
        downloadUrl:
          "https://github.com/artfckt/muse-code-desktop/releases/tag/v0.8.0-beta.1",
      };
    };
  });
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect(
    page.getByText("Version 0.8.0-beta.1 is available"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Download update", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (c: any) => c[0] === "checkUpdates",
        )[1].force,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (c: any) => c[0] === "openExternal",
        )[1],
    ),
  ).toMatch(/github.com\/artfckt\/muse-code-desktop\/releases/);
});
test("font dropdown previews a candidate before applying it and theme changes reset only appearance overrides", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page
    .getByRole("textbox", { name: "accent color", exact: true })
    .fill("#4488ff");
  await page.getByRole("combobox", { name: "Interface font" }).click();
  const font = page.getByRole("option", { name: "Cascadia Code", exact: true });
  await font.click();
  await expect(page.locator(".font-live-preview > p")).toHaveCSS(
    "font-family",
    /Cascadia Code/,
  );
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("DM Sans");
  await page.getByRole("button", { name: "Apply font", exact: true }).click();
  await page.getByRole("button", { name: "Reset custom theme" }).click();
  await expect(
    page.getByRole("textbox", { name: "accent color", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("DM Sans");
  await page
    .getByRole("textbox", { name: "accent color", exact: true })
    .fill("#4488ff");
  await page.locator('.theme-choice:has(input[value="midnight"])').click();
  await expect(
    page.getByRole("textbox", { name: "accent color", exact: true }),
  ).toHaveValue("");
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Default reasoning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "accent color", exact: true }),
  ).toHaveCount(0);
});
