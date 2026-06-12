# Public Safe Marketplace DTO Plan

Step: 252

## Goal

Prevent accidental public leakage by making marketplace DTOs allowlist-based.

## DTO Layers

- Public listing DTO:
  - title, species, category, genetics, sex, year/birthDate when allowed, price/currency, availability, location, public images, public seller summary.
- Seller dashboard DTO:
  - includes private analytics and seller-owned listing management fields.
- Admin DTO:
  - includes moderation status, reports, internal IDs, and audit context.
- Conversation DTO:
  - only participants and admins can see messages.

## Hidden By Default

- breeder private notes;
- internal animal IDs unless explicitly allowed;
- feeding/weight history unless explicitly allowed;
- private contact email/phone unless store/profile explicitly publishes them;
- payment details;
- buyer personal information except to involved seller/admin.

## Implementation Order

1. Add DTO module and tests.
2. Convert `/api/marketplace/listings`.
3. Convert `/api/profiles/marketplace` and legacy `/api/listings/marketplace`.
4. Add regression tests for forbidden fields.
