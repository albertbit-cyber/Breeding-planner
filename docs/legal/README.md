# Legal documents — status and review checklist

**Status:** drafted, wired, **not yet reviewed by a lawyer.**
**Date:** 2026-08-02

## Where they live

The documents are React pages in `breeding-app-public`, and those pages are the
**single source of truth**:

- `breeding-app-public/src/pages/PrivacyPage.jsx` → `/privacy`
- `breeding-app-public/src/pages/TermsPage.jsx` → `/terms`

They are deliberately *not* mirrored into markdown here. Two copies of a legal
document that can drift apart is worse than having one — if you need a copy for a
lawyer, export it from the rendered page rather than forking the text.

## What this closed

The readiness audit flagged that both signup forms linked to a Terms of Service
and Privacy Policy that did not exist anywhere in the repository. That is now
resolved in three places:

- `breeding-app-public` footer — the two `href="#"` placeholders now route to the real pages.
- `breeding-app-public` register form — "By signing up you agree to…" now links both documents.
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
| Data retention period after account deletion | Privacy | Suggested 30 days; must match what the deletion flow actually does. |
| Minimum age | Both | 16 is the GDPR default; some member states set 13–15. |
| Price-change notice period | Terms | Suggested 30 days. |
| Minimum liability floor | Terms | Suggested a modest figure such as EUR 100. |
| Governing law and jurisdiction | Terms | Depends on where the entity is established. |

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

**3. Note what the documents currently promise that the product cannot yet do.**
The Privacy Policy commits to data export and deletion on request. Today that is an
admin-tracked manual process — there is no self-service export or delete flow
(implementation plan §5.2, not started). Honouring requests by hand is lawful, but it
must actually happen within one month. Either build the self-service flow or make sure
someone is genuinely watching the inbox.

## Related

- Implementation plan §5 (Phase 3 — Compliance & Trust) for the remaining data-rights work.
- The `GdprRequest` model and admin GDPR page, which is where requests are tracked today.
