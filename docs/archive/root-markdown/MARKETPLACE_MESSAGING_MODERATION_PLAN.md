# Marketplace Messaging Moderation Plan

## Goal
Reduce marketplace spam and unsafe messages while keeping legitimate buyer/seller communication usable.

## Planned Runtime
- Message rate limiter.
- Basic content length and repeated-message detection.
- Report/block endpoints for conversations.
- Moderator queue for reported messages.
- Security events for blocked/reported messages.

## Implemented In This Phase
- Production-only `marketplaceMessageLimiter` was attached to conversation creation and message send routes.

## Remaining Work
- Add report/block models.
- Add moderation status fields to messages.
- Add admin moderation UI.

