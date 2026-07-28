# SaaS Implementation Plan

**Date:** 2026-07-28
**Companion to:** [`docs/architecture/saas-readiness-audit.md`](saas-readiness-audit.md) (findings this plan acts on).
**Status key used throughout:** ✅ Done · 🟡 In progress · ⬜ Not started.
**Scope of this document:** planning only — no code, no schema, no config. Every step below describes *what* needs to be built and *why it's ordered where it is*, not *how* to write it. Implementation happens turn-by-turn against this plan in later sessions.

---

## 1. How This Plan Is Organized

The audit found three hard blockers (no Organization model, no payment processing, no legal foundation) sitting on top of a long tail of reliability and consistency debt. This plan turns that into nine **workstreams**, grouped into **six phases** so nothing gets built twice — the ordering logic is:

1. **Stabilize first** (Phase 0) — fix what's actively broken before building on it.
2. **Tenancy before billing** (Phase 1 before Phase 2) — billing needs an entity to attach a subscription to; building it against `User` now means redoing it against `Organization` later.
3. **Legal and ops hardening run alongside billing** (Phase 3, Phase 4) — neither blocks the other, and neither blocks Phase 1/2.
4. **Frontend consolidation and go-to-market polish come last** (Phase 5) — Phase 1 will touch the duplicated auth code anyway, so it's fixed once, after the last big auth-shape change, not twice.

Each phase below lists its workstream(s), concrete steps, the new data entities it introduces (named and described, not modeled), what "done" looks like, and its dependencies.

**Two product-scope clarifications, confirmed 2026-07-28, that reshape Phases 1, 2, and 5 below:**

- **The Lab Portal has no public signup.** Access is entirely admin-gated: the product owner personally decides which vendor labs get in — one or several — by sending an email invitation that the vendor redeems. This changes *how* a Lab-scoped organization comes into existence (see 3.1), but not *whether* it needs multi-seat support once it exists (a vendor lab with several technicians still needs it).
- **Marketplace is spinning out into its own independently branded, independently domained product** (name TBD) and is no longer one of this plan's tenant-facing apps. It drops out of Phase 1's tenancy migration and Phase 5's frontend consolidation. The only work this plan still owns on that front is a **publish integration** letting a breeder push a listing from the breeder app to the external Marketplace site (added to Phase 5).

---

## 2. Phase 0 — Stabilize The Ground

**Goal:** remove active risk and dead weight before any SaaS-specific work starts. Nothing here is SaaS-specific — it's prerequisite hygiene.

| Step | Status | What it is |
|---|---|---|
| 0.1 Delete the untracked, undeployed legacy `server/` backend | ✅ Done | Removed — was a dormant duplicate carrying the previously-flagged account-takeover vulnerability; confirmed never deployed. |
| 0.2 Delete stale root-level Android/Capacitor/Railway duplication | ✅ Done | Removed root `android/`, `capacitor.config.ts`, `railway.toml`, `nixpacks.toml`, and the dead npm scripts referencing them; root's `src/` no longer existed, so this pipeline was already non-functional. |
| 0.3 Wire up `breeding-app-breeder`'s own Android build pipeline | ✅ Done | Added its missing `.env.android-{development,staging,production}` files and matching `build:android:*`/`android:*` npm scripts so its own (previously unwired) `android-build.ps1` actually works. `npm install` still needs to be run there to pull in the newly declared `cross-env` dependency. |
| 0.4 Confirm canonical staging backend URL | ✅ Done | `https://breeding-planner-staging.up.railway.app/api` confirmed consistent across every tracked env file; the custom domain `HANDOFF.md` flagged no longer appears anywhere in the repo. |
| 0.5 Move auth tokens off `localStorage` onto the existing httpOnly-cookie + CSRF path | 🟡 Built, not activated | Discovered mid-implementation that naive "just use cookies" would break Electron/native — the codebase's own comments show a prior session already tried and reverted cookie auth platform-wide because cross-site cookies (`SameSite=None`) are unreliable in Electron's `file://` origin, the native WebView, and increasingly blocked by browsers. Real fix chosen: a same-origin reverse proxy. Built: backend cookie hardening (`SameSite=Lax` default, `AUTH_COOKIE_SAMESITE` escape hatch), a `/api/*` proxy rule generator for Netlify (`scripts/generate-netlify-redirects.cjs`, wired into breeder/admin/lab's `netlify.toml`, derives the proxy target from each site's own `VITE_API_URL` so it can't drift), and same-origin-aware `apiClient.ts` logic in breeder/admin/lab (prefers httpOnly cookies automatically, but only when `VITE_API_URL` resolves to the page's own origin — every current deployment still uses an absolute cross-origin URL, so **behavior is completely unchanged until someone deliberately flips `VITE_API_URL`**). Found and fixed two pre-existing bugs along the way: `breeding-app-admin` was unconditionally preferring cookies even cross-origin (never got the earlier bearer-token-first fix breeder/lab did) — reverted to bearer-first, matching breeder/lab. Same bug fixed in `breeding-app-marketplace` even though it's out of scope for the proxy work, since there's no reason to ship a known auth bug in code that's about to be handed off. **Not done:** actually activating same-origin mode requires dashboard access to confirm Netlify vs. Railway is the live target per app (see Activation Steps below) — that part is on you. |
| 0.6 Add error tracking (Sentry or equivalent) | ✅ Backend + all 3 remaining auth'd frontends done | Wired into `breeding-app-backend` (`src/config/sentry.ts`, `SENTRY_DSN`-gated no-op, catches request errors via `errorHandler.ts` and process-level `uncaughtException`/`unhandledRejection`) and now all three remaining authenticated frontends — `breeding-app-breeder`, `breeding-app-admin`, `breeding-app-lab` (each has its own `src/shared/sentry.ts`, `VITE_SENTRY_DSN`-gated, `initSentry()` called first thing in `index.jsx`). Verified: `tsc --noEmit` and `vite build` both clean on admin and lab (lab's pre-existing unrelated errors — a `?inline` asset import and a couple of untyped test params — are untouched by this change and don't block its own build). `marketplace` intentionally skipped, matching its exit from this consolidation (see scope note, §1). **Not done:** no real Sentry account/DSN exists yet in any environment — set `SENTRY_DSN`/`VITE_SENTRY_DSN` once you have one, nothing else to build. |
| 0.7 Verify staging vs. production dashboard config (Railway/Netlify env vars) | ⬜ Not started | Everything fixable from inside the repo is fixed (0.1–0.6). What's left is dashboard-only and needs manual verification against the checklist already written in `HANDOFF.md` and expanded below — this is a verification pass, not new work. |

**Definition of done:** no known dead/duplicate deploy paths remain; the same-origin cookie capability is built and ready to activate per app once the live hosting target is confirmed; a backend exception shows up in an error tracker within minutes instead of being discovered by a customer (once a DSN is configured); staging and production are confirmed (not assumed) to be fully separated end to end.

**Dependencies:** none — this phase can run entirely in parallel with itself; nothing here blocks or is blocked by later phases, though finishing it before Phase 1 means Phase 1 isn't built on shifting ground.

### Activation steps for 0.5 (same-origin proxy)

The capability is built; nothing changes in production until these steps are done, per app (breeder, admin, lab):

1. **Confirm the live hosting target.** Each app has both a `railway.toml` and a `netlify.toml`. Check the Railway and Netlify dashboards to see which one actually serves real traffic for that app today — the other is stale/unused.
2. **If Netlify is live:** the proxy config is already in place (`netlify.toml` now runs `scripts/generate-netlify-redirects.cjs` after build). Trigger a deploy and check the deploy log for the `[generate-netlify-redirects] Wrote .../build/_redirects: ...` line to confirm it generated the expected `/api/*` rule from that site's `VITE_API_URL`.
3. **If Railway is live instead:** the proxy isn't built yet for Railway — it currently just runs `npx serve -s build`, which can't proxy. This needs a small custom server (e.g. `serve-handler` + a lightweight proxy for `/api/*`) before same-origin mode can activate there. Flag this and it can be built next.
4. **Test before cutting over:** on a preview/staging deploy, set `VITE_API_URL` to that deployment's *own* domain plus `/api` (e.g. `https://app-staging.example.com/api` instead of the backend's Railway URL) and confirm login/refresh/logout all still work — watch the Network tab for `/api/auth/login` returning `Set-Cookie` headers and subsequent requests carrying the cookie automatically with no `Authorization` header.
5. **Only then** repeat step 4's `VITE_API_URL` change on the real staging and production dashboards, one at a time, verifying login after each.
6. Electron and Capacitor (Android/iOS) builds are untouched by any of this — they keep using the absolute cross-origin URL and bearer tokens exactly as before, on purpose.

### Phase 0.7 checklist (dashboard-only — needs your access, not mine)

- [ ] Every frontend service's `VITE_API_URL` env var matches its intended backend environment (staging service → staging backend URL, production service → production backend URL).
- [ ] No staging frontend points at the production backend, or vice versa.
- [ ] Confirm whether `.env.android-staging`/`.env.android-production` (root, `breeding-app-breeder`, `breeding-app-lab`) match what's actually configured in the corresponding Railway/Netlify dashboard env vars — the repo files and dashboard config are two separate sources that can drift.
- [ ] Confirm staging and production actually use **separate Postgres databases**, not just separate app instances pointed at the same DB — this was `HANDOFF.md`'s original, still-unresolved concern.
- [ ] Confirm `CORS_ORIGIN` on each backend environment includes exactly the frontend domains that should be allowed for that environment, nothing extra.

---

## 3. Phase 1 — Tenancy Foundation

**Workstream: Organizations & Multi-Tenancy.** This is the single most important phase — every other phase either depends on it or gets more expensive if it's deferred.

### 3.1 Design the organization data model

New entities needed (named here, not schema — actual modeling happens in implementation):

- **`Organization`** — the paying customer, or the admin-vetted vendor. Holds name, billing contact (where applicable — see the Phase 2 open question on whether Lab orgs are even billed), plan reference, created/suspended state, and a `kind` (or equivalent) distinguishing a breeder org from a vendor-lab org, since they're created through entirely different doors (see below) and may end up with different permission/billing rules.
- **`Membership`** — join entity between `User` and `Organization`, carrying an org-scoped role (`owner`, `admin`, `billing_manager`, `member`). This is what "team" means going forward — replacing the current implicit "team = one person" assumption. Applies the same way to a breeder's org and a vendor lab's org: the vendor who accepts an admin's invitation becomes that org's `owner` and can invite their own staff under it.
- **`OrganizationInvite`** — pending invitations to join an org by email, with an expiring token. This single entity needs to support **two different triggers**, not one: an org owner inviting a teammate into their *existing* org (self-service, Phase 2), and the platform admin inviting a brand-new vendor which *creates* a Lab-scoped org on acceptance (Phase 1, admin-only, see 3.3). Distinct from the existing admin-only internal-staff invite flow (which stays as-is, for internal ops accounts only, not customer/vendor orgs).

**Two onboarding paths, not one.** Decide, before building, whether every breeder `User` must belong to exactly one `Organization` (simpler, matches "one breeder = one business" for most of today's users) or can belong to multiple. Recommendation: **one org per breeder, auto-created at signup** (a "personal organization" pattern) — this keeps today's single-user experience unchanged for existing accounts while giving every account an org to grow into multi-seat later without a second migration.

The Lab side works differently and this is not optional design flexibility, it's the confirmed product model: **a Lab-scoped `Organization` is never self-service.** There is no public signup path for it at all. The *only* way one comes into existence is the admin sending a vendor an email invitation (see 3.3) and that vendor redeeming it — at which point they become the `owner` `Membership` on a freshly created org and can invite their own staff the normal way from there.

### 3.2 Migrate ownership

Every model currently scoped by `ownerId`/`userId` needs an `organizationId` path. This does **not** mean ripping out `ownerId` — a resource still has an individual creator/owner within an org — it means adding organization-level scoping *above* the existing per-user ownership, so permission checks become "is this user a member of the org that owns this resource," not just "is this user the owner."

Sequencing within this step, highest-value first:
1. **`LabAccount`** — today strictly 1:1 with a `User`, which is the most concretely broken case for any vendor lab with more than one employee. Fix this first: it's the smallest blast radius (one model, one app), and it's now also the clearest-scoped use case, since it's a small, admin-controlled, bounded set of vendor tenants rather than an open public signup surface.
2. **Breeder-side models** (`Animal`, `Pairing`, and the rest of the ~60 owner-scoped tables) — largest surface area, done second, once the org-membership pattern has been proven on the smaller Lab surface above.

`MarketplacePermission` is **not** part of this migration — Marketplace is spinning out into its own product outside this plan's scope (see the scope note at the top of this document and 7.2 below).

### 3.3 Build the admin "invite a vendor lab" tool

This is the mechanism, not polish — since there's no public Lab signup, this is the *only* way a Lab-scoped `Organization` and its first `Membership` get created. Concretely:

- A new admin-console flow (extending the admin app, distinct from the existing internal-staff `createAdminUser` invite, which stays scoped to internal ops roles only): the admin enters a vendor's email, the system creates an `OrganizationInvite` flagged as "new vendor org," and sends it via the existing Resend-based email system already in place for other invite/notification flows.
- On acceptance, the invite creates a new `Organization` (kind: lab vendor) and a `Membership` with role `owner` for the accepting user — reusing the same acceptance flow self-service teammate invites use (Phase 2, 4.4), just triggered from the admin side and creating a new org instead of adding to an existing one.
- The admin console needs a view of existing vendor orgs (list, suspend/revoke access) — this is the "one vendor, or several" management surface the product owner described; it doesn't exist today since no vendor-org concept exists yet.
- Explicitly confirm (as a build-time assertion, not just a missing route) that no public `/register`-style path exists anywhere for the Lab Portal — the absence of a signup route is intentional, not an oversight, and should stay that way.

### 3.4 Extend permissions

- Replace flat `actor.id === ownerId` ownership checks with "actor is a member of the resource's organization, with sufficient org role."
- Extend `requireRole` (currently a global role check) to also accept an org-role check where relevant.
- Decide the specific permission matrix per org role (`owner`/`admin`/`billing_manager`/`member`) against each existing action (create/edit/delete animal, manage lab orders, manage listings, manage billing, invite members) — this is a product decision to make explicitly before implementation, not something to improvise mid-build.

### 3.5 Testing

Add a dedicated **tenant-isolation test suite** — currently the single highest-severity untested bug class this migration can introduce (one org seeing or modifying another org's data). At minimum: for every migrated model, a test asserting a member of Org A cannot read, list, or write a resource owned by Org B, via every route that touches it.

**New entities introduced this phase:** `Organization`, `Membership`, `OrganizationInvite`.
**Definition of done:** every scoped model has an `organizationId` path; permission checks are org-aware; tenant-isolation tests exist and pass; existing single-user accounts are unaffected (each got an auto-created personal org, zero user-visible change).
**Dependencies:** Phase 0 complete (stable ground to build on). Blocks Phase 2 and the org-invite portion of Phase 2.

---

## 4. Phase 2 — Billing

**Workstream: Payments & Subscriptions.** Starts once Phase 1's org model exists — building this against `User` first would mean rebuilding it against `Organization` immediately after.

**Open question to resolve before 4.1:** does a vendor lab's `Organization` get billed a subscription at all, or is Lab Portal access simply granted for free to admin-vetted service providers, with the platform's revenue instead coming from breeder-side subscriptions and/or a per-order fee on lab work? The product description ("invited vendors to give service to the app") reads more like the latter — labs as vetted service partners, not paying tenants — but this needs an explicit decision, not an assumption, since it changes whether `SubscriptionTier`/`UserSubscription` apply to lab orgs at all versus only to breeder orgs. If labs are unbilled, `Organization.kind = lab_vendor` orgs simply skip the checkout/paywall path this phase builds and keep whatever access the admin granted at invite time.

### 4.1 Select and integrate a payment gateway

Stripe is the natural fit — the existing `UserSubscription` model already has `paymentProvider`/`paymentCustomerId`/`paymentSubscriptionId` columns shaped for exactly this integration, unused today. Steps:
- Re-point the existing `SubscriptionTier`/`FeatureCatalog`/`TierFeature`/`UserSubscription`/`UsageTracking` models from `User` to `Organization` (this is why Phase 1 comes first).
- Stand up Stripe Customer + Subscription objects per `Organization`, keyed via the existing `paymentCustomerId` column.
- Build the checkout flow (Stripe Checkout or Elements) for selecting/upgrading a plan.
- Build the webhook handler for subscription lifecycle events (payment succeeded/failed, plan changed, subscription canceled) — mirroring the pattern the existing Resend email-webhook handler already uses in this codebase (signature verification, idempotent processing), since that pattern is proven and familiar to this codebase already.

### 4.2 Gate plan changes behind payment

`changeMySubscription` currently lets any user switch tiers for free. Once Stripe is wired in, this becomes: initiate checkout for upgrades, handle downgrades/cancellations through Stripe's subscription-update API, and only reflect a tier change in the app after Stripe confirms it (via webhook), not optimistically.

### 4.3 Enforce usage limits

`UsageTracking`/`TierFeature.limitValue` already exist and meter usage, but enforcement wiring into the routes that should actually be limited wasn't found end-to-end in the audit. This step is: identify every feature that should be plan-gated (e.g. number of animals, number of lab orders per month, number of org seats), and add the enforcement check at the point of creation for each.

### 4.4 Organization invites (self-service)

Distinct from both the existing admin-only internal-staff invite flow *and* Phase 1's admin-only vendor-lab invite (3.3), which creates a brand-new org: this step is for an *existing* org's owner/admin inviting a teammate into their *own* org — a breeder adding a co-worker, or a vendor lab owner adding their own technicians. Build the customer-facing "invite a teammate to your organization" flow using the `OrganizationInvite` entity from Phase 1 — email invite, accept flow, seat-count enforcement tied into 4.3's usage limits (a plan's seat count is itself a usage-limited feature, where applicable — see the open billing question above for whether this applies to lab orgs at all).

### 4.5 Testing

Add test coverage for `subscriptionService`/`subscriptionController` — currently untested despite being the one area where a bug directly costs revenue. Cover: checkout success/failure, webhook idempotency (a webhook fired twice must not double-charge or double-apply a plan change), downgrade/cancellation, usage-limit enforcement at the boundary (exactly-at-limit and one-over-limit behavior).

**New entities introduced this phase:** none new — re-points existing `SubscriptionTier`/`UserSubscription`/`UsageTracking`/`FeatureCatalog`/`TierFeature` at `Organization` instead of `User`.
**Definition of done:** a real credit card can be charged for a real plan; usage limits are enforced, not just tracked; org owners can invite teammates within their seat limit; webhook processing is idempotent and tested.
**Dependencies:** Phase 1 complete.

---

## 5. Phase 3 — Compliance & Trust

**Workstream: Legal & Data Rights.** Runs in parallel with Phase 2 — neither blocks the other, but Phase 3 blocks actually launching publicly regardless of Phase 2's technical readiness.

### 5.1 Legal documents

- Draft (or commission) a real privacy policy and terms of service. This needs to reflect what the product *actually does* with data (breeder records, lab results, marketplace transactions, email addresses, payment data once Phase 2 lands) — not a generic template, since the product spans several distinct data-handling contexts (health/genetic data via the lab portal is more sensitive than planner notes).
- Publish them as real pages/routes in at minimum `breeding-app-public` and `breeding-app-breeder` (both currently have dead links to these documents in their signup forms).
- Wire the existing dead links in both signup forms to the real pages.

### 5.2 Self-service data rights

- Build a self-service "export my data" flow for end users (currently only exists as an admin-tracked manual workflow via the `GdprRequest` model).
- Build a self-service "delete my account" flow, including what happens to org-owned data when the requesting user is the sole owner of an organization (a decision this step needs to make explicitly: block deletion until ownership is transferred, or cascade-delete the org, or something in between).
- Automate what the admin `GdprRequest` workflow currently tracks by hand — the request-tracking UI stays, but the fulfillment behind it becomes automatic rather than manual.

### 5.3 Brand consistency

- Finish the "Serpentora" rebrand consistently: README, native bundle IDs, admin UI copy, remaining "Breeding Planner"-branded surfaces. Backend email already uses the new brand; the rest should follow before public launch messaging goes out under the new name.
- Wire a real custom domain into the deploy targets that will be customer-facing (currently everything sits on default `*.netlify.app`/`*.up.railway.app` subdomains).

**New entities introduced this phase:** none (extends existing `GdprRequest` workflow with self-service execution).
**Definition of done:** every signup form's ToS/privacy links resolve to real, accurate documents; a user can export or delete their own data without emailing anyone; the product presents one consistent brand identity across every customer-facing surface.
**Dependencies:** none blocking (can start immediately); should land before Phase 6 (public launch).

---

## 6. Phase 4 — Operational Hardening

**Workstream: Infrastructure & Reliability.** Runs in parallel with Phases 2–3, ongoing rather than a fixed endpoint.

### 6.1 CI-driven deploys

Today, CI (`dependency-ci.yml`) runs real tests/builds/E2E on every PR but deploys nothing — every environment is pushed manually, so a green build and what's actually live can silently diverge. This step: extend CI (or add a new workflow) so passing the existing test suite is what actually triggers a deploy to staging, with production remaining a deliberate promotion step rather than automatic.

### 6.2 Separate migration from app boot

The backend currently runs `prisma migrate deploy` inline with app startup on the same single instance, on every deploy. This step: move the migration step to run as its own gated step before the app instance restarts, so a bad migration fails loudly and separately instead of potentially taking down the only running instance mid-boot.

### 6.3 Prepare the email queue for horizontal scaling

The existing Postgres-polling email worker is a single-process design, safe today only because there's exactly one backend instance. Before running more than one instance (which multi-tenant SaaS load will eventually require), this step adds either a real distributed lock around job claiming or migrates to a proper queue (Redis/BullMQ or equivalent) — a decision to make once there's an actual concrete need to scale beyond one instance, not speculatively.

### 6.4 API keys & public API surface

Only build this once there's a concrete reason (a specific partner integration, or a public API tier being sold) — not speculatively. When needed: an API-key issuance/rotation flow scoped to an `Organization`, and OpenAPI documentation for whatever surface is exposed.

**New entities introduced this phase:** an `ApiKey` entity, scoped to `Organization`, if/when 6.4 is triggered.
**Definition of done:** a green CI run is what's actually live in staging; a bad migration can't take down production; the email worker (or its replacement) is safe to run on more than one instance; API access exists if and when it's actually needed.
**Dependencies:** none blocking; 6.4 is deliberately deferred until triggered by a real need.

---

## 7. Phase 5 — Go-To-Market Polish

**Workstream: Frontend Consolidation & Launch Readiness.** Deliberately last — Phase 1's org-aware auth logic changes will touch the duplicated `AuthGate`/`apiClient` code anyway, so this is the point where fixing the duplication once (after the last big auth-shape change) is cheaper than fixing it twice.

### 7.1 Consolidate shared frontend code

- Wire the three remaining authenticated frontends (`breeder`, `admin`, `lab`) to actually import from `breeding-app-shared` instead of each carrying its own hand-copied `AuthGate.jsx`/`apiClient.ts`. `marketplace` is **excluded** — it's spinning out into its own independently branded, independently domained product and is no longer part of this codebase's shared-auth story.
- This is the natural point to do it because Phase 1/2 already forced every remaining copy to be updated with org-aware auth/subscription logic — better to make that update once, in the shared package, than a third time by hand.

### 7.2 Breeder → Marketplace publish integration

The one piece of net-new integration work this plan owns on the Marketplace side, once the external Marketplace site exists to receive it: let a breeder push a listing from inside the breeder app directly to Marketplace, rather than needing to re-enter it there. Concretely:
- Define the integration boundary — most likely an authenticated API call from `breeding-app-backend` (or the breeder frontend directly) to whatever backend serves the new Marketplace site, carrying listing data (species, morph/genetics, price, photos, and enough of the breeder's `Organization` identity for Marketplace to attribute the listing to a seller).
- Decide authentication between the two systems (an API key issued per breeder org, or a service-level credential — a smaller-scoped version of the `ApiKey` concept from Phase 4 (6.4), worth building this one instance early rather than waiting for the general case).
- This step depends on decisions made outside this plan (Marketplace's own tech stack, domain, and whether it reuses any of the existing `MarketplaceListing`/`MarketplaceSale` schema or is built fresh) — treat it as an integration contract to agree on once those decisions land, not something to build speculatively ahead of them.

### 7.3 Support infrastructure

Add basic in-app support/feedback — even a simple "email us" widget is enough at first; a full help center/chat integration is not required for initial launch.

### 7.4 Native app store decision

Decide deliberately whether native (Android/iOS) app store distribution is part of the launch or explicitly deferred — today it's neither finished nor abandoned (`APP_STORE_CHECKLIST.txt` is an unchecked how-to guide, nothing has been submitted). If deferred, say so explicitly in product messaging rather than leaving it ambiguous.

**New entities introduced this phase:** none in this codebase (Marketplace's own data model, if any, belongs to its own build-out).
**Definition of done:** one shared auth/API-client implementation used by breeder/admin/lab; a working publish-to-Marketplace integration once Marketplace exists to receive it; a working feedback channel; a clear, stated decision on native distribution.
**Dependencies:** Phase 1 and Phase 2 complete (the auth/subscription logic being consolidated needs to be final first). 7.2 additionally depends on the external Marketplace site existing.

---

## 8. Master Sequencing

```
Phase 0 (stabilize)
   │
   ▼
Phase 1 (tenancy) ──────────────┐
   │                            │
   ▼                            │
Phase 2 (billing)                │
   │                            │
   ├── Phase 3 (compliance) ────┤   (parallel, no blocking dependency)
   ├── Phase 4 (ops hardening) ─┤   (parallel, ongoing)
   │                            │
   ▼                            ▼
Phase 5 (frontend consolidation + launch polish)
   │
   ▼
Public launch
```

Phase 3 and Phase 4 can start immediately alongside Phase 1/2 — they don't depend on the org model existing. Phase 5 is the only phase that explicitly waits for both Phase 1 and Phase 2 to be functionally complete, because it's consolidating code that both phases modify.

---

## 9. New Data Entities, Summarized

For reference, every new entity this plan introduces across all phases, in one place:

| Entity | Introduced in | Purpose |
|---|---|---|
| `Organization` | Phase 1 | The paying customer or admin-vetted vendor; replaces implicit "account = business" assumption. Distinguishes breeder orgs (self-service) from lab-vendor orgs (admin-invite-only) — likely via a `kind` field. |
| `Membership` | Phase 1 | User ↔ Organization join with an org-scoped role. |
| `OrganizationInvite` | Phase 1 (vendor-creating trigger) / Phase 2 (teammate trigger) | Two triggers, one entity: admin-invites-a-new-vendor (creates an org) vs. org-owner-invites-a-teammate (adds to an existing org). |
| `ApiKey` | Phase 4 (if triggered); one instance built early in Phase 5 (7.2) for the Marketplace publish integration | Programmatic access credential, scoped to an `Organization`. |

Every other phase re-points or extends existing entities (`SubscriptionTier`, `UserSubscription`, `UsageTracking`, `GdprRequest`, and the ~60 owner-scoped models) rather than introducing new ones.

---

## 10. Immediate Next Actions

In order, picking up from where Phase 0 currently stands:

1. ~~Run `npm install` in `breeding-app-breeder/` to pick up the `cross-env` dependency added during the Phase 0 Android cleanup.~~ Done.
2. Remaining Phase 0 work: 0.5 and 0.6 are built (see status table above) but need dashboard-side activation — flip `VITE_API_URL` to a same-origin proxy URL per app to activate cookie auth (0.5's Activation Steps), and configure a real `SENTRY_DSN`/`VITE_SENTRY_DSN` per environment to activate error tracking (0.6). Only 0.7 (the Railway/Netlify dashboard verification pass) requires you directly — it needs dashboard access this session didn't have.
3. Two product decisions Phase 1/2 need settled before building starts, now partially resolved by the 2026-07-28 scope clarification:
   - **Breeder org membership** — one organization per breeder, auto-created at signup, is the recommended default (3.1); confirm whether a single `User` can ever belong to more than one org (e.g. a lab technician working across two vendor labs) or whether one-org-per-user is a hard rule everywhere.
   - **Lab vendor billing** — are vendor-lab organizations billed a subscription themselves, or is Lab Portal access free for admin-vetted service providers, with revenue coming from breeder subscriptions and/or per-order fees instead (see the open question at the top of Phase 2)? This shapes whether 4.1's payment-gateway work applies to lab orgs at all.
4. Begin Phase 1 with the `LabAccount` migration (3.2, sub-step 1) — smallest blast radius, proves the pattern before applying it to the much larger breeder-side model set — alongside 3.3's admin "invite a vendor lab" tool, since the two are only useful together (the migration needs the invite tool to actually create the orgs it's migrating structure for).
