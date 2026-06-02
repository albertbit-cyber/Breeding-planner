import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
export const labFrontendUrl = process.env.E2E_LAB_FRONTEND_URL || "http://127.0.0.1:4173";
export const labEmail = process.env.E2E_LAB_EMAIL || "lab@proherper.dev";
export const breederEmail = process.env.E2E_BREEDER_EMAIL || "breeder@proherper.dev";
export const expectedOrderNumber = process.env.E2E_EXPECTED_ORDER_NUMBER || "05AA00001";

export const requireLabPassword = (): string => {
  const password = String(process.env.E2E_LAB_PASSWORD || "demo1234").trim();
  if (!password || password === "replace-with-local-seeded-password") {
    throw new Error("E2E_LAB_PASSWORD must be set in the local shell or breeding-app-lab/.env.e2e.local.");
  }
  return password;
};

export const requireBreederPassword = (): string => {
  const password = String(process.env.E2E_BREEDER_PASSWORD || "breeder1234").trim();
  if (!password || password === "replace-with-local-seeded-password") {
    throw new Error("E2E_BREEDER_PASSWORD must be set in the local shell or breeding-app-lab/.env.e2e.local.");
  }
  return password;
};

export const loginAsLabUser = async (page: Page): Promise<void> => {
  await page.goto("/#/lab/dashboard");
  await expect(page.getByRole("heading", { name: /breeding planner/i })).toBeVisible();
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.getByRole("textbox").first().fill(labEmail);
  await page.locator('input[type="password"]').fill(requireLabPassword());
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByText(/signed in as/i)).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "/lab/incoming-orders";
  });
  await expect(page.getByText("Laboratory")).toBeVisible();
  await expect(page.getByText("Lab Workflow")).toBeVisible();
};

export const openAuthenticatedLab = async (page: Page, hashPath = "/lab/incoming-orders"): Promise<void> => {
  await page.goto(`/#${hashPath}`);
  await expect(page.getByText("Laboratory")).toBeVisible();
  await expect(page.getByText("Lab Workflow")).toBeVisible();
};

export const loginViaApi = async (request: APIRequestContext): Promise<string> => {
  if (cachedLabToken) {
    return cachedLabToken;
  }

  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: {
      email: labEmail,
      password: requireLabPassword(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const token = String(body?.token || "");
  expect(token.length).toBeGreaterThan(20);
  cachedLabToken = token;
  return token;
};

let cachedLabToken = "";

export const loginBreederViaApi = async (request: APIRequestContext): Promise<string> => {
  if (cachedBreederToken) {
    return cachedBreederToken;
  }

  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: {
      email: breederEmail,
      password: requireBreederPassword(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const token = String(body?.token || "");
  expect(token.length).toBeGreaterThan(20);
  cachedBreederToken = token;
  return token;
};

let cachedBreederToken = "";

export const collectConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
};
