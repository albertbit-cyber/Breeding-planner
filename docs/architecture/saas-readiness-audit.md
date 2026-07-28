# SaaS-Readiness Audit & Conversion Plan

**Date:** 2026-07-27
**Scope:** Full monorepo — `breeding-app-backend`, `breeding-app-{breeder,admin,lab,marketplace,public}`, `breeding-app-shared`, native wrappers (`android/`, `ios/`, `electron/`), infra/CI configs, docs.
**Method:** Static analysis only (no code changes). Five parallel research passes covering multi-tenancy/auth/security, billing/admin/RBAC, frontend architecture, infra/CI/observability, and native packaging/legal — cross-checked against the existing `Breeding-Planner-Audit-Report.pdf` (2026-07-07, code-quality/security audit) and `docs/handoff/*` engineering notes.
**Read this together with:** `Breeding-Planner-Audit-Report.pdf` — that report already covers code-quality and security bugs (account-takeover flow, localStorage tokens, app duplication, sync/data-integrity bugs) in depth. This document does not repeat those findings in full; it cites them where they intersect with SaaS-readiness and otherwise focuses on what that report doesn't cover: **multi-tenancy, billing, infra separation, admin depth, and compliance.**

---

## 1. Executive Summary

Breeding Planner (rebranding in progress to **Serpentora**) is currently a **single-tenant-per-user product**, not a SaaS product, despite having five separate frontends and a real backend. It was built as a local-first breeder tool that grew a shared backend, a lab portal, and a marketplace — but at no point did it grow an **organization/team/billing** layer. That layer does not degrade gracefully into SaaS; it has to be built.

The good news: this isn't a green-field problem. A surprising amount of SaaS scaffolding already exists in the schema and admin app — subscription tiers, feature catalogs, per-user usage tracking, an admin tier editor — it's just never been wired to an actual payment processor, and it's all scoped to individual users rather than organizations.

**Bottom line:** three things block calling this a SaaS product today, in order of how hard they are to retrofit later:

1. **No Organization/Team data model.** Every one of the ~60 Prisma models is owned directly by a `User`. There is no entity to attach seats, roles, or a subscription to. This is the one item that gets more expensive the longer it's deferred, because every new feature built in the meantime adds another model that will need retrofitting.
2. **No payment processing.** The `UserSubscription`/`SubscriptionTier` schema and admin tier-editor exist, but `paymentProvider`/`paymentCustomerId` are unused columns — plan switching today is free and self-service, i.e. there is no paywall.
3. **No legal foundation.** There is no privacy policy or terms of service anywhere in the repo, despite the signup UI linking to both. This alone blocks legally onboarding paying customers regardless of technical readiness.

Beneath those three, there's a long tail of infrastructure and consistency debt (staging/production drift, four hand-copied auth clients, no error tracking, a stale duplicate deploy config) that won't block a first customer but will actively hurt reliability and velocity once there are paying customers depending on uptime.

**Two product-scope clarifications that reshape the plan below, confirmed 2026-07-28:**

- **The Lab Portal is invite-only, not self-service.** There is no public signup for lab access. The admin (product owner) personally decides who gets a Lab Portal account — one vendor lab or several — and grants access by sending an email invitation that the vendor redeems. This is good news for scope: it means the Lab Portal never needs a public-facing signup/paywall flow, only an admin-side "invite a vendor" tool. It does **not** remove the need for an `Organization`/`Membership` model, though — a vendor lab with multiple staff still needs multi-seat support once they're in, so the underlying tenancy work in §3.1/§5 stands; only the *entry point* changes from self-service to admin-gated.
- **Marketplace is spinning out into its own independently branded, independently domained product** (name not yet decided) — it is no longer one of "the SaaS's" tenant-facing apps. The only remaining connection to this codebase is a **publish integration**: a breeder pushes a listing from inside the breeder app directly to the external Marketplace site. This removes Marketplace from the tenancy-migration and frontend-consolidation scope described below, and adds one new, narrower integration requirement in its place.

---

## 2. Current Architecture Snapshot

| Layer | Reality today |
|---|---|
| **Tenancy** | Per-`User`. Roles: `breeder`, `lab_owner`\*, `lab_staff`, `admin`, `buyer`, `moderator`, `support`. No org/workspace concept. \*`lab_owner` is dead code — nothing ever assigns it; all lab users normalize to `lab_staff`. **Intended onboarding model differs by surface**: breeder is self-service signup; Lab Portal access is admin-invite-only (no public signup at all — the admin personally decides which vendor labs get access); Marketplace is exiting this product (see below). |
| **Backend** | Express + Prisma + Postgres in `breeding-app-backend/`, single Railway process. A second, legacy `server/` backend existed on disk but was **untracked in git and not deployed** — confirmed via `git ls-files server/` returning zero files, and removed during the 2026-07-27 Phase 0 cleanup. |
| **Frontends** | 5 independent React apps today, becoming **4 + 1 external partner**: **breeder** (flagship, Tailwind, i18n, native wrappers, "Serpentora" branded, self-service signup), **admin** (internal ops console, and — going forward — the vendor-invite tool for Lab access), **lab** (genetic-test portal, its own separate Android pipeline, admin-invite-only, no public signup), **public** (marketing/signup, no auth, still "Breeding Planner" branded, no i18n). **marketplace** is spinning out into its own independently branded, independently domained product outside this codebase's SaaS scope, connected back only via a breeder→marketplace publish integration. |
| **Shared code** | `breeding-app-shared/` package exists and exports genetics/auth/API-config logic — but **no app actually imports it** (confirmed via repo-wide `package.json` dependency grep). `AuthGate.jsx` and `apiClient.ts` are hand-copied into all 4 authenticated apps instead, and have already drifted (e.g. breeder's token-refresh is missing a null-check the other three have). |
| **Native packaging** | Electron desktop (Windows NSIS built, Mac/Linux configured but untested) + Capacitor Android/iOS, wrapping the breeder app. Not live in any app store — `APP_STORE_CHECKLIST.txt` is an unchecked how-to guide. Lab has a second, separate Android/Capacitor project. Root-level `android/`/`capacitor.config.ts` is a stale, broken third copy sharing the same Android `appId` as breeder's — installing one silently overwrites the other on-device. |
| **Billing** | Schema-only: `SubscriptionTier`, `FeatureCatalog`, `TierFeature`, `UserSubscription`, `UserFeatureOverride`, `UsageTracking`, plus `User.subscriptionPlan/subscriptionStatus`. Admin UI (`TiersPage`/`TierEditorPage`) manages tiers/pricing already. **Zero payment-gateway integration** — no Stripe/PayPal anywhere in the repo. `changeMySubscription` lets a user switch plans for free today. |
| **Deployment** | 6 `railway.toml` (root is a stale duplicate of breeder's, per `HANDOFF.md`), 4 `netlify.toml`, marketplace also on GitHub Pages. No Dockerfile. Staging/production separation lives only in dashboard config, not in-repo — and per `HANDOFF.md` (this repo's own incident doc) it is **currently drifting**: an Android build was found pointing at a different staging URL than other staging surfaces. |
| **CI/CD** | `dependency-ci.yml` runs Postgres-backed tests, builds, and Playwright E2E on every PR — solid. But **no workflow deploys anything** except marketplace's GitHub Pages push. Railway/Netlify deploys are manual/dashboard-triggered, outside CI, with no preview environments. |
| **Observability** | No Sentry/Datadog/APM anywhere. Backend logging is `morgan` only (no structured logging). Health endpoints exist and are wired into Railway healthchecks. A `MONITORING_AND_ALERTING_PLAN.md` exists but is planning-only, unimplemented. |
| **Compliance** | Admin-side `GdprRequest` model + `GdprPage` exist for tracking erasure/access requests, but there's no self-service "export/delete my data" for end users, and — critically — **no privacy policy or ToS document exists anywhere**, despite the signup form referencing both. |
| **Branding** | Split in progress: backend email templates already use `serpentora.com`/"Serpentora"; README, bundle IDs, admin UI, and most APK artifacts still say "Breeding Planner." No custom domain configured on any deploy target yet (all sit on default `*.netlify.app`/`*.up.railway.app`). |

---

## 3. Findings By Domain

### 3.1 Multi-tenancy (hard blocker)

Every scoped model — `Animal`, `Pairing`, `Listing`, `LabAccount`, `MarketplacePermission`, ~60 in total — hangs off a direct `ownerId`/`userId` foreign key to `User`. `LabAccount` and `MarketplacePermission` are strictly 1:1 with a user, so a lab with multiple staff, or a breeding operation with multiple people, has no data model to represent that today — "lab_staff" is a role label, not a membership row.

Converting to real multi-seat SaaS (a lab or breeding business as the paying customer, with multiple logins) means introducing an `Organization` + `Membership` layer and re-pointing ownership across every scoped model — a genuine migration project, not a refactor. This is the item most worth starting first, because every feature shipped on the current per-user model between now and then adds one more model that will need the same retrofit later.

The one thing that *does* generalize cleanly: the subscription/feature-gating shape (`SubscriptionTier` → `TierFeature` → `UsageTracking`) is entity-agnostic in design even though every current row points at a `User` — it can plausibly be re-pointed at `Organization` rather than rebuilt.

**Two onboarding paths, not one.** Now that the intended product model is confirmed, the `Organization` layer needs to support two genuinely different ways an org comes into existence, not a single self-service flow:

1. **Breeder orgs — self-service.** A breeder signs up publicly, same as today; an `Organization` is auto-created for them (see the plan's recommendation of a "personal organization" pattern).
2. **Lab vendor orgs — admin-gated, no public entry point at all.** The admin sends an email invitation to a vendor; redeeming it is the *only* way a Lab-scoped `Organization` comes into existence. There is deliberately no `/register` path for the Lab Portal. Once a vendor accepts, they become the owner of their own `Organization` and can invite their own staff under it (this is where `LabAccount`'s current 1:1-with-user limit actually bites — a vendor lab with multiple technicians needs real multi-seat membership, just entered through an admin-controlled door instead of a public one).

`MarketplacePermission` drops out of this migration entirely — see §3.5, Marketplace is leaving this codebase's tenancy scope.

### 3.2 Billing & payments (hard blocker)

The schema and admin tooling for plan management are further along than a typical pre-SaaS codebase: `SubscriptionTier`/`FeatureCatalog`/`TierFeature` define priced feature bundles, `UserSubscription` tracks a user's current plan (with unused `paymentProvider`/`paymentCustomerId`/`paymentSubscriptionId` columns already modeled), `UsageTracking` meters usage against `TierFeature.limitValue`, and there's a working `accessCheck` endpoint plus an admin `TierEditorPage` to configure pricing.

What's missing is the entire "money changes hands" layer: no Stripe/PayPal/Braintree integration exists anywhere in the repo. `subscriptionController.changeMySubscription` currently lets any authenticated user switch tiers with no payment gate — functionally a free-plan-selector, not a paywall. There are also no tests for `subscriptionService`/`subscriptionController`, which is notable given it's the one area where a bug directly costs revenue.

### 3.3 Auth & security

The foundation is solid and mostly SaaS-appropriate: JWT + refresh-token rotation (`RefreshSession`), bcrypt at cost 12, CSRF-protected cookie auth alongside bearer tokens, a `SecurityEvent` audit log, email verification gating on selected routes, and role-based route guards (`requireRole`) with role-alias normalization.

Gaps relevant to a SaaS pivot specifically:
- **No API keys / OAuth client-credentials flow.** A SaaS product usually needs a way for a customer's own tooling to call the API programmatically; today the only auth path is the first-party frontends' JWT/cookie flow.
- **No 2FA/MFA anywhere** — increasingly expected once you're handling other businesses' data, and often required by enterprise procurement.
- **Rate limiting is disabled outside production** (`skip: productionOnly`), meaning it's never exercised by tests or in staging — a bug in the limiter itself wouldn't be caught before it hit real traffic.
- **Tokens still live in `localStorage`** in all four authenticated frontends (confirmed still true in `breeding-app-breeder/src/shared/apiClient.ts`), even though `breeding-app-backend` already issues the safer httpOnly-cookie + CSRF alternative — this is a carryover from the existing code-quality audit (§1.2 there) and is worth fixing before onboarding customers who'll ask about your security posture.
- The **previously-flagged account-takeover vuln** (unauthenticated password reset via email+name match) lived only in the legacy `server/` backend, which is confirmed **untracked in git and not deployed** — not a live risk, but the directory should be deleted rather than left to be rediscovered and accidentally redeployed.
- No API versioning, no OpenAPI/Swagger docs — fine for a single first-party consumer, a blocker if you ever want partners integrating against the API.

### 3.4 Admin console & role model

The admin app already covers a lot of SaaS-admin ground: user management with subscription/verification/activity filters, an email-ops console, GDPR request tracking, moderation reports, and — notably — subscription tier/pricing editing. What it does *not* have is any concept of tenants: "Team" management in the admin app is for internal staff accounts, not customer organizations, because no customer-organization entity exists yet. There's no impersonation feature and no per-org usage dashboard, both of which are typical must-haves for a SaaS admin console supporting paying B2B customers.

This matters concretely now that the Lab Portal's real onboarding model is confirmed: **the admin console needs a new, distinct "invite a vendor lab" flow**, separate from the existing internal-staff invite (`createAdminUser`/`TeamPage.jsx`) it's currently the closest analog to. That existing flow already proves the pattern (email invite → account creation) but is scoped to internal roles only (support/moderator/admin/lab) — it was never meant to create an external, billable-or-not tenant organization. Building the vendor-invite tool is the one piece of net-new admin UI this scope clarification requires; everything else about admin's existing shape (subscription tier editing, GDPR tracking) still applies unchanged.

The permission model itself is a flat role-enum with boolean helper checks (`isAdminActor`, `isLabActor`) and ownership checks that are literally `actor.id === ownerId`. It would not survive adding org-scoped roles (owner / billing-manager / member) without real rework, because there's no org to scope permissions *to*.

One reusable primitive: `UserFeatureOverride` (per-user feature flag with expiry and admin attribution) is a clean pattern that could extend to org-level flags without redesign.

### 3.5 Frontend architecture & consistency

The app split is a reasonable SaaS shape (product app, admin console, a portal for a secondary user type, a marketing site) — but the shared-code layer meant to keep them consistent is currently theoretical. `breeding-app-shared` is not imported by any app; instead `AuthGate.jsx` and `apiClient.ts` are hand-copied across the authenticated apps, and have already diverged in ways that matter (a token-refresh null-check present in three copies and missing in breeder's). Every affected app's own README already flags this as known debt.

**Marketplace is no longer part of this consolidation.** It's spinning out into its own independently branded, independently domained product (name not yet decided) — outside this codebase's SaaS scope going forward. Concretely, that means: `breeding-app-marketplace`'s auth/API-client duplication is no longer worth fixing as part of the shared-package consolidation (§Phase 5 in the implementation plan now targets breeder/admin/lab only); its existing commerce models (`MarketplaceListing`, `MarketplaceSale`, etc.) belong to whoever builds the new site, not to this plan; and the one thing this codebase *does* still own is a **publish integration** — letting a breeder push a listing from inside the breeder app directly to the external Marketplace. That's new, narrower scope than "consolidate a fourth frontend," and is called out explicitly in the implementation plan.

Deploy configuration for the five apps is similarly ad hoc: independent `netlify.toml`/`railway.toml` per app, a stale root-level Railway config that duplicates (and lags) breeder's, and `VITE_API_URL` set independently per dashboard rather than from one source — which is precisely how the staging/production URL mismatch documented in `HANDOFF.md` happened.

i18n is implemented consistently across breeder/admin/lab/marketplace but absent from `public` (fine for now, since public is English-only marketing copy, but worth deciding deliberately rather than by omission).

### 3.6 Infrastructure, deployment & observability

Six Railway configs and four Netlify configs with no in-repo distinction between staging and production is workable at the current scale but is the direct cause of the cross-environment mismatch bug this repo has already lived through once (`HANDOFF.md`). CI (`dependency-ci.yml`) is genuinely good — real Postgres, migrations, unit tests, and Playwright E2E on every PR — but nothing in CI deploys anything; every environment is pushed to manually, so a green CI run and what's actually live can silently diverge.

There is **no error tracking or APM anywhere** (no Sentry, Datadog, or equivalent) and no structured logging (just `morgan`). For a product with paying customers, "we found out about the outage from a customer" is the default failure mode without this. The backend also runs `prisma migrate deploy` inline with app boot on the same single instance on every deploy — acceptable pre-scale, but a bad migration currently has no separate gate before it can take down the only running instance.

The email system (Postgres-polling worker, no Redis/BullMQ) is a deliberate, reasonable choice at current scale, but is a single-process design — running more than one backend instance without adding a real queue risks duplicate sends, bounded today only by idempotency keys rather than a proper distributed lock.

### 3.7 Compliance & legal

No privacy policy or terms of service exists anywhere in the repository, in any app, despite the breeder and public signup forms both linking to "Terms of Service and Privacy Policy" as dead references. This is a legal blocker to charging money, independent of anything technical. On the data-rights side, there's a real admin-side `GdprRequest` workflow for tracking erasure/access requests, but no self-service export/delete flow for end users and no automated execution behind the admin workflow — someone has to act on each request by hand today.

### 3.8 Branding & go-to-market readiness

The rebrand to "Serpentora" is mid-flight: backend email sending already uses the new name and domain, but the README, native bundle IDs, most admin UI copy, and most APK artifacts still say "Breeding Planner." No custom domain is wired into any deploy target. There's no in-app help center, changelog, or feedback/support widget in any of the four remaining frontends. None of this blocks a technical launch, but it's worth resolving before any public-facing SaaS launch messaging goes out, since customers signing up mid-rebrand will see the inconsistency directly.

Marketplace now carries its own, entirely separate branding question — a new product name and domain, independent of the Serpentora decision, still undecided. That naming/domain decision belongs to whoever scopes the new Marketplace site and isn't tracked further in this document.

---

## 4. Gap Matrix

| Capability | Status today | Blocker level |
|---|---|---|
| Organization/team data model | Does not exist | **Hard blocker** — required before any multi-seat plan |
| Payment processing (Stripe et al.) | Schema exists, no gateway wired | **Hard blocker** — required before charging anyone |
| Privacy policy / ToS | Does not exist | **Hard blocker** — legal, not technical |
| Org-scoped RBAC | Flat per-user roles only | Hard blocker for team plans; fine for single-seat plans |
| Admin "invite a vendor lab" tool | Only an internal-staff invite flow exists | High — this is now the *only* way into the Lab Portal, so it's load-bearing, not optional |
| Breeder → Marketplace publish integration | Does not exist | Medium — needed once the external Marketplace site exists, not before |
| API keys / programmatic access | Does not exist | Blocker only if selling API access |
| 2FA/MFA | Does not exist | Soft blocker; expected by enterprise buyers |
| Staging/prod environment separation | Dashboard-only, actively drifting | High — active reliability risk today |
| Error tracking / APM | None | High — needed before real customer traffic |
| Shared frontend auth/API client | Duplicated 4x, already diverged | Medium — velocity and consistency risk |
| CI-driven deploys | CI tests only, deploy is manual | Medium |
| Self-service data export/delete | Admin-tracked only, not automated | Medium — compliance nice-to-have short-term, required at scale |
| Native app store presence | Internal testing only, not submitted | Low — not required for a web SaaS launch |
| Branding consistency | Mid-rebrand, inconsistent | Low — cosmetic, but visible to new customers |
| Support/help infrastructure | None | Low — needed before public launch, not before beta |

---

## 5. Phased Conversion Plan

This plan sequences work so nothing gets built twice. Tenancy comes before billing because billing needs something to attach a subscription to; billing comes before public launch because you can't collect money without it; legal and reliability work run in parallel since neither blocks the other.

### Phase 0 — Stabilize the ground before building on it (1–2 weeks)
- Fix the localStorage-token issue by wiring the four frontends to the existing httpOnly-cookie + CSRF path `breeding-app-backend` already supports (carried over from the existing code-quality audit, but now also a customer-trust issue).
- Delete the untracked, undeployed legacy `server/` directory so its dormant vulnerability can't be accidentally resurrected.
- Delete the stale root-level `railway.toml`/`android/`/`capacitor.config.ts` duplicates so there's one config per surface.
- Pin down staging vs. production URLs into one canonical source per environment and re-verify every app/APK against it (this closes the loop on `HANDOFF.md`'s open incident).
- Add Sentry (or equivalent) to the backend and at minimum the breeder frontend.

### Phase 1 — Tenancy foundation (3–5 weeks)
- Design and migrate in an `Organization` + `Membership` model (roles: owner, admin, billing-manager, member) sitting above `User`, supporting **two distinct onboarding paths**: self-service (breeder) and admin-invite-only (Lab vendor — no public entry point).
- Re-point ownership on the highest-value models first, starting with `LabAccount` — its 1:1-with-user limit is the most concretely broken today for any vendor lab with more than one employee, and it's the smallest, most bounded surface to prove the pattern on before tackling the breeder side.
- Build the admin-side "invite a vendor lab" tool (net-new; the existing internal-staff invite flow isn't scoped for this) — this is now the *only* door into the Lab Portal, so it isn't optional polish, it's the mechanism.
- Extend `requireRole`/permission helpers to check org membership + org role, not just `actor.id === ownerId`.
- Add real tests for tenant-isolation boundaries — this is the single highest-severity class of bug a SaaS pivot can introduce (one tenant seeing another's data), and there are currently no dedicated tests for it.
- Marketplace is explicitly **out of scope** for this migration — it's spinning out into its own product (see §3.5).

### Phase 2 — Billing (2–4 weeks, can start once Phase 1's org model exists)
- Integrate a payment gateway (Stripe is the natural fit given the schema already has `paymentProvider`/`paymentCustomerId` columns shaped for it) behind the existing `SubscriptionTier`/`UserSubscription` models, re-pointed at `Organization`.
- Gate `changeMySubscription` behind an actual checkout/payment-method flow instead of letting it switch tiers for free.
- Wire `UsageTracking`/`TierFeature.limitValue` enforcement into the routes that should actually be limited (today the metering exists but enforcement wiring wasn't found end-to-end).
- Add the missing test coverage for `subscriptionService`/`subscriptionController` before this becomes revenue-critical code.
- Add self-service invite-to-organization (distinct from the existing admin-only internal-staff invite flow), since team plans need a way to add teammates without an admin doing it by hand.

### Phase 3 — Compliance & trust (parallel to Phase 2, 1–2 weeks)
- Draft and publish a real privacy policy and terms of service; wire the existing dead links in both signup forms to them.
- Add self-service "export my data" and "delete my account" endpoints/UI, automating what the admin `GdprRequest` workflow currently tracks by hand.
- Decide and execute the Serpentora rebrand consistently (README, bundle IDs, admin UI, custom domain) rather than leaving it half-done into a public launch.

### Phase 4 — Operational hardening (parallel, ongoing)
- Move Railway/Netlify deploys behind CI so a green build is what actually ships, closing the gap between "tests passed" and "what's live."
- Separate the migration step from app boot so a bad migration can't take down the only running instance on deploy.
- If/when running more than one backend instance, replace the in-process email-polling worker with a real queue (or add explicit distributed locking) before relying on idempotency keys alone.
- Add API-key based programmatic access and OpenAPI docs once there's a concrete reason (a partner, a public API tier) — no need to build this speculatively.

### Phase 5 — Go-to-market polish (before public launch, not before)
- Consolidate `AuthGate`/`apiClient` duplication into the already-built-but-unused `breeding-app-shared` package, now that Phase 1's org-aware auth logic needs to be correct in **three** places at once (breeder, admin, lab) instead of one — Marketplace no longer part of this consolidation.
- Build the breeder → Marketplace publish integration once the external Marketplace site exists to receive it.
- Add basic in-app support/feedback (even a simple "email us" widget is enough at first).
- Decide deliberately whether native app store distribution is part of the launch or deferred — it's currently neither finished nor abandoned.

---

## 6. Notes On Sequencing

- **Phase 1 before Phase 2 is not optional** — building Stripe integration against per-user billing now means re-doing it against organizations later. The schema is flexible enough that this isn't wasted work either way, but the order matters.
- **Phase 0 is cheap and de-risks everything after it** — none of it is SaaS-specific, all of it reduces the chance that Phase 1–2 work gets built on a still-shifting foundation (especially the staging/production drift, which has already caused one incident).
- The frontend-consolidation work (Phase 5) is deliberately last, not because it's unimportant, but because the org-model changes in Phase 1 will touch `AuthGate`/`apiClient` anyway — better to fix the duplication once, after the last big auth-shape change, than twice.
