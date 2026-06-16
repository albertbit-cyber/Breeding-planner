import { devices } from "@playwright/test";

const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const breederFrontendUrl = process.env.E2E_BREEDER_FRONTEND_URL || "http://127.0.0.1:4174";

export default {
  testDir: "./tests/e2e",
  timeout: 45_000,
  workers: 1,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: breederFrontendUrl,
    acceptDownloads: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.js/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.js/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/breeder.json",
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
      command: "npm run dev -- --port 4174",
      url: breederFrontendUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
};
