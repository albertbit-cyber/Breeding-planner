# Marketplace DTO Allowlist Implementation Report

Step: 275

## Implemented

- Centralized marketplace DTO allowlists in `breeding-app-backend/src/services/marketplaceDtos.ts`.
- Removed unsafe legacy listing `payload` spreading.
- Mapped legacy listings, public marketplace listings, moderation listings, marketplace listings, and stores through explicit allowlists.
- Public marketplace browse/detail/store endpoints are unauthenticated only after allowlisted DTO mapping.

## Validation

- DTO tests passed.
- Listing service tests passed.
- Backend build passed.

