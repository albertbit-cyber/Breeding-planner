-- Add buyer to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'buyer';

-- Create Profile table
CREATE TABLE "Profile" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "breederName"         TEXT,
    "logoUrl"             TEXT,
    "location"            TEXT,
    "bio"                 TEXT,
    "websiteUrl"          TEXT,
    "instagramHandle"     TEXT,
    "facebookHandle"      TEXT,
    "telegramHandle"      TEXT,
    "publicContactEmail"  TEXT,
    "publicContactPhone"  TEXT,
    "contactPreference"   TEXT DEFAULT 'email',
    "isPublic"            BOOLEAN NOT NULL DEFAULT false,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one profile per user
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_key" UNIQUE ("userId");

-- Index
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");

-- Foreign key
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
