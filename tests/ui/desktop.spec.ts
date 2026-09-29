import { test, expect } from "@playwright/test";
import path from "node:path";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
});
test("premium welcome loads at desktop and small window sizes without overflow", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Make room for your next idea." }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/desktop-preview.png" });
  await page.setViewportSize({ width: 900, height: 620 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Message Muse" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/small-window.png" });
});
test("uses existing CLI account and sends only one user message with streamed Markdown", async ({
  page,
}) => {
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Please inspect the project");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finished" })).toBeVisible();
  await expect(page.locator(".user-message")).toHaveCount(1);
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(page.getByText("code", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop active turn" }),
  ).toHaveCount(0);
  await page.screenshot({ path: "docs/conversation-preview.png" });
});
test("native login shows the code, opens browser, and handles granted completion", async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).testBridge.setAccount({
      state: "loggedOut",
      credentialRequired: true,
    }),
  );
  await page.getByRole("button", { name: /Connect your Muse account/ }).click();
  await page
    .getByRole("button", { name: "Sign in with Muse Code", exact: true })
    .click();
  await expect(page.getByText("MUSE-1234")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (call: any) => call[0] === "openExternal",
        )[1],
    ),
  ).toBe("https://auth.meta.com/device");
  await page.evaluate(() => {
    (window as any).testBridge.setAccount({
      state: "accountLogin",
      credentialRequired: true,
      label: "Muse account",
    });
    (window as any).testBridge.emit({
      method: "account/loginCompleted",
      params: { outcome: "granted" },
    });
  });
  await expect(page.getByText("Right where you left off.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("approval submits host choice and exact current requirement token", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.evaluate(() =>
    (window as any).testBridge.requestApproval({
      approvalId: "approval-1",
      sessionId: "session-1",
      toolName: "shell",
      rawArgs: '{"command":"npm test"}',
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 7 },
      availableChoices: [
        {
          choiceId: "actual-allow-id",
          label: "Allow this command",
          decision: "allow",
          scope: "once",
        },
        {
          choiceId: "actual-deny-id",
          label: "Reject action",
          decision: "deny",
          scope: "once",
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "Allow this command" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (call: any) => call[0] === "decideApproval",
        )[1],
    ),
  ).toEqual({
    sessionId: "session-1",
    approvalId: "approval-1",
    requirementId: { approvalId: "approval-1", sourceIndex: 7 },
    choiceId: "actual-allow-id",
  });
  await expect(page.getByText("Permission requested")).toHaveCount(0);
});
test("structured agent questions accept offered choices", async ({ page }) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.evaluate(() =>
    (window as any).testBridge.requestInput({
      userInputId: "input-1",
      sessionId: "session-1",
      questions: [
        {
          id: "database",
          header: "Database",
          question: "Choose a database",
          selection: { mode: "single" },
          options: [
            { label: "SQLite", description: "Local data" },
            { label: "PostgreSQL", description: "Shared data" },
          ],
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "SQLite Local data" }).click();
  await page.getByRole("button", { name: "Send answer" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.find(
          (call: any) => call[0] === "answerInput",
        )[1].answers,
    ),
  ).toEqual([{ questionId: "database", selectedLabel: "SQLite" }]);
});
test("resume preserves chronological order and ignores other sessions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: /New conversation Just now/ }).click();
  await expect(page.locator(".user-message")).toHaveText("Earlier question");
  await expect(page.locator(".assistant-message")).toContainText(
    "Earlier answer",
  );
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "item/completed",
      params: {
        sessionId: "different-session",
        item: {
          itemId: "foreign",
          kind: "agentMessage",
          revision: 1,
          status: "completed",
          text: "Do not mix this response",
        },
      },
    }),
  );
  await expect(page.getByText("Do not mix this response")).toHaveCount(0);
});
test("unknown usage is explicit and runtime settings are accessible", async ({
  page,
}) => {
  await expect(page.getByText("Waiting for Muse usage")).toBeVisible();
  await page.getByRole("button", { name: "Settings ⌘ ," }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Locate CLI" })).toBeVisible();
});
test("native Muse terminal stays mounted when switching back to GUI", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Muse CLI Native", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Native Muse CLI" }),
  ).toBeVisible();
  await expect(page.locator(".terminal-canvas .xterm")).toHaveCount(1);
  await page.locator(".xterm-helper-textarea").press("a");
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.some(
        (call: any) => call[0] === "terminalWrite" && call[1] === "a",
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message Muse" }),
  ).toBeVisible();
  await expect(page.locator(".terminal-canvas .xterm")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Muse CLI Native", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Native Muse CLI" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.filter(
          (call: any) => call[0] === "terminalStart",
        ).length,
    ),
  ).toBe(1);
});
