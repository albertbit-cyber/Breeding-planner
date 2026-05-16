import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { FEATURE_CATALOG, LIMIT_FEATURE_KEYS } from "./subscriptionCatalog";

const db = prisma as any;

const TIER_INCLUDE = {
  features: { include: { feature: true }, orderBy: { featureKey: "asc" } },
  _count: { select: { subscriptions: true } },
};

const money = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const intOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.floor(parsed);
};

const dateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid date.");
  return parsed;
};

const assertReason = (value: unknown): string => {
  const reason = String(value || "").trim();
  if (!reason) throw new HttpError(400, "A reason is required.");
  return reason;
};

const normalizeTier = (tier: any) => ({
  id: tier.id,
  key: tier.key,
  name: tier.name,
  shortDescription: tier.shortDescription || "",
  longDescription: tier.longDescription || "",
  badgeText: tier.badgeText || "",
  monthlyPrice: Number(tier.monthlyPrice || 0),
  yearlyPrice: Number(tier.yearlyPrice || 0),
  currency: tier.currency || "EUR",
  trialDays: Number(tier.trialDays || 0),
  setupFee: tier.setupFee === null || tier.setupFee === undefined ? null : Number(tier.setupFee),
  discountLabel: tier.discountLabel || "",
  customPrice: Boolean(tier.customPrice),
  isActive: Boolean(tier.isActive),
  isPublic: Boolean(tier.isPublic),
  isRecommended: Boolean(tier.isRecommended),
  sortOrder: Number(tier.sortOrder || 0),
  archivedAt: tier.archivedAt || null,
  activeUsers: Number(tier._count?.subscriptions || 0),
  features: (tier.features || []).map((entry: any) => ({
    id: entry.id,
    featureKey: entry.featureKey,
    enabled: Boolean(entry.enabled),
    limitValue: entry.limitValue,
    featureName: entry.feature?.featureName || entry.featureKey,
    featureGroup: entry.feature?.featureGroup || "Other",
    defaultLimitType: entry.feature?.defaultLimitType || null,
  })),
  createdAt: tier.createdAt,
  updatedAt: tier.updatedAt,
});

const normalizeFeature = (feature: any) => ({
  id: feature.id,
  featureKey: feature.featureKey,
  featureName: feature.featureName,
  featureGroup: feature.featureGroup,
  description: feature.description || "",
  defaultLimitType: feature.defaultLimitType || null,
  sortOrder: feature.sortOrder || 0,
});

const logAdminAction = async (input: {
  adminUserId?: string;
  targetUserId?: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason: string;
  internalNote?: string;
}) => db.adminAuditLog.create({
  data: {
    adminUserId: input.adminUserId || null,
    targetUserId: input.targetUserId || null,
    action: input.action,
    beforeJson: input.beforeJson || null,
    afterJson: input.afterJson || null,
    reason: input.reason,
    internalNote: input.internalNote || null,
  },
});

export const ensureFeatureCatalog = async () => {
  for (const [index, item] of FEATURE_CATALOG.entries()) {
    await db.featureCatalog.upsert({
      where: { featureKey: item.featureKey },
      update: {
        featureName: item.featureName,
        featureGroup: item.featureGroup,
        description: item.description || null,
        defaultLimitType: item.defaultLimitType || null,
        sortOrder: index + 1,
      },
      create: {
        featureKey: item.featureKey,
        featureName: item.featureName,
        featureGroup: item.featureGroup,
        description: item.description || null,
        defaultLimitType: item.defaultLimitType || null,
        sortOrder: index + 1,
      },
    });
  }
};

export const listFeatureCatalog = async () => {
  await ensureFeatureCatalog();
  const features = await db.featureCatalog.findMany({ orderBy: [{ featureGroup: "asc" }, { sortOrder: "asc" }] });
  return { features: features.map(normalizeFeature) };
};

const tierDataFromPayload = (payload: Record<string, unknown>) => ({
  name: String(payload.name || "New Tier").trim(),
  key: String(payload.key || payload.name || "new-tier").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
  shortDescription: String(payload.shortDescription || "").trim() || null,
  longDescription: String(payload.longDescription || "").trim() || null,
  badgeText: String(payload.badgeText || "").trim() || null,
  monthlyPrice: money(payload.monthlyPrice),
  yearlyPrice: money(payload.yearlyPrice),
  currency: String(payload.currency || "EUR").trim().toUpperCase() || "EUR",
  trialDays: Math.max(0, Number(payload.trialDays || 0) || 0),
  setupFee: payload.setupFee === "" || payload.setupFee === undefined ? null : money(payload.setupFee),
  discountLabel: String(payload.discountLabel || "").trim() || null,
  customPrice: Boolean(payload.customPrice),
  isActive: payload.isActive !== false,
  isPublic: payload.isPublic !== false,
  isRecommended: Boolean(payload.isRecommended),
  sortOrder: Number(payload.sortOrder || 0) || 0,
});

const syncTierFeatures = async (tx: any, tierId: string, features: unknown) => {
  if (!Array.isArray(features)) return;
  for (const feature of features) {
    const record = feature && typeof feature === "object" ? feature as Record<string, unknown> : null;
    const featureKey = String(record?.featureKey || "").trim();
    if (!featureKey) continue;
    await tx.tierFeature.upsert({
      where: { tierId_featureKey: { tierId, featureKey } },
      update: {
        enabled: Boolean(record?.enabled),
        limitValue: intOrNull(record?.limitValue),
      },
      create: {
        tierId,
        featureKey,
        enabled: Boolean(record?.enabled),
        limitValue: intOrNull(record?.limitValue),
      },
    });
  }
};

export const listSubscriptionTiers = async (query: Record<string, unknown> = {}) => {
  const includeArchived = String(query.includeArchived || "") === "true";
  const tiers = await db.subscriptionTier.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    include: TIER_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
  });
  return { tiers: tiers.map(normalizeTier) };
};

export const listPublicSubscriptionTiers = async () => {
  const tiers = await db.subscriptionTier.findMany({
    where: { isActive: true, isPublic: true, archivedAt: null },
    include: TIER_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
  });
  return { tiers: tiers.map(normalizeTier) };
};

export const getSubscriptionTier = async (idOrKey: string) => {
  const tier = await db.subscriptionTier.findFirst({
    where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
    include: TIER_INCLUDE,
  });
  if (!tier) throw new HttpError(404, "Subscription tier not found.");
  return { tier: normalizeTier(tier) };
};

export const createSubscriptionTier = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  await ensureFeatureCatalog();
  const data = tierDataFromPayload(payload);
  if (!data.key) throw new HttpError(400, "Tier key is required.");
  const created = await db.$transaction(async (tx: any) => {
    const tier = await tx.subscriptionTier.create({ data });
    await syncTierFeatures(tx, tier.id, payload.features);
    return tx.subscriptionTier.findUnique({ where: { id: tier.id }, include: TIER_INCLUDE });
  });
  await logAdminAction({ adminUserId: actor.id, action: "tier_created", afterJson: { id: created.id, key: created.key }, reason: "tier_created" });
  return { tier: normalizeTier(created) };
};

export const updateSubscriptionTier = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown>) => {
  await ensureFeatureCatalog();
  const before = await db.subscriptionTier.findUnique({ where: { id }, include: TIER_INCLUDE });
  if (!before) throw new HttpError(404, "Subscription tier not found.");
  const reason = String(payload.reason || "tier_updated").trim();
  const data = tierDataFromPayload({ ...before, ...payload, key: before.key });
  const updated = await db.$transaction(async (tx: any) => {
    await tx.subscriptionTier.update({ where: { id }, data });
    await syncTierFeatures(tx, id, payload.features);
    return tx.subscriptionTier.findUnique({ where: { id }, include: TIER_INCLUDE });
  });
  await logAdminAction({ adminUserId: actor.id, action: "tier_updated", beforeJson: normalizeTier(before), afterJson: normalizeTier(updated), reason });
  return { tier: normalizeTier(updated) };
};

export const duplicateSubscriptionTier = async (actor: AuthenticatedUser, id: string) => {
  const source = await db.subscriptionTier.findUnique({ where: { id }, include: TIER_INCLUDE });
  if (!source) throw new HttpError(404, "Subscription tier not found.");
  const created = await db.$transaction(async (tx: any) => {
    const tier = await tx.subscriptionTier.create({
      data: {
        name: `${source.name} Copy`,
        key: `${source.key}_copy_${Date.now()}`,
        shortDescription: source.shortDescription,
        longDescription: source.longDescription,
        badgeText: source.badgeText,
        monthlyPrice: source.monthlyPrice,
        yearlyPrice: source.yearlyPrice,
        currency: source.currency,
        trialDays: source.trialDays,
        setupFee: source.setupFee,
        discountLabel: source.discountLabel,
        customPrice: source.customPrice,
        isActive: false,
        isPublic: false,
        isRecommended: false,
        sortOrder: source.sortOrder + 1,
      },
    });
    for (const featureEntry of source.features || []) {
      await tx.tierFeature.create({
        data: {
          tierId: tier.id,
          featureKey: featureEntry.featureKey,
          enabled: featureEntry.enabled,
          limitValue: featureEntry.limitValue,
        },
      });
    }
    return tx.subscriptionTier.findUnique({ where: { id: tier.id }, include: TIER_INCLUDE });
  });
  await logAdminAction({ adminUserId: actor.id, action: "tier_duplicated", beforeJson: { sourceId: id }, afterJson: { id: created.id }, reason: "tier_duplicated" });
  return { tier: normalizeTier(created) };
};

export const archiveSubscriptionTier = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown>) => {
  const reason = assertReason(payload.reason || "tier_archived");
  const before = await db.subscriptionTier.findUnique({ where: { id }, include: TIER_INCLUDE });
  if (!before) throw new HttpError(404, "Subscription tier not found.");
  const updated = await db.subscriptionTier.update({
    where: { id },
    data: { isActive: false, isPublic: false, archivedAt: new Date() },
    include: TIER_INCLUDE,
  });
  await logAdminAction({ adminUserId: actor.id, action: "tier_archived", beforeJson: normalizeTier(before), afterJson: normalizeTier(updated), reason });
  return { tier: normalizeTier(updated) };
};

const currentSubscriptionForUser = async (userId: string) => db.userSubscription.findFirst({
  where: { userId, status: { in: ["active", "trialing", "paused", "past_due"] } },
  include: { tier: { include: TIER_INCLUDE } },
  orderBy: { updatedAt: "desc" },
});

const monthlyPeriod = () => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
};

const usageForFeature = async (userId: string, featureKey: string): Promise<number> => {
  if (featureKey === "animals.create") return db.animal.count({ where: { ownerId: userId } });
  if (featureKey === "spaces.racks") return 0;
  if (featureKey === "spaces.rooms") return 0;
  const { start, end } = monthlyPeriod();
  const row = await db.usageTracking.findUnique({
    where: { userId_featureKey_periodStart: { userId, featureKey, periodStart: start } },
  });
  if (row) return Number(row.usedAmount || 0);
  await db.usageTracking.create({
    data: { userId, featureKey, periodStart: start, periodEnd: end, usedAmount: 0 },
  });
  return 0;
};

export const canAccessFeature = async (user: AuthenticatedUser | { id: string; role?: string }, featureKey: string) => {
  if (!user?.id) throw new HttpError(401, "Unauthorized");
  if (String(user.role || "").toLowerCase() === "admin") {
    return { allowed: true, featureKey, source: "admin", tier: "Admin" };
  }
  if (!db.userFeatureOverride || !db.userSubscription || !db.subscriptionTier) {
    return { allowed: true, featureKey, source: "unconfigured", tier: "Unconfigured" };
  }

  const override = await db.userFeatureOverride.findFirst({
    where: {
      userId: user.id,
      featureKey,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (override) {
    const used = await usageForFeature(user.id, featureKey);
    const limit = override.limitOverride;
    if (override.enabled && limit !== null && limit !== undefined && used >= limit) {
      return { allowed: false, featureKey, source: "override", reason: "Usage limit reached", currentUsage: used, limit, currentTier: "Manual override" };
    }
    return {
      allowed: Boolean(override.enabled),
      featureKey,
      source: "override",
      reason: override.enabled ? undefined : "Disabled by admin override",
      currentUsage: used,
      limit,
    };
  }

  const subscription = await currentSubscriptionForUser(user.id);
  const tier = subscription?.tier;
  const tierFeature = tier?.features?.find((entry: any) => entry.featureKey === featureKey);
  if (!tier || !tierFeature?.enabled) {
    const requiredTier = await db.subscriptionTier.findFirst({
      where: { isActive: true, archivedAt: null, features: { some: { featureKey, enabled: true } } },
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
    });
    return {
      allowed: false,
      featureKey,
      reason: requiredTier ? `Feature requires ${requiredTier.name} tier` : "Feature is not included in the current tier",
      requiredTier: requiredTier?.name || "",
      currentTier: tier?.name || "No active tier",
    };
  }

  const used = await usageForFeature(user.id, featureKey);
  const limit = tierFeature.limitValue;
  if (limit !== null && limit !== undefined && used >= limit) {
    return {
      allowed: false,
      featureKey,
      reason: "Usage limit reached",
      currentTier: tier.name,
      requiredTier: tier.name,
      currentUsage: used,
      limit,
    };
  }
  return { allowed: true, featureKey, source: "tier", tier: tier.name, currentUsage: used, limit };
};

export const getUserSubscriptionPanel = async (userId: string) => {
  const [subscription, overrides, usage, user] = await Promise.all([
    currentSubscriptionForUser(userId),
    db.userFeatureOverride.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.usageTracking.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, fullName: true, subscriptionPlan: true, subscriptionStatus: true, subscriptionPaymentStatus: true } }),
  ]);
  if (!user) throw new HttpError(404, "User not found.");
  const enabledFeatures = new Set<string>();
  const disabledFeatures = new Set<string>();
  for (const entry of subscription?.tier?.features || []) {
    if (entry.enabled) enabledFeatures.add(entry.featureKey);
    else disabledFeatures.add(entry.featureKey);
  }
  for (const override of overrides) {
    if (override.enabled) enabledFeatures.add(override.featureKey);
    else disabledFeatures.add(override.featureKey);
  }
  return {
    user,
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      paymentStatus: subscription.paymentStatus,
      startedAt: subscription.startedAt,
      trialEndsAt: subscription.trialEndsAt,
      renewsAt: subscription.renewsAt,
      cancelledAt: subscription.cancelledAt,
      paymentProvider: subscription.paymentProvider || "",
      tier: subscription.tier ? normalizeTier(subscription.tier) : null,
      internalNote: subscription.internalNote || "",
    } : null,
    overrides,
    enabledFeatures: Array.from(enabledFeatures).sort(),
    disabledFeatures: Array.from(disabledFeatures).sort(),
    usage,
  };
};

export const assignUserSubscription = async (actor: AuthenticatedUser, userId: string, payload: Record<string, unknown>) => {
  const tierId = String(payload.tierId || "").trim();
  const status = String(payload.status || "active").trim();
  const paymentStatus = String(payload.paymentStatus || "none").trim();
  const reason = assertReason(payload.reason);
  const tier = await db.subscriptionTier.findUnique({ where: { id: tierId } });
  if (!tier) throw new HttpError(404, "Subscription tier not found.");
  const subscription = await db.userSubscription.create({
    data: {
      userId,
      tierId,
      status,
      paymentStatus,
      trialEndsAt: dateOrNull(payload.trialEndsAt),
      renewsAt: dateOrNull(payload.renewsAt),
      paymentProvider: String(payload.paymentProvider || "").trim() || null,
      internalNote: String(payload.internalNote || "").trim() || null,
    },
    include: { tier: { include: TIER_INCLUDE } },
  });
  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: tier.key,
      subscriptionStatus: status,
      subscriptionPaymentStatus: paymentStatus,
      subscriptionStartedAt: subscription.startedAt,
      subscriptionRenewalAt: subscription.renewsAt,
      subscriptionTrialEndsAt: subscription.trialEndsAt,
    },
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: "subscription_assigned",
    afterJson: { tierId, tierKey: tier.key, status, paymentStatus },
    reason,
    internalNote: String(payload.internalNote || "").trim(),
  });
  return getUserSubscriptionPanel(userId);
};

export const createFeatureOverride = async (actor: AuthenticatedUser, userId: string, payload: Record<string, unknown>) => {
  const featureKey = String(payload.featureKey || "").trim();
  if (!featureKey) throw new HttpError(400, "featureKey is required.");
  const reason = assertReason(payload.reason);
  const override = await db.userFeatureOverride.create({
    data: {
      userId,
      featureKey,
      enabled: payload.enabled !== false,
      limitOverride: intOrNull(payload.limitOverride),
      reason,
      expiresAt: dateOrNull(payload.expiresAt),
      createdByAdminId: actor.id,
    },
  });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: "feature_override_created",
    afterJson: override,
    reason,
  });
  return getUserSubscriptionPanel(userId);
};

export const removeFeatureOverride = async (actor: AuthenticatedUser, userId: string, overrideId: string, payload: Record<string, unknown>) => {
  const reason = assertReason(payload.reason || "feature_override_removed");
  const override = await db.userFeatureOverride.findUnique({ where: { id: overrideId } });
  if (!override || override.userId !== userId) throw new HttpError(404, "Feature override not found.");
  await db.userFeatureOverride.delete({ where: { id: overrideId } });
  await logAdminAction({
    adminUserId: actor.id,
    targetUserId: userId,
    action: "feature_override_removed",
    beforeJson: override,
    reason,
  });
  return getUserSubscriptionPanel(userId);
};

export const resetUsageTracking = async (actor: AuthenticatedUser, userId: string, payload: Record<string, unknown>) => {
  const featureKey = String(payload.featureKey || "").trim();
  const reason = assertReason(payload.reason || "usage_reset");
  const where: any = { userId };
  if (featureKey) where.featureKey = featureKey;
  await db.usageTracking.updateMany({ where, data: { usedAmount: 0 } });
  await logAdminAction({ adminUserId: actor.id, targetUserId: userId, action: "usage_reset", afterJson: { featureKey: featureKey || "all" }, reason });
  return getUserSubscriptionPanel(userId);
};

export const trackUsage = async (userId: string, featureKey: string, amount = 1) => {
  const access = await canAccessFeature({ id: userId }, featureKey);
  if (!access.allowed) throw new HttpError(403, access.reason || "Feature access denied.");
  if (!LIMIT_FEATURE_KEYS.includes(featureKey)) return access;
  const { start, end } = monthlyPeriod();
  await db.usageTracking.upsert({
    where: { userId_featureKey_periodStart: { userId, featureKey, periodStart: start } },
    update: { usedAmount: { increment: amount }, limitAmount: access.limit ?? null },
    create: { userId, featureKey, periodStart: start, periodEnd: end, usedAmount: amount, limitAmount: access.limit ?? null },
  });
  return canAccessFeature({ id: userId }, featureKey);
};
