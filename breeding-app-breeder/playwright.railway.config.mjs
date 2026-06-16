import { devices } from "@playwright/test";

const backendUrl = process.env.E2E_BACKEND_URL || "https://breeding-planner-production.up.railway.app";
const breederFrontendUrl = process.env.E2E_BREEDER_FRONTEND_URL || "https://breeder-app-production.up.railway.app";

export default {
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 15_000 },
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
  // No webServer — tests run against already-deployed Railway services
};
