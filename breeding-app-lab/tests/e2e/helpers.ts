import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
export const labFrontendUrl = process.env.E2E_LAB_FRONTEND_URL || "http://127.0.0.1:4173";
export const labEmail = process.env.E2E_LAB_EMAIL || "lab@proherper.dev";
export const breederEmail = process.env.E2E_BREEDER_EMAIL || "breeder@proherper.dev";
export const expectedOrderNumber = process.env.E2E_EXPECTED_ORDER_NUMBER || "05AA00001";

/** The second seeded laboratory. Exists so isolation can be proven, not assumed. */
export const labBEmail = process.env.E2E_LAB_B_EMAIL || "lab-b@proherper.dev";
export const requireLabBPassword = (): string =>
  String(process.env.E2E_LAB_B_PASSWORD || "demo1234").trim();

/** Signs in via the API as a given laboratory and returns its bearer token. */
export const loginLabViaApi = async (
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> => {
  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const token = String(body?.token || "");
  expect(token.length).toBeGreaterThan(0);
  return token;
};

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

/**
 * Signs in through the Lab Portal's own gate.
 *
 * The gate was rewritten when laboratory onboarding became invitation-only: it
 * no longer has the breeder app's multi-step chooser, so there is no "Log in"
 * mode button to press first and no "Continue" — the sign-in form is simply the
 * page.
 */
export const loginAsLabUser = async (
  page: Page,
  email: string = labEmail,
  password: string = requireLabPassword()
): Promise<void> => {
  await page.goto("/#/lab/dashboard");
  await expect(page.getByRole("heading", { name: /laboratory portal/i })).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
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
