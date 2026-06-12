# Marketplace Messaging Security Plan

Step: 254

## Current State

- Marketplace conversations are authenticated.
- Buyer cannot contact themselves about their own listing.
- Conversation read/write checks require buyer, seller, or admin.
- Inquiry service validates basic fields and message length.

## Gaps

- No spam throttling beyond auth limiter.
- No content moderation pipeline.
- No attachment security plan.
- No reporting/blocking workflow specific to conversations.

## Plan

- Add per-user and per-listing message rate limits.
- Add duplicate message detection.
- Add blocked user/seller controls.
- Add report conversation/message endpoint.
- Add moderation statuses: open, flagged, restricted, archived.
- Add audit events for blocked or flagged messages.
- Keep buyer contact details hidden until policy says otherwise.

## Tests

- outsider cannot read conversation;
- seller and buyer can read their own conversation;
- message limit returns 429;
- self-contact returns 400;
- flagged conversation appears in admin moderation.
