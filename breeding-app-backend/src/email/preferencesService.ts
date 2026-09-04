import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";

const db = prisma as any;

export const NOTIFICATION_CATEGORIES = [
  "account_and_security",
  "organization_invitations",
  "lab_orders",
  "breeding_reminders",
  "incubation_reminders",
  "unexpected_breeding_events",
  "weekly_summary",
  "product_updates",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Required operational categories cannot be disabled by the user — they cover
 * authentication, verification, and security-relevant account notices.
 */
export const REQUIRED_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(["account_and_security"]);

/**
 * Conservative defaults for a user who has never touched their preferences.
 * Marketing-adjacent categories (weekly digest, product updates) default off
 * so nobody is silently opted into non-essential mail.
 */
const DEFAULT_ENABLED: Record<NotificationCategory, boolean> = {
  account_and_security: true,
  organization_invitations: true,
  // A laboratory order is a transaction the breeder started and is waiting on.
  // Defaulting it off would mean results arriving with nobody told.
  lab_orders: true,
  breeding_reminders: true,
  incubation_reminders: true,
  unexpected_breeding_events: true,
  weekly_summary: false,
  product_updates: false,
};

export type PreferenceRecord = {
  category: NotificationCategory;
  enabled: boolean;
  timezone: string;
  leadTimeMinutes: number | null;
  digest: string;
};

const isKnownCategory = (category: string): category is NotificationCategory =>
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(category);

export const listPreferences = async (userId: string): Promise<PreferenceRecord[]> => {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  const byCategory = new Map<string, any>(rows.map((row: any) => [row.category, row]));

  return NOTIFICATION_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    return {
      category,
      enabled: row ? row.enabled : DEFAULT_ENABLED[category],
      timezone: row?.timezone || "UTC",
      leadTimeMinutes: row?.leadTimeMinutes ?? null,
      digest: row?.digest || "immediate",
    };
  });
};

export const isCategoryEnabled = async (userId: string, category: NotificationCategory): Promise<boolean> => {
  if (REQUIRED_CATEGORIES.has(category)) return true;
  const row = await db.notificationPreference.findUnique({
    where: { userId_category: { userId, category } },
  });
  return row ? Boolean(row.enabled) : DEFAULT_ENABLED[category];
};

export const setPreference = async (
  userId: string,
  category: string,
  updates: { enabled?: boolean; timezone?: string; leadTimeMinutes?: number | null; digest?: string }
): Promise<PreferenceRecord> => {
  if (!isKnownCategory(category)) throw new HttpError(400, "Unknown notification category.");
  if (REQUIRED_CATEGORIES.has(category) && updates.enabled === false) {
    throw new HttpError(400, "This notification category is required and cannot be disabled.");
  }

  const row = await db.notificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: {
      userId,
      category,
      enabled: updates.enabled ?? DEFAULT_ENABLED[category],
      timezone: updates.timezone || "UTC",
      leadTimeMinutes: updates.leadTimeMinutes ?? null,
      digest: updates.digest || "immediate",
    },
    update: {
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
      ...(updates.leadTimeMinutes !== undefined ? { leadTimeMinutes: updates.leadTimeMinutes } : {}),
      ...(updates.digest !== undefined ? { digest: updates.digest } : {}),
    },
  });

  return {
    category: row.category,
    enabled: row.enabled,
    timezone: row.timezone,
    leadTimeMinutes: row.leadTimeMinutes,
    digest: row.digest,
  };
};
