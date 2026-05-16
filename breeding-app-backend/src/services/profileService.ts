import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { listPublicListingsByOwner } from "./listingService";

type ProfilePayload = {
  breederName?: unknown;
  logoUrl?: unknown;
  location?: unknown;
  bio?: unknown;
  websiteUrl?: unknown;
  instagramHandle?: unknown;
  facebookHandle?: unknown;
  telegramHandle?: unknown;
  publicContactEmail?: unknown;
  publicContactPhone?: unknown;
  contactPreference?: unknown;
  isPublic?: unknown;
};

const db = prisma as any;

const textValue = (value: unknown, maxLength = 500): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const boolValue = (value: unknown): boolean => {
  if (value === true) return true;
  if (value === false) return false;
  return String(value || "").trim().toLowerCase() === "true";
};

const sanitizeProfileInput = (input: ProfilePayload) => ({
  breederName: textValue(input.breederName, 120),
  logoUrl: textValue(input.logoUrl, 1000),
  location: textValue(input.location, 160),
  bio: textValue(input.bio, 2000),
  websiteUrl: textValue(input.websiteUrl, 1000),
  instagramHandle: textValue(input.instagramHandle, 120),
  facebookHandle: textValue(input.facebookHandle, 120),
  telegramHandle: textValue(input.telegramHandle, 120),
  publicContactEmail: textValue(input.publicContactEmail, 180),
  publicContactPhone: textValue(input.publicContactPhone, 80),
  contactPreference: textValue(input.contactPreference, 40) || "email",
  isPublic: boolValue(input.isPublic),
});

const toPublicProfile = (row: any) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    breederName: row.breederName,
    logoUrl: row.logoUrl,
    location: row.location,
    bio: row.bio,
    websiteUrl: row.websiteUrl,
    instagramHandle: row.instagramHandle,
    facebookHandle: row.facebookHandle,
    telegramHandle: row.telegramHandle,
    publicContactEmail: row.publicContactEmail,
    publicContactPhone: row.publicContactPhone,
    contactPreference: row.contactPreference,
    isPublic: row.isPublic,
    updatedAt: row.updatedAt,
    user: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
        }
      : undefined,
  };
};

export const getMyProfile = async (userId: string) => {
  const profile = await db.profile.findUnique({
    where: { userId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  return toPublicProfile(profile);
};

export const upsertMyProfile = async (userId: string, input: ProfilePayload) => {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw new HttpError(404, "User not found.");
  if (user.role !== "breeder" && user.role !== "admin") {
    throw new HttpError(403, "Only breeder or admin users can publish breeder profiles.");
  }

  const data = sanitizeProfileInput(input || {});
  const profile = await db.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  return toPublicProfile(profile);
};

export const listPublicBreederProfiles = async () => {
  const profiles = await db.profile.findMany({
    where: {
      isPublic: true,
      user: {
        isActive: true,
        role: { in: ["breeder", "admin"] },
      },
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  return Promise.all(profiles.map(async (profile: any) => ({
    ...toPublicProfile(profile),
    listings: await listPublicListingsByOwner(profile.userId),
  })));
};
