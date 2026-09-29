import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 20000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 940 },
    launchOptions: process.env.MUSE_CHROMIUM_PATH
      ? { executablePath: process.env.MUSE_CHROMIUM_PATH }
      : {},
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
