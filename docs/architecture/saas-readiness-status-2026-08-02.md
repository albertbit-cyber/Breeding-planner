# SaaS Readiness — Status Report

**Date:** 2026-08-02
**Covers:** work from 2026-07-27 (original audit) through 2026-08-02.
**Companion to:** [`saas-readiness-audit.md`](saas-readiness-audit.md) (the findings) and [`saas-implementation-plan.md`](saas-implementation-plan.md) (the plan). This document reports **what actually happened against that plan**, including what was deliberately not done and what remains unverified.

**Verification key used throughout:**
✅ **Verified** — confirmed working by direct observation (live endpoint, deployed bundle, passing test).
🟡 **Built, not active** — code exists and is correct, but is switched off or not yet deployed.
⚠️ **Unverified** — believed correct, never confirmed against a real environment.
⬜ **Not started.**

---

## 1. Executive Summary

The headline from the original audit was three hard blockers: no Organization model, no payment processing, no legal foundation. **One of the three is now substantially built but not yet merged or validated. The other two have not been started.**

However, the more consequential outcome of this period was not planned work at all. Phase 0 was scoped as light "stabilize the ground" hygiene. In practice, verifying it uncovered **ten real defects, several of them live in production**, including a completely broken admin console, a login path that returned HTTP 500 to every legitimate browser origin, and a security issue leaking the build environment into a public JavaScript bundle. All ten are fixed and deployed.

That changes the honest read on readiness. The original audit implicitly assumed the existing product worked and needed SaaS features added on top. It did not work as well as assumed. The gap between "tests pass" and "what is actually live and functioning" turned out to be the dominant risk — and it was invisible because there was no error tracking and no deployment verification.

**Current position:** the foundation is now genuinely more trustworthy than it was, and deployment is reliable for the first time. But the product is **not closer to being sellable** than it was two weeks ago in any commercial sense — no payment processing exists, no legal documents exist, and the tenancy work is written but unproven. Realistically, the plan's Phase 1 is roughly half done, and Phases 2–5 are untouched.

---

## 2. What Was Done

### 2.1 Production defects found and fixed

None of these were on the plan. All were discovered while verifying Phase 0, and all are fixed and live on `main`.

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | Backend deploys had been silently failing since 2026-07-26; production ran a stale build for ~4 days. Lockfile drift (`@emnapi/wasi-threads`) broke `npm ci`. | High | ✅ Fixed (`affc963`) |
| 2 | CORS rejection threw an `Error` instead of declining cleanly, so Express returned **HTTP 500 to every browser origin not on the allowlist** — which was every real frontend domain. | **Critical** | ✅ Fixed (`0c354fb`), verified live |
| 3 | Production `CORS_ORIGIN` contained no real domain at all — only `localhost` entries. | **Critical** | ✅ Fixed (dashboard), verified live |
| 4 | `breeding-app-admin` was a blank page in production — a circular chunk dependency (`vendor → vendor-react → vendor`) introduced by adding `@sentry/react` crashed on `React.createContext`. | **Critical** | ✅ Fixed (`299a7f7`) |
| 5 | **Security:** the entire build-machine environment was embedded as a plain object in the public `breeding-app-breeder` bundle. Confirmed live on `serpentora.com` — contained Netlify's build container env including a token-shaped variable. | **High (security)** | ✅ Fixed (`2e66dd0`) |
| 6 | Seven services/sites were deploying from a stale branch (`staging/runtime-review-20260521`), not `main`. | High | ✅ Fixed (dashboard) |
| 7 | Production's `Breeder-App` service built the bare repo root — which no longer has a `src/` — instead of `breeding-app-breeder`. It had been serving a legacy pre-extraction build. | High | ✅ Fixed (dashboard) |
| 8 | Sentry never initialized on any frontend: `(import.meta as any)?.env?.KEY` — optional chaining defeats Vite's static replacement, so the DSN silently resolved to `""`. | Medium | ✅ Fixed (`94b0e5b`) |
| 9 | Sentry discarded **every** automatic session: `@sentry/core` drops sessions when no `release` is set. | Medium | ✅ Fixed (`930b059`) |
| 10 | `breeding-app-lab` failed to build on Netlify — inherited the monorepo root's Tailwind PostCSS config for a dependency it never installed. | Medium | ✅ Fixed (`37ca78c`) |

Two of these (#8, #9) were self-inflicted — introduced by the Sentry work earlier in the same period and caught before they mattered. #4 was likewise introduced by adding Sentry, but did reach production before being caught.

### 2.2 Phase 0 — Stabilize the ground

| Item | Status | Notes |
|---|---|---|
| 0.1–0.4 (delete legacy backend, stale configs, wire Android, confirm staging URL) | ✅ Done | Completed before this period. |
| 0.5 Move auth tokens off `localStorage` | 🟡 **Built, not active** | httpOnly-cookie + CSRF path implemented for breeder/admin/lab, opt-in per deployment via same-origin `VITE_API_URL` detection, plus a Netlify `/api/*` proxy-rule generator. **Deliberately inert** — see §4.1. |
| 0.6 Error tracking (Sentry) | ✅ Backend / ⚠️ Frontends | Backend confirmed receiving real data (137 sessions, 4 releases). Frontends: DSN, environment, and `release` all confirmed present at the real `Sentry.init()` call in the **live deployed bundle** — but **arrival of frontend data in the Sentry dashboard was never confirmed.** |
| 0.7 Verify staging/prod dashboard config | ✅ Done | Full pass completed. Confirmed staging and production use genuinely separate databases (Supabase vs Railway Postgres). Surfaced defects #3, #6, #7 above. |

**Deployment reliability** — not a plan item, but the most valuable outcome: auto-deploy from `main` now works correctly across all seven Railway services and three Netlify sites, verified by commit hash. Before this period it was silently broken.

### 2.3 Phase 1 — Tenancy foundation

Two blocking product decisions were settled and recorded (`96d5a0b`):

- **One organization per user, as a hard rule.** No multi-org membership, no "active org" concept. A technician at two vendor labs needs two accounts. This is the one decision here that is expensive to reverse.
- **Vendor-lab orgs are not billed.** Lab Portal access is free for admin-vetted service partners; revenue comes from breeder subscriptions and/or per-order fees. `SubscriptionTier`/`UsageTracking`/seat limits apply to breeder orgs only.

Work completed, on branch `phase-1/tenancy-foundation` (**unmerged**, 3 commits):

| Plan item | Status | Notes |
|---|---|---|
| 3.1 Design org data model | ✅ Done | `Organization` (with `kind` separating breeder from lab_vendor), `Membership` (`userId @unique` enforces one-org-per-user at the DB level), `OrganizationInvite` (one entity, both triggers). |
| 3.2 step 1 — migrate `LabAccount` | ✅ Written | Now owned by an Organization; access via org membership, so a lab with several technicians works. `userId` retained as designated owner, which kept the admin panel's search and response shape unchanged. |
| 3.2 step 2 — ~60 breeder-side models | ⬜ **Not started** | The larger half of the migration. |
| 3.3 Admin "invite a vendor lab" tool | ⬜ **Not started** | Load-bearing: the only door into the Lab Portal. |
| 3.4 Extend permissions | 🟡 Primitive only | `assertSameOrganization` added and tested. **Not yet applied to any route** — existing `assertOwnerOrAdmin` checks are untouched. |
| 3.5 Tenant-isolation tests | 🟡 Primitive only | New suite covers the authorization primitive, including fail-closed on absent org ids and that `null === null` must not grant access. **Per-route isolation tests do not exist.** |
| Migration `20260730120000` | ⚠️ **Never run against a live database** | See §4.2 — this is the single most important caveat in this report. |

Verified locally: 254 backend tests pass (21 new), typecheck clean, schema validates.

### 2.4 Go-to-market

A full marketing plan was produced ([`docs/marketing/go-to-market-plan.md`](../marketing/go-to-market-plan.md)), phased against engineering readiness so campaigns cannot outrun what the product can deliver. It is **planning only — no marketing activity has been executed.**

---

## 3. What Was Not Done

Stated plainly, because the plan's phase numbering can make this easy to lose track of.

| Capability | Original blocker level | Status today |
|---|---|---|
| **Payment processing** | Hard blocker | ⬜ **Not started.** No Stripe or any gateway. `changeMySubscription` still lets any user switch tiers for free. There is still no paywall. |
| **Privacy policy / Terms of Service** | Hard blocker | ⬜ **Not started.** Still no legal documents anywhere in the repo; the signup forms still link to nothing. This remains a legal blocker to charging anyone, independent of technical readiness. |
| Organization/team model | Hard blocker | 🟡 Built, unmerged, unvalidated. Half of Phase 1 remains. |
| Org-scoped RBAC on routes | Hard blocker for team plans | 🟡 Primitive exists; no route uses it yet. |
| Admin "invite a vendor lab" tool | High | ⬜ Not started. |
| Self-service data export/delete (GDPR) | Medium | ⬜ Not started. |
| CI-driven deploys | Medium | ⬜ Not started. Deploys are auto-triggered from `main` but not gated on tests passing. |
| Separate migration from app boot | — | ⬜ Not started. Still `prisma migrate deploy; npm start` — note the `;`, so **a failed migration still boots the app.** |
| Shared frontend code consolidation | Medium | ⬜ Not started. `AuthGate`/`apiClient` still hand-copied. |
| 2FA / MFA, API keys, OpenAPI | Soft | ⬜ Not started (deliberately deferred). |
| Breeder → Marketplace publish integration | Medium | ⬜ Not started (blocked on the external Marketplace existing). |
| Serpentora rebrand completion | Low | ⬜ Not started. Still mid-flight — `breeding-planner-admin` literally renders "Breeding Planner" today. |

---

## 4. Open Risks and Unknowns

### 4.1 Two parallel production deployments, no decision on which is canonical

Every frontend currently exists **twice**: as a Railway service and as a Netlify site. Both are live. Nobody has decided which is permanent.

This is not cosmetic. It blocks Phase 0.5 (the cookie-auth activation), because the same-origin proxy is free on Netlify but would need a custom server built for Railway — work that would be wasted if Netlify wins. It also doubles the surface on which configuration can drift, which is precisely how defects #6 and #7 happened.

Additionally: **all three Netlify sites — including the custom-domain `serpentora.com` — point at the staging backend.** This was confirmed intentional ("not cut over yet"), but it means the customer-facing domain is currently serving from staging infrastructure and a staging database.

**This is the highest-value decision outstanding**, and it is a product/infrastructure call, not an engineering one.

### 4.2 The tenancy migration has never touched a real database

Migration `20260730120000` creates three tables, backfills an organization and membership for every existing user, and promotes a column to `NOT NULL`. It has been validated only by schema diffing and code review.

It could not be tested locally because **the local Postgres has been wedged in recovery mode since 2026-07-28** and restarting it requires elevation. CI was supposed to be the fallback validation, but CI itself was broken — it ran Node 20 while the backend declares `engines: >=24.0.0` (deliberately pinned to match Railway), causing `npm ci` to fail before ever reaching the migration step. That is fixed (`42ed879`), but **the result of that CI run has not been reported back, so the migration remains unvalidated.**

This matters more than usual because Railway's start command auto-applies migrations to production on merge. The branch is deliberately unmerged for exactly this reason.

### 4.3 Frontend error tracking is unconfirmed

Backend Sentry is confirmed receiving data. For the three frontends, the code is verified correct in the live deployed bundle, but no one has confirmed events actually arriving. Until that is checked, frontend error visibility should be treated as **assumed, not established** — which is the same category of assumption that let defects #4 and #7 sit in production unnoticed.

### 4.4 Smaller items worth tracking

- `breeding-app-lab` has **two Vite configs** (`vite.config.ts` and `.mts`); Vite silently loads the `.ts` one, so the 140-line `.mts` is dead code. It should be deleted, but that wasn't in scope for the branch it was found on.
- `prisma/` is outside `tsconfig`'s `include`, so `seed.ts` and `e2eReset.ts` are **never typechecked**. Two pre-existing type errors live there today. This is how the LabAccount migration nearly shipped a broken seed.
- The Phase 1 PR contains an unrelated commit (`5e70b4c`, "Fix hatchling wizard trigger") that came from elsewhere, which will muddy the CI signal.
- Marketplace is still in the repo despite being slated to spin out.

---

## 5. Honest Readiness Assessment

**Can this be sold to a paying customer today?** No — and not because of anything subtle. There is no way to take payment, and no terms of service or privacy policy. Both are absolute blockers, both are untouched, and neither is primarily an engineering problem (the legal documents in particular need a human decision or a lawyer, not code).

**Is the foundation sound enough to build on?** Substantially more than two weeks ago. Deployment works and is verified. Error tracking exists on the backend. Ten real defects are gone, including three that were breaking production for actual users. The tenancy design is settled, with the expensive-to-reverse decision made explicitly rather than by default.

**What would the next meaningful milestone be?** Not more Phase 1 code. In rough order of value:

1. **Validate the tenancy migration** (report the CI result, or fix local Postgres). Everything else in Phase 1 builds on it.
2. **Decide Railway vs. Netlify.** It unblocks Phase 0.5, halves the config surface, and is currently the largest source of avoidable risk.
3. **Start the legal documents.** They have the longest lead time of anything remaining, they block launch absolutely, and they do not depend on any engineering work — so leaving them until last is the single easiest way to delay launch by weeks for no reason.
4. Then finish Phase 1 (§3.2 step 2, §3.3) and begin Phase 2 billing.

The sequencing risk worth naming: it is tempting to keep going on tenancy because it is the interesting problem. But billing and legal are the actual blockers to revenue, and legal in particular is pure calendar time that can be run in parallel starting today.
