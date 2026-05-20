import base from "@playwright/test";
import { backendUrl, expect } from "./helpers.js";

const test = base;

test("backend health endpoint is reachable from breeder runner", async ({ request }) => {
  const response = await request.get(`${backendUrl}/api/health`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status || body.ok).toBeTruthy();
});
