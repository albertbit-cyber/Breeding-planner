import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    securityEvent: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import { recordSecurityEvent } from "../services/securityEventService";

describe("security event service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists sanitized events without secrets", async () => {
    vi.mocked((prisma as any).securityEvent.create).mockResolvedValue({ id: "event-1" });

    await recordSecurityEvent({
      type: "auth.login.success",
      actorUserId: "user-1",
      outcome: "success",
      metadata: {
        token: "secret-token",
        nested: { password: "secret-password", safe: "value" },
      },
    });

    expect((prisma as any).securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "auth.login.success",
        actorUserId: "user-1",
        metadata: {
          token: "[redacted]",
          nested: { password: "[redacted]", safe: "value" },
        },
      }),
    });
  });
});

