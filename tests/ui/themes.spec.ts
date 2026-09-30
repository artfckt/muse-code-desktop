import { test, expect } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await page.getByRole("button", { name: /^Settings/ }).click();
});

test("all palettes preview immediately and the choice survives a reload", async ({
  page,
}) => {
  for (const id of [
    "muse",
    "paper",
    "midnight",
    "forest",
    "rose",
    "graphite",
  ]) {
    await page.locator(`.theme-choice:has(input[value="${id}"])`).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    await expect(page.locator(`input[value="${id}"]`)).toBeChecked();
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".sidebar")!).backgroundColor,
      ),
    ).not.toBe(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
    );
  }
  await page.locator('.theme-choice:has(input[value="paper"])').click();
  await page.screenshot({ path: "test-results/themes-paper.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await page.getByRole("button", { name: /^Settings/ }).click();
  await expect(page.locator('input[value="paper"]')).toBeChecked();
  await page.setViewportSize({ width: 900, height: 620 });
  await expect(page.getByText("Follow system", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("system appearance updates live and manual selections stay fixed", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("radio", { name: /Follow system/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "muse");
  await page.locator('.theme-choice:has(input[value="forest"])').click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
});

test("an open terminal recolors without restarting its native session", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Muse CLI Native", exact: true })
    .click();
  await expect(page.locator(".xterm-rows")).toContainText(
    "Muse Code native terminal fixture",
  );
  await expect(page.locator(".xterm-fg-2").first()).toHaveCSS(
    "color",
    "rgb(167, 197, 177)",
  );
  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.locator('.theme-choice:has(input[value="rose"])').click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".xterm-viewport")).toHaveCSS(
    "background-color",
    "rgb(251, 242, 242)",
  );
  await expect(page.locator(".xterm-fg-2").first()).toHaveCSS(
    "color",
    "rgb(70, 105, 93)",
  );
  await expect(page.locator(".xterm-rows")).toContainText(
    "Muse Code native terminal fixture",
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls.filter(
          (call: any) => call[0] === "terminalStart",
        ).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as any).testBridge.calls
          .filter((call: any) => call[0] === "setWindowTheme")
          .at(-1)[1],
    ),
  ).toEqual({ background: "#fbf2f2", foreground: "#3f2d36" });
});

test("unknown stored themes fall back safely", async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem("muse-desktop-theme", "missing-theme"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "muse");
});
