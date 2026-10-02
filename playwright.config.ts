import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5273",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:4241/api/health",
      reuseExistingServer: false,
      env: {
        WORDSMITH_DEMO_MODE: "true",
        API_PORT: "4241",
        PUBLIC_PORT: "4242",
        WEB_ORIGIN: "http://localhost:5273",
      },
    },
    {
      command: "npm run dev:web",
      env: { WEB_PORT: "5273", API_PORT: "4241" },
      url: "http://localhost:5273",
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
