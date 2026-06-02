import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { signAuthToken } from "../utils/jwt";

vi.mock("../services/marketplaceRuntimeService", () => ({
  blockMarketplaceUser: vi.fn(),
  createMarketplaceMediaUpload: vi.fn(),
  listMyMarketplaceBlocks: vi.fn(),
  listMyMarketplaceMedia: vi.fn(),
  reportMarketplaceMessage: vi.fn(),
  unblockMarketplaceUser: vi.fn(),
}));

import { app } from "../app";
import {
  blockMarketplaceUser,
  createMarketplaceMediaUpload,
  listMyMarketplaceBlocks,
  listMyMarketplaceMedia,
  reportMarketplaceMessage,
  unblockMarketplaceUser,
} from "../services/marketplaceRuntimeService";

const tokenFor = (role: "admin" | "breeder" | "buyer" = "breeder") =>
  signAuthToken({
    sub: `${role}-1`,
    email: `${role}@example.com`,
    role,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marketplace runtime routes", () => {
  it("uploads marketplace media for authenticated breeders", async () => {
    vi.mocked(createMarketplaceMediaUpload).mockResolvedValue({
      media: { id: "media-1", status: "ready", mimeType: "image/png" },
    } as any);

    const payload = { dataBase64: "iVBORw0KGgo=", originalName: "snake.png" };
    const res = await request(app)
      .post("/api/marketplace/uploads")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.media).toMatchObject({ id: "media-1", status: "ready" });
    expect(createMarketplaceMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "breeder-1", role: "breeder" }),
      payload
    );
  });

  it("rejects buyers from marketplace media upload", async () => {
    const res = await request(app)
      .post("/api/marketplace/uploads")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`)
      .send({ dataBase64: "iVBORw0KGgo=" });

    expect(res.status).toBe(403);
    expect(createMarketplaceMediaUpload).not.toHaveBeenCalled();
  });

  it("lists current user marketplace media", async () => {
    vi.mocked(listMyMarketplaceMedia).mockResolvedValue({
      media: [{ id: "media-1" }],
    } as any);

    const res = await request(app)
      .get("/api/marketplace/uploads/me")
      .set("Authorization", `Bearer ${tokenFor("breeder")}`);

    expect(res.status).toBe(200);
    expect(res.body.media).toEqual([{ id: "media-1" }]);
  });

  it("reports a marketplace message", async () => {
    vi.mocked(reportMarketplaceMessage).mockResolvedValue({
      report: { id: "report-1", status: "open" },
    } as any);

    const res = await request(app)
      .post("/api/marketplace/messages/message-1/report")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`)
      .send({ reason: "spam" });

    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({ id: "report-1", status: "open" });
    expect(reportMarketplaceMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "buyer-1", role: "buyer" }),
      "message-1",
      { reason: "spam" }
    );
  });

  it("blocks, lists, and unblocks marketplace users", async () => {
    vi.mocked(blockMarketplaceUser).mockResolvedValue({ block: { id: "block-1" } } as any);
    vi.mocked(listMyMarketplaceBlocks).mockResolvedValue({ blocks: [{ id: "block-1" }] } as any);
    vi.mocked(unblockMarketplaceUser).mockResolvedValue({ deleted: 1 } as any);

    const blockRes = await request(app)
      .post("/api/marketplace/blocks")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`)
      .send({ blockedUserId: "breeder-1" });
    expect(blockRes.status).toBe(201);
    expect(blockRes.body.block).toEqual({ id: "block-1" });

    const listRes = await request(app)
      .get("/api/marketplace/blocks")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.blocks).toEqual([{ id: "block-1" }]);

    const unblockRes = await request(app)
      .delete("/api/marketplace/blocks/breeder-1")
      .set("Authorization", `Bearer ${tokenFor("buyer")}`);
    expect(unblockRes.status).toBe(200);
    expect(unblockRes.body).toEqual({ deleted: 1 });
  });

  it("requires authentication for message reports", async () => {
    const res = await request(app)
      .post("/api/marketplace/messages/message-1/report")
      .send({ reason: "spam" });

    expect(res.status).toBe(401);
    expect(reportMarketplaceMessage).not.toHaveBeenCalled();
  });
});
