import { test, expect } from "@playwright/test";
import path from "node:path";
test("images and playable video stay in the transcript while Muse receives video frames", async ({
  page,
}) => {
  await page.addInitScript({ path: path.resolve("tests/ui/mock.cjs") });
  await page.goto("/");
  await expect(page.getByText("Using your CLI sign-in")).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("tests/fixtures/clip.webm"));
  await expect(page.locator(".image-attachments video")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Muse" })
    .fill("Inspect this clip");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finished" })).toBeVisible();
  const payload = await page.evaluate(
    () =>
      (window as any).testBridge.calls.find(
        (call: any) => call[0] === "sendTurn",
      )[1],
  );
  expect(payload.images).toHaveLength(4);
  expect(
    payload.images.every(
      (image: any) =>
        image.mediaType === "image/jpeg" && image.base64Data.length > 100,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "desktop/media",
      params: {
        sessionId: "session-1",
        commandId: "command-1",
        media: [
          {
            name: "clip.webm",
            mediaType: "video/webm",
            url: "https://example.com/clip.webm",
          },
        ],
      },
    }),
  );
  await expect(page.locator(".user-message video[controls]")).toBeVisible();
  await page.evaluate(() =>
    (window as any).testBridge.emit({
      method: "desktop/media",
      params: {
        sessionId: "session-1",
        commandId: "command-1",
        media: [
          {
            name: "reference.png",
            mediaType: "image/png",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GZAAAAAASUVORK5CYII=",
          },
        ],
      },
    }),
  );
  await expect(page.getByRole("img", { name: "reference.png" })).toBeVisible();
});
