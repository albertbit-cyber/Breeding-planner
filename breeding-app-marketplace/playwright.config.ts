import { defineConfig, devices } from "@playwright/test";

/**
 * Deterministic end-to-end tests against a local backend, the same arrangement
 * as the lab and breeder apps: `npm run test:e2e:reset` reseeds the local test
 * database (the backend refuses to reset anything that is not local) and then
 * runs these specs.
 *
 * The frontend runs on its own port so it never collides with a dev server on
 * 5173, and is built against whichever backend E2E_BACKEND_URL names.
 */
const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
const frontendUrl = process.env.E2E_MARKETPLACE_FRONTEND_URL || "http://127.0.0.1:4175";
const frontendPort = new URL(frontendUrl).port || "4175";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
      command: `npx vite --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_API_URL: `${backendUrl}/api` },
    },
  ],
});
