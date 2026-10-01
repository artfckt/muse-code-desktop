import { test, expect } from "@playwright/test";
import path from "node:path";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
});
test("500 running steps keep messages and native updates visible without opening a wall of tools", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.resumeSession = async () => ({
      session: { sessionId: "busy", workspaceRoot: "/projects/studio" },
      history: {
        items: [
          {
            itemId: "request",
            kind: "userMessage",
            text: "Please review the layout",
            status: "completed",
            revision: 1,
          },
          {
            itemId: "comment",
            kind: "agentMessage",
            text: "I will check the layout and keyboard navigation.",
            status: "completed",
            revision: 1,
          },
          ...Array.from({ length: 500 }, (_, i) => ({
            itemId: `step-${i}`,
            kind: i === 499 ? "reasoning" : "toolCall",
            tool: "read_file",
            args: '{"path":"src/App.tsx"}',
            summary:
              i === 499
                ? ["Reviewing the sidebar at small window sizes."]
                : undefined,
            status: i === 499 ? "inProgress" : "completed",
            revision: 1,
          })),
        ],
      },
    });
    (window as any).testBridge.setSessions([
      {
        sessionId: "busy",
        name: "Busy conversation",
        workspaceRoot: "/projects/studio",
      },
    ]);
  });
  await page.locator(".session-row").click();
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "turn/started",
      params: { sessionId: "busy", turnId: "turn" },
    }),
  );
  await expect(page.locator(".user-message")).toContainText(
    "Please review the layout",
  );
  await expect(page.locator(".assistant-message")).toContainText(
    "I will check the layout",
  );
  await expect(page.locator(".muse-commentary")).toContainText(
    "Reviewing the sidebar at small window sizes.",
  );
  await expect(
    page.getByRole("button", { name: /500 activity steps/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".tool-card")).toHaveCount(0);
  await page.getByRole("button", { name: /500 activity steps/ }).click();
  await expect(page.locator(".tool-card")).toHaveCount(50);
  await expect(
    page.getByRole("button", { name: /Show earlier steps \(450 remaining\)/ }),
  ).toBeVisible();
});
test("agent reminders do not count as agents, and the team remains in the conversation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await page.evaluate(() => {
    const emit = (item: any) =>
      (window as any).testBridge.emit({
        method: "item/completed",
        params: { sessionId: "session-1", item: { revision: 1, ...item } },
      });
    emit({
      itemId: "reply",
      kind: "agentMessage",
      text: "Review started",
      status: "completed",
    });
    emit({
      itemId: "agent",
      kind: "subagent",
      subagentId: "reviewer",
      childSessionId: "child",
      role: "Reviewer",
      objective: "Check keyboard navigation",
      status: "inProgress",
      controlStatus: "running",
    });
    for (let i = 0; i < 150; i++)
      emit({
        itemId: `reminder-${i}`,
        kind: "reminderChild",
        childSessionId: "child",
        reminderAgentId: `notification-${i}`,
        status: "completed",
      });
  });
  await expect(
    page.getByRole("button", { name: "Show agents (1 working, 1 total)" }),
  ).toBeVisible();
  await expect(page.locator(".inline-agent-progress")).toContainText(
    "Check keyboard navigation",
  );
  await expect(page.locator(".assistant-message")).toContainText(
    "Review started",
  );
  await expect(page.locator(".conversation-tabs")).not.toContainText("Agents");
  await page
    .getByRole("button", { name: "Show agents (1 working, 1 total)" })
    .click();
  await expect(page.locator(".agent-card")).toHaveCount(1);
});
test("fonts load lazily, a large catalog stays bounded and preview changes only on Apply", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).fontRequests = 0;
    (window as any).muse.systemFonts = async () => {
      (window as any).fontRequests++;
      return Array.from(
        { length: 2000 },
        (_, i) => `Installed font ${String(i).padStart(4, "0")}`,
      );
    };
  });
  await page.getByRole("button", { name: /^Settings/ }).click();
  expect(await page.evaluate(() => (window as any).fontRequests)).toBe(0);
  await page.getByRole("combobox", { name: "Interface font" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "2000 installed fonts" }),
  ).toBeVisible();
  expect(await page.getByRole("option").count()).toBeLessThanOrEqual(12);
  await page
    .getByRole("textbox", { name: "Search installed fonts" })
    .fill("1999");
  await page
    .getByRole("option", { name: "Installed font 1999", exact: true })
    .click();
  await expect(page.locator(".font-live-preview > p")).toHaveCSS(
    "font-family",
    /Installed font 1999/,
  );
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("DM Sans");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("DM Sans");
  await page.getByRole("combobox", { name: "Interface font" }).click();
  await page
    .getByRole("textbox", { name: "Search installed fonts" })
    .fill("1999");
  await page
    .getByRole("option", { name: "Installed font 1999", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply font", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("Installed font 1999");
  expect(await page.evaluate(() => (window as any).fontRequests)).toBe(1);
  await page
    .getByRole("button", { name: "Use default font", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Interface font" }),
  ).toContainText("DM Sans");
});
test("workspace inspector searches every skill and inserts the native command", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.listSkills = async () => ({
      skills: Array.from({ length: 116 }, (_, i) => ({
        selector: `skill-${i}`,
        description: `Project task ${i}`,
      })),
    });
  });
  await page.getByRole("button", { name: "New conversation ＋" }).click();
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(page.locator(".inspector-skills h3")).toContainText("116");
  await expect(page.locator(".skill-row")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "Search project skills" })
    .fill("skill-115");
  await page.getByRole("button", { name: "/skill-115", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message Muse" })).toHaveValue(
    "/skill-115 ",
  );
  await expect(page.locator(".inspector .engine-card")).toHaveCount(0);
});
for (const width of [760, 1100])
  test(`collapsed rail preserves the footer and active chat at ${width}px with many projects`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 580 });
    await page.evaluate(() =>
      (window as any).testBridge.setSessions(
        Array.from({ length: 80 }, (_, i) => ({
          sessionId: `project-${i}`,
          name: `Chat ${i}`,
          workspaceRoot: `/projects/project-${i}`,
        })),
      ),
    );
    await page.locator(".session-row").first().click();
    const before = (await page.locator(".breadcrumb").textContent())!;
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    for (const name of ["Expand sidebar", "Muse CLI", "Settings"]) {
      const target = page
        .locator(".workspace-sidebar")
        .getByRole("button", { name, exact: true });
      expect(
        await target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            !!hit &&
            (hit === el || el.contains(hit))
          );
        }),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".rail-project").first().click();
    await expect(page.locator(".breadcrumb")).toHaveText(before);
    await expect(
      page.getByRole("button", { name: "Collapse sidebar", exact: true }),
    ).toBeVisible();
  });
test("a disk preview keeps messages after hundreds of steps while the native reload is pending", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.resumeSession = async () => ({
      session: { sessionId: "cached", workspaceRoot: "/projects/studio" },
      history: {
        items: [
          {
            itemId: "user",
            kind: "userMessage",
            text: "Cached request",
            revision: 1,
            status: "completed",
          },
          {
            itemId: "answer",
            kind: "agentMessage",
            text: "Cached comment",
            revision: 1,
            status: "completed",
          },
          ...Array.from({ length: 500 }, (_, i) => ({
            itemId: `event-${i}`,
            kind: "toolCall",
            tool: "read_file",
            status: "completed",
            revision: 1,
          })),
        ],
      },
    });
    (window as any).testBridge.setSessions([
      {
        sessionId: "cached",
        name: "Cached conversation",
        workspaceRoot: "/projects/studio",
      },
    ]);
  });
  await page.locator(".session-row").click();
  await expect(page.locator(".assistant-message")).toContainText(
    "Cached comment",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const request = indexedDB.open("muse-conversation-cache", 1);
            request.onsuccess = () => {
              const read = request.result
                .transaction("chats")
                .objectStore("chats")
                .get("cached");
              read.onsuccess = () => {
                resolve(
                  read.result?.items.filter(
                    (item: any) => item.kind === "agentMessage",
                  ).length || 0,
                );
                request.result.close();
              };
            };
          }),
      ),
    )
    .toBe(1);
  await page.addInitScript(() => {
    (window as any).testBridge.setSessions([
      {
        sessionId: "cached",
        name: "Cached conversation",
        workspaceRoot: "/projects/studio",
      },
    ]);
    (window as any).muse.resumeSession = () => new Promise(() => {});
  });
  await page.reload();
  await page.locator(".session-row").click();
  await expect(
    page.getByText("Updating from Muse…", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".user-message")).toContainText("Cached request");
  await expect(page.locator(".assistant-message")).toContainText(
    "Cached comment",
  );
});
test("MCP refresh shows progress and rejects duplicate clicks until the native read completes", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.mcpInventory = () =>
      new Promise((resolve) => {
        (window as any).releaseMcp = resolve;
      });
  });
  const refresh = page.getByRole("button", {
    name: "Refresh MCP configuration",
    exact: true,
  });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(refresh.locator("svg")).toHaveClass(/spin/);
  await page.evaluate(() =>
    (window as any).releaseMcp({
      servers: [
        { name: "updated-server", transport: "stdio", status: "configured" },
      ],
    }),
  );
  await expect(refresh).toBeEnabled();
  await expect(page.getByText("updated-server", { exact: true })).toBeVisible();
});
