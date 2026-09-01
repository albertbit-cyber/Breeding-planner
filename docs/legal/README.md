# Legal documents — status and review checklist

**Status:** drafted, wired, verified against the code, **not yet reviewed by a lawyer.**
**Date:** 2026-08-03

## Where they live

The documents are React pages in `breeding-app-home`, and those pages are the
**single source of truth**:

- `breeding-app-home/src/home/pages/PrivacyPage.jsx` → `/privacy`
- `breeding-app-home/src/home/pages/TermsPage.jsx` → `/terms`

They are deliberately *not* mirrored into markdown here. Two copies of a legal
document that can drift apart is worse than having one — if you need a copy for a
lawyer, export it from the rendered page rather than forking the text.

## What this closed

The readiness audit flagged that both signup forms linked to a Terms of Service
and Privacy Policy that did not exist anywhere in the repository. That is now
resolved in three places:

- `breeding-app-home` footer — the two `href="#"` placeholders now route to the real pages.
- `breeding-app-home` register form — "By signing up you agree to…" now links both documents.
- `breeding-app-breeder` signup (`AuthGate.jsx`) — the consent checkbox previously read
  "I agree to the Terms of Service and keeper guidelines" as plain text with nothing to open.
  It now renders links to the public site, via `VITE_PUBLIC_SITE_URL` (defaults to
  `https://serpentora.com`).

## What still needs a human before you charge anyone

These are drafted from what the product **actually does** — the real schema, the real
third-party processors, the real data flows — rather than from a template. That makes them
a solid starting point and should save a lawyer considerable time. It does not make them
legally sufficient.

**1. Fill the placeholders.** Every unfilled value is highlighted in yellow on the rendered
page, so they are hard to miss:

| Placeholder | Document | Notes |
|---|---|---|
| Legal entity name, registered address, company number | Both | Required — GDPR requires the controller be identifiable. |
| Privacy contact email | Privacy | Can be a normal address; does not have to be a DPO. |
| Minimum age | Both | 16 is the GDPR default; some member states set 13–15. |
| Price-change notice period | Terms | Suggested 30 days. |
| Minimum liability floor | Terms | Suggested a modest figure such as EUR 100. Note this is effectively the *whole* cap while the product is free — the "greater of fees paid in 12 months, or this floor" resolves to this floor for every user today. |
| Governing law and jurisdiction | Terms | Depends on where the entity is established. |

The retention-period placeholder is gone: deletion is implemented, and the documents now
state the real 30-day grace period rather than a guess.

**2. Get them reviewed.** Points worth directing counsel to specifically:

- **Whether a DPO or an EU representative is required.** Likely not at this scale, but it
  depends on the entity's location and processing volume.
- **Consumer withdrawal rights.** EU/UK consumers have a 14-day withdrawal right for digital
  services, with specific rules about waiving it to get immediate access. The subscription
  section does not currently handle that in detail.
- **The genetics-prediction disclaimer** (Terms §4). This is the clause most likely to matter
  commercially — a mispredicted het has real money attached — so it is worth making sure the
  wording is enforceable in the chosen jurisdiction.
- **Liability caps**, which are limited by consumer law in the EU/UK regardless of what is written.
- **The processor list**, which must be kept accurate. Adding a new service means updating it.

**3. The documents no longer promise anything the product cannot do.**
A review on 2026-08-03 found three claims that were false as written, all now resolved:

| Claim | Was | Now |
|---|---|---|
| "Sessions can be reviewed and revoked from your account" | No such endpoint existed — only `/logout`. | Claim removed. §8 describes what sessions actually do. |
| "We record a hashed form of your IP address" | `RefreshSession.ipHash` existed but was never written by any code. | Claim removed and replaced with an explicit "we do not store your IP address". |
| "You can export your records and close your account" | `GdprRequest` was a status table only; requests were admin-created and nothing executed them. | Both are real, self-service, and described in Privacy §7 and Terms §10. |

The same review found several categories of processing the policy did not mention at all —
marketplace messaging, verification submissions, abuse reports, mobile device records and
push tokens, feature usage counters, and staff access. All are now disclosed in Privacy §2
and §4.

## How deletion actually behaves

Worth knowing before answering a user's question about it:

- **30-day grace period.** Requesting deletion locks the account and revokes every session
  immediately; the purge runs 30 days later. Signing in during the window cancels it and
  emails the user, which is also the alarm if someone else requested it.
- **Full erasure, not anonymisation** (decided 2026-08-03). Marketplace sales and reviews go
  too. Two accepted consequences: a buyer loses their record of a purchase if the seller
  leaves, and a seller can shed bad reviews by re-registering.
- **One exception.** `AdminAuditLog` rows survive with the user reference nulled. They record
  what staff did, not what the user did, and erasing them would let a banned user destroy the
  evidence of their ban. This is disclosed in Privacy §4 and §6.
- **Tax records.** Not currently an issue — the platform processes no payments, and marketplace
  sales are private deals users log themselves. **Revisit this decision when billing launches**:
  once money flows through the platform, transaction records acquire a statutory retention
  period that overrides an erasure request, and full deletion of sales will no longer be lawful.

Implemented in `accountDeletionService.ts`, `accountDataExportService.ts` and
`accountPurgeWorker.ts`, with the erasure-blocking `ShedTestOrder` foreign key fixed in
migration `20260803120000_add_account_data_rights`.

## Related

- Implementation plan §5 (Phase 3 — Compliance & Trust).
- The `GdprRequest` model and admin GDPR page, still used to track requests that arrive by
  email (correction, objection, restriction) — the two self-service rights no longer route
  through it.
