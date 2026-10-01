import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:4141/api/health",
      reuseExistingServer: true,
      env: {
        WORDSMITH_DEMO_MODE: "true"
      }
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:5173",
      reuseExistingServer: true
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
