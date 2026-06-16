# Marketplace Public Exposure Audit

Step: 251

## Current Marketplace Surfaces

- Legacy listing routes under `/api/listings`.
- New marketplace routes under `/api/marketplace`.
- Profile marketplace route under `/api/profiles/marketplace`.
- All marketplace browse/detail routes currently require authentication.

## Public DTO Observations

- `marketplaceService.normalizeListing` shapes output and does not expose password hashes or refresh tokens.
- Seller DTO includes seller public identity, verification state, store/profile-derived display data, rating, and public location.
- Legacy `listingService.toPublicListing` includes the raw listing payload object first, then overrides several fields. This is a potential internal-field leakage risk if payload contains private breeder fields.
- Public profile DTO includes public contact email/phone by design when profile is public.

## Risks

- DTO logic is spread across services.
- Legacy marketplace payload may leak fields not intentionally approved for public display.
- Authenticated marketplace browse makes exposure smaller now, but future anonymous browsing would increase risk.
- Public data settings are passed through but not centrally enforced.

## Recommendation

Create explicit allowlist DTO functions before opening anonymous marketplace browsing.
