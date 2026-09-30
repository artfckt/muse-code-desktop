import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
  await page.evaluate(() =>
    (window as any).testBridge.setSessions(
      ["a", "b"].map((id) => ({
        sessionId: id,
        name: `Chat ${id}`,
        workspaceRoot: `/projects/${id}`,
        updatedAt: new Date().toISOString(),
      })),
    ),
  );
});
const chat = (page: Page, id: string) =>
  page.locator(".session-row").filter({ hasText: `Chat ${id}` });
const message = (page: Page) =>
  page.getByRole("textbox", { name: "Message Muse" });
test("draft text and attachments stay with their chat and survive a reload", async ({
  page,
}) => {
  await chat(page, "a").click();
  await message(page).fill("Draft for A");
  await page.locator("input[type=file]").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A attachment"),
  });
  await expect(page.locator(".image-attachments")).toContainText("notes.txt");
  await chat(page, "b").click();
  await expect(message(page)).toHaveValue("");
  await expect(page.locator(".image-attachments")).toHaveCount(0);
  await message(page).fill("Draft for B");
  await chat(page, "a").click();
  await expect(message(page)).toHaveValue("Draft for A");
  await expect(page.locator(".image-attachments")).toContainText("notes.txt");
  await page.reload();
  await page.evaluate(() =>
    (window as any).testBridge.setSessions([
      {
        sessionId: "a",
        name: "Chat a",
        workspaceRoot: "/projects/a",
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  await chat(page, "a").click();
  await expect(message(page)).toHaveValue("Draft for A");
  await expect(page.locator(".image-attachments")).toContainText("notes.txt");
});
test("out-of-order session loads cannot replace the latest selection or its event buffer", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.resume = {};
    w.muse.resumeSession = (id: string) =>
      new Promise((resolve) => (w.resume[id] = resolve));
  });
  await chat(page, "a").click();
  await chat(page, "b").click();
  await page.evaluate(() =>
    (window as any).resume.b({
      session: { sessionId: "b", workspaceRoot: "/projects/b" },
      history: {
        items: [
          { itemId: "b-answer", kind: "agentMessage", text: "B selected" },
        ],
      },
    }),
  );
  await expect(page.getByText("B selected", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as any).resume.a({
      session: { sessionId: "a", workspaceRoot: "/projects/a" },
      history: {
        items: [
          { itemId: "a-answer", kind: "agentMessage", text: "A obsolete" },
        ],
      },
    }),
  );
  await expect(page.locator(".breadcrumb")).toContainText("Chat b");
  await expect(page.getByText("A obsolete", { exact: true })).toHaveCount(0);
  await expect(page.getByText("B selected", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});
test("send acknowledgement does not delete a new draft typed while submitting", async ({
  page,
}) => {
  await chat(page, "a").click();
  await page.evaluate(() => {
    const w = window as any;
    w.muse.sendTurn = (payload: any) => {
      w.sent = payload;
      return new Promise((resolve) => (w.ack = resolve));
    };
  });
  await message(page).fill("Send this");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).sent?.text))
    .toBe("Send this");
  await message(page).fill("Keep my next message");
  await page.evaluate(() => (window as any).ack({ disposition: "started" }));
  await expect(message(page)).toHaveValue("Keep my next message");
});
test("skill invocation keeps document text and local file reference", async ({
  page,
}) => {
  await chat(page, "a").click();
  await page.evaluate(() => {
    const w = window as any;
    w.muse.listSkills = async () => ({ skills: [{ selector: "review" }] });
    w.muse.saveAttachment = async (input: any) => ({
      id: "doc",
      path: "/saved/brief.txt",
      mediaType: "text/plain",
      text: "Important requirements",
    });
    w.muse.sendTurn = async (payload: any) => {
      w.sent = payload;
      return { disposition: "started" };
    };
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Important requirements"),
  });
  await expect(page.locator(".image-attachments")).toContainText("brief.txt");
  await message(page).fill("/review check this");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).sent?.text))
    .toContain("Important requirements");
  expect(await page.evaluate(() => (window as any).sent.skill)).toEqual({
    selector: "review",
    arguments: "check this",
  });
});
test("mixed upload batch retains valid files and reports individual failures", async ({
  page,
}) => {
  await chat(page, "a").click();
  await page.locator("input[type=file]").setInputFiles([
    { name: "valid.txt", mimeType: "text/plain", buffer: Buffer.from("Valid") },
    {
      name: "bad.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("Invalid"),
    },
  ]);
  await expect(page.locator(".image-attachments")).toContainText("valid.txt");
  await expect(page.getByRole("alert")).toContainText("bad.exe");
});
test("modal traps focus, restores trigger, and Escape dismisses the font menu first", async ({
  page,
}) => {
  const settings = page.getByRole("button", { name: /^Settings/ });
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  const font = page.getByRole("combobox", { name: "Interface font" });
  await font.click();
  await font.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("listbox", { name: "Interface font" }),
  ).toHaveCount(0);
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});
test("activity remains selected on completion, and large histories have bounded initial DOM", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).muse.resumeSession = async (id: string) => ({
      session: { sessionId: id, workspaceRoot: "/projects/a" },
      history: {
        items: Array.from({ length: 2000 }, (_, i) => ({
          itemId: `m${i}`,
          kind: i % 2 ? "agentMessage" : "userMessage",
          status: "completed",
          text: `Message ${i}`,
        })),
      },
    });
  });
  await chat(page, "a").click();
  await expect(page.getByText("Message 1999", { exact: true })).toBeVisible();
  expect(await page.locator(".transcript article").count()).toBeLessThanOrEqual(
    200,
  );
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "turn/completed",
      params: { sessionId: "a", turnId: "t", terminal: "completed" },
    }),
  );
  await expect(
    page.getByRole("button", { name: "Activity", exact: true }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await page.getByRole("button", { name: /Show earlier messages/ }).click();
  await expect(page.locator(".transcript article")).toHaveCount(400);
});
test("conversations can be archived, restored and exported without deleting native history", async ({
  page,
}) => {
  await chat(page, "a")
    .locator("..")
    .getByRole("button", { name: "Conversation actions" })
    .click();
  await page
    .getByRole("button", { name: "Archive conversation", exact: true })
    .click();
  await expect(chat(page, "a")).toHaveCount(0);
  await page.getByRole("button", { name: /Show archived/ }).click();
  await chat(page, "a")
    .locator("..")
    .getByRole("button", { name: "Conversation actions" })
    .click();
  await page
    .getByRole("button", { name: "Restore conversation", exact: true })
    .click();
  await chat(page, "a")
    .locator("..")
    .getByRole("button", { name: "Conversation actions" })
    .click();
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect(
    await page.evaluate(() =>
      (window as any).testBridge.calls.some(
        (call: any) => call[0] === "exportSession" && call[1] === "a",
      ),
    ),
  ).toBe(true);
});
test("failed startup finishes loading and provides retry instead of an endless skeleton", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).muse.bootstrap = async () => {
      throw new Error("Host unavailable");
    };
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading projects" }),
  ).toHaveCount(0);
});

test("malformed file links stay contained and escaped remote images keep their URL", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://example.invalid/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GZAAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await chat(page, "a").click();
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "item/completed",
      params: {
        sessionId: "a",
        item: {
          itemId: "urls",
          kind: "agentMessage",
          revision: 1,
          status: "completed",
          text: "![invalid](file://%)\n\n![Remote](https://example.invalid/a%23b.png)",
        },
      },
    }),
  );
  await expect(page.locator("img[alt=Remote]")).toBeVisible();
  await page.locator("img[alt=Remote]").scrollIntoViewIfNeeded();
  await expect
    .poll(() => requests)
    .toContain("https://example.invalid/a%23b.png");
  expect(errors).toEqual([]);
});
test("usage observations never go backwards or survive an account switch", async ({
  page,
}) => {
  const now = Date.now();
  await page.evaluate((now) => {
    const w = window as any;
    w.testBridge.emit({
      method: "usage/changed",
      params: {
        observedAtMs: now,
        window: { usedPercent: 70, resetsAtMs: now + 100000 },
      },
    });
    w.testBridge.emit({
      method: "usage/changed",
      params: {
        observedAtMs: now - 1000,
        window: { usedPercent: 20, resetsAtMs: now + 100000 },
      },
    });
  }, now);
  await expect(page.locator(".usage-meter")).toContainText("70%");
  await page.evaluate(() =>
    (window as any).testBridge.setAccount({
      state: "accountLogin",
      label: "Different account",
    }),
  );
  await expect(page.getByText("No usage reported yet")).toBeVisible();
  await page.evaluate(
    (now) =>
      (window as any).testBridge.emit({
        method: "usage/changed",
        params: { observedAtMs: now - 1000, window: { usedPercent: 20 } },
      }),
    now,
  );
  await expect(page.locator(".usage-meter")).toHaveCount(0);
});
test("agent view has loading, beta version, and latest-message navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.muse.readSession = async (id: string) => {
      await new Promise((r) => setTimeout(r, 500));
      return {
        session: { sessionId: id, modelId: "muse" },
        history: {
          items: Array.from({ length: 120 }, (_, i) => ({
            itemId: `a${i}`,
            kind: i % 2 ? "agentMessage" : "userMessage",
            revision: 1,
            status: "completed",
            text: `Agent message ${i}`,
          })),
        },
      };
    };
  });
  await page.goto("/?agent=child&parent=a");
  await expect(
    page.getByRole("status", { name: "Loading agent messages" }),
  ).toBeVisible();
  await expect(
    page.getByText("Agent message 119", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".window-bar")).toContainText("0.6.0-beta.1");
  await page.locator(".chat-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(
    page.getByRole("button", { name: "Jump to latest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect(
    page.getByText("Agent message 119", { exact: true }),
  ).toBeInViewport();
});
