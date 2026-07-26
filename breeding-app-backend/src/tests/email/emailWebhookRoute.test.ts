import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const WEBHOOK_SECRET = vi.hoisted(() => `whsec_${Buffer.from("route-test-secret-32-bytes!!!!").toString("base64")}`);

vi.mock("../../config/env", () => ({
  env: {
    nodeEnv: "test",
    port: 4000,
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    jwtSecret: "test-secret-for-vitest-only",
    corsOrigin: "",
    email: {
      enabled: false,
      provider: "mock",
      resendApiKey: "",
      resendWebhookSecret: WEBHOOK_SECRET,
      fromName: "Breeding Planner",
      fromAddress: "notifications@example.com",
      replyTo: "",
      workerEnabled: false,
      workerPollIntervalMs: 15000,
      workerBatchSize: 10,
      workerStuckJobMinutes: 10,
    },
    publicAppUrl: "https://app.example.com",
  },
}));

vi.mock("../../email/webhookService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../email/webhookService")>();
  return {
    ...actual,
    processResendWebhookEvent: vi.fn().mockResolvedValue({ outcome: "applied", status: "delivered" }),
  };
});

import { app } from "../../app";
import { processResendWebhookEvent } from "../../email/webhookService";

const sign = (svixId: string, svixTimestamp: string, body: string): string => {
  const secretBytes = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const signature = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${signature}`;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/resend", () => {
  it("accepts a validly signed webhook", async () => {
    const payload = { type: "email.delivered", data: { email_id: "msg_1" } };
    const body = JSON.stringify(payload);
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(svixId, svixTimestamp, body);

    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("Content-Type", "application/json")
      .set("svix-id", svixId)
      .set("svix-timestamp", svixTimestamp)
      .set("svix-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied");
    expect(processResendWebhookEvent).toHaveBeenCalledWith(svixId, payload);
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } });
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("Content-Type", "application/json")
      .set("svix-id", "msg_1")
      .set("svix-timestamp", String(Math.floor(Date.now() / 1000)))
      .set("svix-signature", "v1,not-a-real-signature")
      .send(body);

    expect(res.status).toBe(401);
    expect(processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a request with a missing signature header", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } });
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(401);
    expect(processResendWebhookEvent).not.toHaveBeenCalled();
  });
});
