import { test, expect } from "@playwright/test";
import path from "node:path";
import { version } from "../../package.json";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
});
test("new conversation supports no folder and a newly chosen project", async ({
  page,
}) => {
  await expect(page.locator(".window-bar")).toContainText("BETA");
  await expect(page.locator(".window-bar")).toContainText(version);
  await expect(
    page.getByRole("button", { name: /Open a project/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(page.locator(".breadcrumb")).toContainText("No folder");
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (c: any) => c[0] === "startSession",
        )[1].noFolder,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("A standalone conversation");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finished" })).toBeVisible();
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Choose another folder" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(page.locator(".breadcrumb")).toContainText("new-project");
});
test("loading states cover slow lists and slow message history", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).muse.listSessions = async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return {
        sessions: [
          {
            sessionId: "slow",
            name: "Slow chat",
            workspaceRoot: "/projects/studio",
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    };
    const resume = (window as any).muse.resumeSession;
    (window as any).muse.resumeSession = async (id: string) => {
      await new Promise((r) => setTimeout(r, 1200));
      return resume(id);
    };
  });
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Slow chat/ }).click();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toBeVisible();
  await expect(page.getByText("Earlier answer", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading messages" }),
  ).toHaveCount(0);
});
test("partial subscription usage refreshes without crashing", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.usage = async () => ({
      usage: {
        observedAtMs: Date.now(),
        weekly: { usedPercent: 27, resetsAtMs: Date.now() + 86400000 },
      },
      checkedAtMs: Date.now(),
    });
  });
  await page
    .getByRole("button", { name: "Refresh subscription usage" })
    .click();
  await expect(page.locator(".usage-meter")).toHaveCount(1);
  await expect(page.locator(".usage-meter")).toContainText("27%");
  await expect(page.locator(".usage-section")).toContainText("Checked");
});
test("file attachments reach the chat payload and custom picker applies color", async ({
  page,
}) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "brief.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Build an accessible dashboard"),
  });
  await expect(page.locator(".image-attachments")).toContainText("brief.md");
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Read my brief");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (c: any) => c[0] === "sendTurn",
        )[1].text,
    ),
  ).toContain("brief.md");
  await expect(page.locator(".user-message > div")).toHaveCSS(
    "user-select",
    "text",
  );
  await expect(page.locator(".sidebar")).toHaveCSS("user-select", "none");
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.locator('input[type="color"]').first().fill("#4488ff");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent"),
    ),
  ).toBe("#4488ff");
});
test("long histories offer jump to latest and keep details above scrolling activity", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++)
      (window as any).testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "session-1",
          item: {
            itemId: `message-${i}`,
            kind: "agentMessage",
            status: "completed",
            revision: 1,
            text: `Message ${i}\n\nA longer conversation with enough content to scroll.`,
          },
        },
      });
  });
  await expect(page.locator(".assistant-message")).toHaveCount(50);
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(80);
  await page.locator(".chat-scroll").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(80);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  expect(
    await page
      .locator(".session-details")
      .evaluate((el) => !!el.closest(".chat-scroll")),
  ).toBe(false);
});
test("completed and unavailable agents do not expose separate-window links", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await page.evaluate(() => {
    (window as any).muse.agentAvailable = async () => false;
    for (const [id, status] of [
      ["done", "completed"],
      ["missing", "inProgress"],
    ])
      (window as any).testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "session-1",
          item: {
            itemId: id,
            kind: "subagent",
            role: id,
            childSessionId: id,
            subagentId: id,
            modelId: "muse-spark-1.3",
            status,
            revision: 1,
            objective: "Review the implementation",
          },
        },
      });
  });
  await page.getByRole("button", { name: /Show agents.*2 total/ }).click();
  await expect(page.locator(".agent-card")).toHaveCount(2);
  await page.locator(".agent-info summary").first().click();
  await expect(page.locator(".agent-metadata").first()).toContainText(
    "muse-spark-1.3",
  );
  await expect(
    page.getByRole("button", { name: /Open .* separately/ }),
  ).toHaveCount(0);
});
