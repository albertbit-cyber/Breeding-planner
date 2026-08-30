import { expect, test } from "@playwright/test";
import {
  backendUrl,
  labBEmail,
  labEmail,
  loginLabViaApi,
  requireLabBPassword,
  requireLabPassword,
} from "./helpers";
import { authHeaders } from "./order-test-helpers";

/**
 * Two laboratories, one platform.
 *
 * The unit and route suites prove isolation against mocks. This proves it
 * against a real database, a real session and the real HTTP stack — which is
 * where the original defect actually lived: the ownership rules existed, the
 * routes simply never applied them, and `listOrdersForUser` returned every
 * order in the system to any laboratory that asked.
 *
 * With one seeded laboratory none of this is testable, because "sees only its
 * own" and "sees everything" produce identical results. The second seeded
 * laboratory exists for exactly this file.
 */
test.describe("vendor laboratory isolation", () => {
  test("each laboratory sees only the orders addressed to it", async ({ request }) => {
    const labA = await loginLabViaApi(request, labEmail, requireLabPassword());
    const labB = await loginLabViaApi(request, labBEmail, requireLabBPassword());

    const [aResponse, bResponse] = await Promise.all([
      request.get(`${backendUrl}/api/lab/orders`, { headers: authHeaders(labA) }),
      request.get(`${backendUrl}/api/lab/orders`, { headers: authHeaders(labB) }),
    ]);
    expect(aResponse.status()).toBe(200);
    expect(bResponse.status()).toBe(200);

    const aOrders = (await aResponse.json())?.orders ?? [];
    const bOrders = (await bResponse.json())?.orders ?? [];

    // The seeded order belongs to laboratory A.
    expect(aOrders.length).toBeGreaterThan(0);

    const aIds = new Set(aOrders.map((order: { id: string }) => order.id));
    const bIds = new Set(bOrders.map((order: { id: string }) => order.id));
    const shared = [...aIds].filter((id) => bIds.has(id as string));
    expect(shared).toEqual([]);
  });

  test("a laboratory cannot open another's order", async ({ request }) => {
    const labA = await loginLabViaApi(request, labEmail, requireLabPassword());
    const labB = await loginLabViaApi(request, labBEmail, requireLabBPassword());

    const listResponse = await request.get(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(labA),
    });
    const orders = (await listResponse.json())?.orders ?? [];
    const targetId = String(orders[0]?.id || "");
    expect(targetId.length).toBeGreaterThan(0);

    const asOwner = await request.get(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}`,
      { headers: authHeaders(labA) }
    );
    expect(asOwner.status()).toBe(200);

    const asOther = await request.get(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}`,
      { headers: authHeaders(labB) }
    );
    // 404, not 403: confirming the id exists somewhere else is itself a leak.
    expect(asOther.status()).toBe(404);
  });

  test("a laboratory cannot advance or bill another's order", async ({ request }) => {
    const labA = await loginLabViaApi(request, labEmail, requireLabPassword());
    const labB = await loginLabViaApi(request, labBEmail, requireLabBPassword());

    const listResponse = await request.get(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(labA),
    });
    const targetId = String(((await listResponse.json())?.orders ?? [])[0]?.id || "");

    const statusAttempt = await request.patch(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}/status`,
      { headers: authHeaders(labB), data: { status: "received" } }
    );
    expect(statusAttempt.status()).toBe(404);

    const paymentAttempt = await request.patch(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}/payment`,
      { headers: authHeaders(labB), data: { paymentStatus: "paid" } }
    );
    expect(paymentAttempt.status()).toBe(404);

    // And the order is untouched.
    const after = await request.get(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}`,
      { headers: authHeaders(labA) }
    );
    const order = (await after.json())?.order;
    expect(order?.paymentStatus).not.toBe("paid");
  });

  test("a laboratory cannot write results onto another's order", async ({ request }) => {
    const labA = await loginLabViaApi(request, labEmail, requireLabPassword());
    const labB = await loginLabViaApi(request, labBEmail, requireLabBPassword());

    const listResponse = await request.get(`${backendUrl}/api/lab/orders`, {
      headers: authHeaders(labA),
    });
    const targetId = String(((await listResponse.json())?.orders ?? [])[0]?.id || "");

    const attempt = await request.post(
      `${backendUrl}/api/lab/orders/${encodeURIComponent(targetId)}/results/submit`,
      {
        headers: authHeaders(labB),
        data: { orderId: targetId, testCode: "INTRUDER", animalResults: [] },
      }
    );

    // The most consequential write of the lot: a confirmed result rewrites the
    // animal's recorded genetics in the breeder's own records.
    expect(attempt.status()).toBe(404);
  });

  test("each laboratory sees only its own tests and prices", async ({ request }) => {
    const labA = await loginLabViaApi(request, labEmail, requireLabPassword());
    const labB = await loginLabViaApi(request, labBEmail, requireLabBPassword());

    const [aTests, bTests] = await Promise.all([
      request.get(`${backendUrl}/api/lab/my/tests`, { headers: authHeaders(labA) }),
      request.get(`${backendUrl}/api/lab/my/tests`, { headers: authHeaders(labB) }),
    ]);

    const aOfferings = (await aTests.json())?.offerings ?? [];
    const bOfferings = (await bTests.json())?.offerings ?? [];
    expect(aOfferings.length).toBeGreaterThan(0);
    expect(bOfferings.length).toBeGreaterThan(0);

    const aOrgs = new Set(aOfferings.map((o: { organizationId: string }) => o.organizationId));
    const bOrgs = new Set(bOfferings.map((o: { organizationId: string }) => o.organizationId));
    expect(aOrgs.size).toBe(1);
    expect(bOrgs.size).toBe(1);
    expect([...aOrgs][0]).not.toBe([...bOrgs][0]);

    // Two laboratories both offering a test called "Clown" are two distinct
    // products, and neither can edit the other's.
    const targetOfferingId = String(aOfferings[0]?.id || "");
    const crossEdit = await request.patch(
      `${backendUrl}/api/lab/my/tests/${encodeURIComponent(targetOfferingId)}`,
      { headers: authHeaders(labB), data: { priceCents: 1 } }
    );
    expect(crossEdit.status()).toBe(404);

    const [aPricing, bPricing] = await Promise.all([
      request.get(`${backendUrl}/api/lab/my/pricing`, { headers: authHeaders(labA) }),
      request.get(`${backendUrl}/api/lab/my/pricing`, { headers: authHeaders(labB) }),
    ]);
    const aConfig = (await aPricing.json())?.pricing;
    const bConfig = (await bPricing.json())?.pricing;
    expect(aConfig?.organizationId).toBeTruthy();
    expect(bConfig?.organizationId).toBeTruthy();
    expect(aConfig.organizationId).not.toBe(bConfig.organizationId);
  });

  test("the portal shows a signed-in laboratory only its own queue", async ({ page }) => {
    const { loginAsLabUser } = await import("./helpers");

    // Through the real UI rather than the API, because a filter applied in the
    // service but dropped in the client would still be a leak on screen.
    await loginAsLabUser(page, labBEmail, requireLabBPassword());
    await page.evaluate(() => {
      window.location.hash = "/lab/incoming-orders";
    });

    // Laboratory B has no orders, so the seeded order number must not appear.
    await expect(page.getByText("05AA00001")).toHaveCount(0);
  });
});
