import { expect, test } from "@playwright/test";
import { backendUrl } from "./helpers";

test("backend health endpoint is reachable", async ({ request }) => {
  const response = await request.get(`${backendUrl}/api/health`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toMatchObject({
    ok: true,
    service: "breeding-planner-shared-backend",
  });
});
