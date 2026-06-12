# Permission And Ownership Hardening Plan

Step: 246

## Goals

- Centralize role and ownership checks.
- Make DTO output explicit and public-safe.
- Ensure breeder, buyer, lab, and admin boundaries are enforced in services and tests.

## Recommended Work

1. Add permission helper modules:
   - `canManageListing(actor, listing)`
   - `canViewConversation(actor, conversation)`
   - `canManageLabOrder(actor, order)`
   - `canViewBreederData(actor, ownerId)`
2. Add DTO modules per surface:
   - `marketplacePublicDto`
   - `marketplaceSellerDto`
   - `marketplaceAdminDto`
   - `labOrderBreederDto`
   - `labOrderLabDto`
3. Add test coverage:
   - buyer cannot edit seller listing;
   - breeder cannot read another breeder's order;
   - seller cannot read unrelated conversations;
   - admin can perform moderation actions;
   - public marketplace DTO excludes internal fields.

## Priority

Start with marketplace listing, conversation, and breeder lab order DTO boundaries because those are user-facing and cross-role.
