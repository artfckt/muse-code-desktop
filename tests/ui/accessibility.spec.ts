import { test, expect } from "@playwright/test";
import path from "node:path";
const themes = ["muse", "graphite", "paper", "midnight", "forest", "rose"];
for (const theme of themes)
  test(`readable metadata and accessible controls in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
    await page.goto("/");
    await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
    await page.evaluate(() =>
      (window as any).testBridge.setSessions([
        {
          sessionId: "theme",
          name: "Theme conversation",
          workspaceRoot: "/projects/studio",
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    await page.locator(".session-row").click();
    await page.evaluate(() =>
      (window as any).testBridge.emit({
        method: "item/completed",
        params: {
          sessionId: "theme",
          item: {
            itemId: "code",
            kind: "agentMessage",
            revision: 1,
            status: "completed",
            text: "```js\nconst answer = 42;\n```",
          },
        },
      }),
    );
    await page.getByRole("button", { name: /^Settings/ }).click();
    await page.locator(`.theme-choice:has(input[value="${theme}"])`).click();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () =>
      (
        await (window as any).axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        })
      ).violations.map((v: any) => ({
        id: v.id,
        nodes: v.nodes.map((n: any) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    );
    expect(violations).toEqual([]);
  });
for (const width of [900, 1100, 1440])
  test(`large typography and wide panels keep controls accessible at ${width}px`, async ({
    page,
  }) => {
    await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
    await page.addInitScript(() =>
      localStorage.setItem(
        "muse-desktop-preferences",
        JSON.stringify({
          uiSize: 16,
          chatSize: 24,
          leftWidth: 420,
          rightWidth: 420,
        }),
      ),
    );
    await page.setViewportSize({ width, height: 940 });
    await page.goto("/");
    await expect(page.locator(".connection-pill")).toHaveText("Local engine");
    await page.getByRole("button", { name: "New conversation ＋" }).click();
    await page.getByRole("button", { name: "Create conversation" }).click();
    for (const name of [
      "Conversation",
      "Activity",
      "Muse CLI Native",
      "Agents 0",
      "Rename",
    ]) {
      const target = page.getByRole("button", { name, exact: true });
      await expect(target).toBeVisible();
      expect(
        await target.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            !!hit &&
            (element === hit || element.contains(hit))
          );
        }),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
