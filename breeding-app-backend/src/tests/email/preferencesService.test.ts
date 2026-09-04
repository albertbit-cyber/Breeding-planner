import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { isCategoryEnabled, listPreferences, setPreference, NOTIFICATION_CATEGORIES } from "../../email/preferencesService";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("preferencesService", () => {
  it("required categories are always enabled, even without a stored row", async () => {
    const enabled = await isCategoryEnabled("user-1", "account_and_security");
    expect(enabled).toBe(true);
    expect(db.notificationPreference.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to conservative defaults when no preference row exists", async () => {
    db.notificationPreference.findUnique.mockResolvedValue(null);
    expect(await isCategoryEnabled("user-1", "breeding_reminders")).toBe(true);
    expect(await isCategoryEnabled("user-1", "product_updates")).toBe(false);
  });

  it("respects a stored preference override", async () => {
    db.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    expect(await isCategoryEnabled("user-1", "breeding_reminders")).toBe(false);
  });

  it("rejects disabling a required category", async () => {
    await expect(setPreference("user-1", "account_and_security", { enabled: false }))
      .rejects.toThrow("required and cannot be disabled");
    expect(db.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", async () => {
    await expect(setPreference("user-1", "not_a_real_category", { enabled: false }))
      .rejects.toThrow("Unknown notification category");
  });

  it("upserts a valid preference change", async () => {
    db.notificationPreference.upsert.mockResolvedValue({
      category: "weekly_summary",
      enabled: true,
      timezone: "America/New_York",
      leadTimeMinutes: null,
      digest: "immediate",
    });
    const result = await setPreference("user-1", "weekly_summary", { enabled: true, timezone: "America/New_York" });
    expect(result.enabled).toBe(true);
    expect(result.timezone).toBe("America/New_York");
  });

  it("listPreferences fills in every known category with defaults or stored values", async () => {
    db.notificationPreference.findMany.mockResolvedValue([
      { category: "breeding_reminders", enabled: false, timezone: "UTC", leadTimeMinutes: 60, digest: "immediate" },
    ]);
    const preferences = await listPreferences("user-1");
    // Asserted against the list itself: the point is that every known category
    // comes back, not that there happen to be seven of them today.
    expect(preferences).toHaveLength(NOTIFICATION_CATEGORIES.length);
    expect(preferences.map((p) => p.category).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
    const breeding = preferences.find((p) => p.category === "breeding_reminders");
    expect(breeding?.enabled).toBe(false);
    const security = preferences.find((p) => p.category === "account_and_security");
    expect(security?.enabled).toBe(true);
  });
});
