import { defineConfig, devices } from "@playwright/test";

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const labFrontendUrl = process.env.E2E_LAB_FRONTEND_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: labFrontendUrl,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/lab.json",
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../breeding-app-backend",
      url: `${backendUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 4173",
      url: labFrontendUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
