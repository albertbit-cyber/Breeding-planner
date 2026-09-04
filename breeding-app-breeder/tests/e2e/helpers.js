import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import base from "@playwright/test";

export const expect = base.expect;

export const backendUrl = process.env.E2E_BACKEND_URL || "http://127.0.0.1:4000";
export const breederFrontendUrl = process.env.E2E_BREEDER_FRONTEND_URL || "http://127.0.0.1:4174";
export const breederEmail = process.env.E2E_BREEDER_EMAIL || "breeder@proherper.dev";
export const labEmail = process.env.E2E_LAB_EMAIL || "lab@proherper.dev";
export const expectedSeedSnakeId = process.env.E2E_BREEDER_SEED_SNAKE_ID || "25Ath-1";
export const expectedSeedSnakeName = process.env.E2E_BREEDER_SEED_SNAKE_NAME || "Athena - DEMO";
export const expectedSeedLabName = process.env.E2E_SEED_LAB_NAME || "Seed Genetics Lab";
export const expectedSeedSnakeSpecies =
  process.env.E2E_BREEDER_SEED_SNAKE_SPECIES || "Ball Pythons";

export const requireBreederPassword = () => {
  const password = String(process.env.E2E_BREEDER_PASSWORD || "breeder1234").trim();
  if (!password || password === "replace-with-local-seeded-password") {
    throw new Error("E2E_BREEDER_PASSWORD must be set in the local shell or breeding-app-breeder/.env.e2e.local.");
  }
  return password;
};

export const requireLabPassword = () => {
  const password = String(process.env.E2E_LAB_PASSWORD || "demo1234").trim();
  if (!password || password === "replace-with-local-seeded-password") {
    throw new Error("E2E_LAB_PASSWORD must be set in the local shell or breeding-app-breeder/.env.e2e.local.");
  }
  return password;
};

export const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
});

export const loginViaApi = async (request, email, password) => {
  const response = await request.post(`${backendUrl}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const token = String(body?.token || "");
  const refreshToken = String(body?.refreshToken || "");
  expect(token.length).toBeGreaterThan(20);
  expect(refreshToken.length).toBeGreaterThan(20);
  return { token, refreshToken, user: body?.user || {} };
};

export const loginBreederViaApi = (request) =>
  loginViaApi(request, breederEmail, requireBreederPassword());

export const loginLabViaApi = (request) =>
  loginViaApi(request, labEmail, requireLabPassword());

export const loadBreederAuthFromStorageState = () => {
  const authPath = resolve("playwright/.auth/breeder.json");
  const state = JSON.parse(readFileSync(authPath, "utf8"));
  const origin = state?.origins?.find((entry) => entry?.origin === new URL(breederFrontendUrl).origin);
  const storage = Array.isArray(origin?.localStorage) ? origin.localStorage : [];
  const token = String(storage.find((entry) => entry?.name === "breedingPlannerBreederAuthToken")?.value || "");
  const refreshToken = String(storage.find((entry) => entry?.name === "breedingPlannerBreederRefreshToken")?.value || "");
  const sessionRaw = String(storage.find((entry) => entry?.name === "breedingPlannerBreederAuthSession")?.value || "{}");
  const session = JSON.parse(sessionRaw);
  expect(token.length).toBeGreaterThan(20);
  return { token, refreshToken, user: { email: breederEmail, fullName: session?.profile?.fullName || "Seed Breeder" } };
};

export const installBreederAuthInPage = async (page, auth) => {
  const fullName = String(auth?.user?.fullName || "Seed Breeder");
  const session = {
    isAuthenticated: true,
    mode: "login",
    role: "breeder",
    profile: {
      fullName,
      displayName: fullName,
      email: String(auth?.user?.email || breederEmail),
      reptileCount: "",
      role: "breeder",
    },
    authenticatedAt: new Date().toISOString(),
  };

  await page.addInitScript(
    ({ token, refreshToken, authSession }) => {
      localStorage.setItem("breedingPlannerBreederAuthToken", token);
      localStorage.setItem("breedingPlannerBreederRefreshToken", refreshToken);
      localStorage.setItem("breedingPlannerBreederAuthMode", "cookie-preferred");
      localStorage.setItem("breedingPlannerBreederAuthSession", authSession);
    },
    {
      token: String(auth?.token || ""),
      refreshToken: String(auth?.refreshToken || ""),
      authSession: JSON.stringify(session),
    }
  );
};

export const openAuthenticatedBreeder = async (page, hashPath = "/breeder") => {
  await page.goto(`/#${hashPath}`);
  await expect(page.getByText("Serpentora").first()).toBeVisible();
  await expect(page.getByText(/signed in as/i)).toBeVisible();
};

export const collectConsoleErrors = (page) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

/**
 * Pick a laboratory and one of its tests.
 *
 * Tests belong to a laboratory now, not to the platform, so there is no
 * catalogue to order from until one is chosen. These helpers used to read the
 * shared seed library and post an order with no laboratory at all, which the
 * backend rightly refuses.
 */
export const chooseLabAndTest = async (request, breederToken) => {
  const directoryResponse = await request.get(`${backendUrl}/api/lab/directory`, {
    headers: authHeaders(breederToken),
  });
  expect(directoryResponse.status()).toBe(200);
  const directoryBody = await directoryResponse.json();
  const labs = Array.isArray(directoryBody?.labs) ? directoryBody.labs : [];
  // Named rather than taken by position. The directory is ordered by laboratory
  // name, so "the first one" is whichever sorts first -- and these specs then act
  // on the order as the seeded laboratory, which would be a different tenant and
  // a correct 404.
  const chosen = labs.find((lab) => lab?.labName === expectedSeedLabName) || labs[0];
  const labOrganizationId = String(chosen?.organizationId || "");
  expect(labOrganizationId, `Expected laboratory ${expectedSeedLabName} in the directory`).toBeTruthy();

  const labResponse = await request.get(
    `${backendUrl}/api/lab/directory/${encodeURIComponent(labOrganizationId)}`,
    { headers: authHeaders(breederToken) }
  );
  expect(labResponse.status()).toBe(200);
  const labBody = await labResponse.json();
  const offerings = Array.isArray(labBody?.offerings) ? labBody.offerings : [];
  const first = offerings.find((entry) => entry?.id);
  expect(first?.id).toBeTruthy();

  return { labOrganizationId, testId: String(first.id) };
};

export const fetchBreederCatalogTestId = async (request, breederToken) =>
  (await chooseLabAndTest(request, breederToken)).testId;

export const createBreederOrderForSnake = async (
  request,
  breederToken,
  animalId = expectedSeedSnakeId,
  animalName = animalId === expectedSeedSnakeId ? expectedSeedSnakeName : `Breeder E2E ${animalId}`
) => {
  const { labOrganizationId, testId } = await chooseLabAndTest(request, breederToken);
  const response = await request.post(`${backendUrl}/api/lab/orders`, {
    headers: authHeaders(breederToken),
    data: {
      labOrganizationId,
      animals: [
        {
          animalId,
          animalName,
          selectedTestIds: [testId],
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body?.order?.id).toBeTruthy();
  return body.order;
};

export const patchOrderStatus = async (request, labToken, orderId, status) => {
  const response = await request.patch(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/status`, {
    headers: authHeaders(labToken),
    data: { status },
  });
  expect(response.status()).toBe(200);
};

export const patchOrderPayment = async (request, labToken, orderId, paymentStatus) => {
  const response = await request.patch(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/payment`, {
    headers: authHeaders(labToken),
    data: { paymentStatus },
  });
  expect(response.status()).toBe(200);
};

export const getOrderDetails = async (request, token, orderId) => {
  const response = await request.get(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}`, {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.order;
};

export const submitCompleteNegativeResult = async (request, labToken, orderId, testCode) => {
  const order = await getOrderDetails(request, labToken, orderId);
  const animals = Array.isArray(order.animals) ? order.animals : [];
  expect(animals.length).toBeGreaterThan(0);
  const animalResults = animals.map((animal) => {
    const tests = Array.isArray(animal.tests) ? animal.tests : [];
    expect(tests.length).toBeGreaterThan(0);
    return {
      animalId: String(animal.animalId || ""),
      items: tests.map((test, index) => ({
        orderedTestKey: `${orderId}:${animal.animalId}:${index + 1}`,
        geneName: String(test?.testNameSnapshot || test?.testId || `Test ${index + 1}`),
        resultStatus: "not_detected",
      })),
    };
  });
  const response = await request.post(`${backendUrl}/api/lab/orders/${encodeURIComponent(orderId)}/results/submit`, {
    headers: authHeaders(labToken),
    data: {
      orderId,
      testCode,
      method: "PCR",
      animalResults,
      summary: "Breeder browser E2E completed result",
    },
  });
  expect(response.status()).toBe(200);
};

export const completeBreederOrderForCertificate = async (
  request,
  breederToken,
  labToken,
  animalId = expectedSeedSnakeId,
  animalName = expectedSeedSnakeName
) => {
  const order = await createBreederOrderForSnake(request, breederToken, animalId, animalName);
  await patchOrderStatus(request, labToken, order.id, "in_progress");
  await patchOrderPayment(request, labToken, order.id, "paid");
  await submitCompleteNegativeResult(request, labToken, order.id, `BREEDER-UI-${Date.now()}`);
  await patchOrderStatus(request, labToken, order.id, "completed");
  return order;
};

/**
 * Pick the laboratory in the order modal.
 *
 * Tests, prices and turnaround all come from the chosen laboratory, so nothing
 * is selectable until one is picked. These specs predate that step and went
 * straight for a test checkbox.
 */
export const chooseLabInOrderModal = async (page, labName = expectedSeedLabName) => {
  const labButton = page.getByRole("button", { name: new RegExp(labName, "i") }).first();
  await expect(labButton).toBeVisible();
  await labButton.click();
};

export const openSeedSnakeEditor = async (page) => {
  await openAuthenticatedBreeder(page);
  // Since multi-species landed, the collection is reached through a species
  // rather than through a single Animals tab -- that tab only exists once a
  // species is chosen. These specs still navigated the old way.
  await page.getByRole("button", { name: expectedSeedSnakeSpecies }).first().click();
  await page.getByPlaceholder(/Search name, morph, het, tag/i).fill(expectedSeedSnakeName);
  await expect(page.getByText(expectedSeedSnakeName)).toBeVisible();
  await page.getByRole("button", { name: /^Edit$/i }).first().click();
  await expect(page.getByText(expectedSeedSnakeName).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Order Genetic Test/i })).toBeVisible();
};
