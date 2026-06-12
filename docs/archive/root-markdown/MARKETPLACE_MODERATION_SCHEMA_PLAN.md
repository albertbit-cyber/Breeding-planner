# Marketplace Moderation Schema Plan

## Goal
Add database support for marketplace message reporting and buyer/seller blocking.

## Models Planned
- `MarketplaceMessageReport`
- `MarketplaceUserBlock`

## Behavior
- Users can report suspicious messages.
- Users can block direct marketplace communication from another user.
- Moderators/admins can review open reports later.

## Current Phase
The models were added to Prisma schema and migration SQL. Runtime routes are pending.

