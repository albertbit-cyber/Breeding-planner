# Marketplace Report And Block Route Plan

Date: 2026-05-20

## Goal

Expose the marketplace moderation runtime models through authenticated HTTP routes.

## Contract

- `POST /api/marketplace/messages/:id/report`
  - Authenticated.
  - Conversation participant or admin only.
  - Requires `reason`.
  - Creates `MarketplaceMessageReport`.

- `POST /api/marketplace/blocks`
  - Authenticated.
  - Requires `blockedUserId`.
  - Prevents self-blocks.
  - Creates or updates `MarketplaceUserBlock`.

- `GET /api/marketplace/blocks`
  - Authenticated.
  - Lists current user's blocks.

- `DELETE /api/marketplace/blocks/:blockedUserId`
  - Authenticated.
  - Removes a block for the current user.

