# SaaS-Readiness Re-Audit

**Date:** 2026-09-08
**Branch audited:** `feature/lab-vendor-onboarding` @ `e5cffff` (level with `origin/main`, working tree dirty)
**Supersedes:** the status snapshot in `docs/status/saas-readiness-status.html` (2026-08-07)
**Builds on:** `docs/architecture/saas-readiness-audit.md` (2026-07-27)
**Method:** static analysis plus live execution — full test suites run in all five workspaces, `tsc --noEmit` on backend and breeder, `npm audit` on backend and four frontends, schema/migration inspection, route-by-route authorization reading.

---

## 1. Verdict

**The laboratory half of this product is now genuine multi-tenant SaaS. The breeder half is not, and nothing can be charged for on either side.**

That is a real change since July, and it is worth stating precisely because it is easy to undersell. A vendor laboratory today gets an organization, an owner, staff it invites itself, its own test catalogue, its own prices, its own order queue, and certificates that belong to it — with 79 backend tests and a Playwright spec specifically asserting that one lab cannot see another's. That is not scaffolding. That is the tenancy model working end to end on the surface that needed it most.

The breeder side received the *shell* of the same treatment. Signing up now creates an `Organization` and an owner `Membership` in the same transaction as the account. But no breeder data was re-pointed at it, there is no team UI, and there are no backend routes to invite anyone into a breeder org. A breeder organization is currently an empty room with a nameplate.

And the three gates named in July are all still shut:

| Gate | Status | Movement since 2026-07-27 |
|---|---|---|
| Payment processing | **Not started** | None. No payment SDK in any workspace. |
| Legal documents completed | **Blocked on one decision** | Documents written and live; 12 placeholders unchanged since 2026-08-05. |
| Legal review | **Not started** | None. |

Everything below the gates is where this pass found new material.

---

## 2. What actually shipped since the last audit

Verified, not taken from changelogs.

| Capability | Evidence |
|---|---|
| Lab-vendor tenancy, end to end | `Organization`/`Membership`/`OrganizationInvite` models; `withOrgContext` + `requireOrgRole` middleware; `organizationId` on `LabAccount`, `LabTestOffering`, `PricingConfig`, `LabGeneSubmission`; `labOrganizationId` on orders, certificates and pending tests |
| Vendor self-service staff seats | `POST/GET/DELETE /api/lab/my/team/invites` behind `requireOrgAdmin`, wired to `LabTeamPage.jsx` |
| Admin vendor onboarding | `/api/admin/vendor-labs/invites` (create/list/revoke), `/vendor-labs/:id/status` suspend, surfaced in `LabsPage.jsx` |
| Tenant-isolation test coverage | 79 tests across `tenantIsolation`, `vendorRouteIsolation`, `labVendorTenancy`, `orgRoleMatrix`, `organizationService`, `organizationInviteService`, plus `tests/e2e/vendor-isolation.spec.ts` |
| Breeder orgs created at signup | `authService.ts:179-188`, inside the account-creation transaction |
| Feature gating actually wired | `canAccessFeature` now called from breeder sync, listings, marketplace and mobile services — in July this was "metering exists, enforcement not found end to end" |
| Partner-application intake | `PartnerApplication` model, `POST /api/partners/applications`, form in the lab app's `AuthGate.jsx` |
| Backend suite growth | 494 tests / 56 files, all green; `tsc --noEmit` clean |

Cumulative test position measured this session:

| Workspace | Result |
|---|---|
| backend | 494 passed / 56 files — green |
| breeder | 585 passed / 40 files — green |
| shared | 64 passed / 7 files — green |
| lab | 92 passed, **1 failed** / 14 files |
| admin | 19 passed, **1 failed** / 3 files |

---

## 3. New findings

These are not in the July audit or the August status page.

### 3.1 `trust proxy` is unset, which collapses every rate limit into one global bucket — HIGH

`grep -rn "trust proxy" src/` returns nothing. Express therefore leaves `trust proxy` at `false`, and `req.ip` resolves to the socket peer — which, behind Railway's edge proxy, is the same address for every client on earth.

`express-rate-limit@8.5.2`'s default `keyGenerator` is `request.ip` (verified in `node_modules/express-rate-limit/dist/index.cjs:808-813`), and no limiter in `src/middleware/rateLimiters.ts` overrides it. The consequence is not a weakened limit, it is an inverted one:

- `authWriteLimiter` — 10 requests / 15 min — becomes **ten logins per fifteen minutes for the entire platform**, shared by every user.
- `authRecoveryLimiter` — 5 / hour — becomes five password resets per hour, platform-wide. This one also guards `/api/partners/applications` and the invite-preview route.

So the first busy hour of real traffic locks everyone out of signing in, and a single actor can trivially deny sign-in to all users.

What makes this hard to catch is the interaction with the second half of the finding. Every limiter carries `skip: productionOnly` — they do nothing unless `NODE_ENV === "production"` — so no test, no local run and no staging environment ever executes this code path. The library does detect the misconfiguration (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, same file, line 379), but it can only fire where the limiter runs, which is production alone, and it logs once to stdout before `config.validations.disable()` silences it.

Fix is two lines — `app.set("trust proxy", 1)` in `app.ts`, and dropping `skip: productionOnly` so the limiters are exercised by the suite. The `skip` was flagged as open in August; the missing `trust proxy` is what makes it consequential rather than merely untested.

### 3.2 The production health check cannot detect a dead database — HIGH

`railway.toml` sets `healthcheckPath = "/api/health"`. That handler (`app.ts:110`) returns a static 200 with a timestamp and never touches Postgres.

The DB-aware check does exist — `systemRoutes.ts:18`, `/api/system/db-check`, calling `checkDatabaseConnection()` — and is explicitly disabled in production:

```ts
if (env.nodeEnv === "production") {
  res.status(404).json({ message: "Not found" });
  return;
}
```

So `restartPolicyType = "ON_FAILURE"` can never trigger on loss of the database. The process stays "healthy" while every request 500s. Combined with Sentry being opt-in on a DSN that may not be set, the realistic detection path for a database outage is a customer email.

### 3.3 A failed migration still starts the server — MEDIUM

`"start:migrate": "npm run prisma:migrate:deploy; npm start"`.

The separator is `;`, not `&&`. A migration that fails is logged and then ignored, and the app boots against a schema it does not match. The error handler has a branch for exactly this (`P2021`/`P2022` → 503 "Server database needs an update"), which suggests it has happened. `&&` would be worse in a different way — a deploy that never comes back up — which is why the July audit's recommendation to move migration out of app boot entirely still stands. This runs on every instance boot.

### 3.4 One flaky test, copied into four apps, is red right now — MEDIUM

`src/i18n/default-language.test.js` is a byte-identical 1122-byte file in breeder, lab, admin and marketplace, all dated 2026-08-31. It dynamically imports the whole i18n bundle and asserts the initial language is English.

On this run it **failed in lab and admin** and passed in breeder. Run in isolation it passes in 4.17s — against vitest's default 5s timeout. It is not a broken assertion; it is a test sitting on the timeout boundary that tips over whenever the machine is loaded, which on a shared CI runner is most of the time.

CI has separately been reported red on `main` since roughly 2026-08-30 on the lab Playwright step. That is a different step and could not be verified this session (no `gh` CLI available), so treat it as an open second question rather than the same fault.

Fix: give the test an explicit timeout and hoist it into `breeding-app-shared` instead of maintaining four copies.

### 3.5 Dependency vulnerabilities, including one with no fix in the newest feature — MEDIUM to HIGH

| Workspace | critical | high | moderate | low |
|---|---|---|---|---|
| backend (prod only) | 0 | 1 | 21 | 2 |
| breeder | 3 | 8 | 4 | 1 |
| lab | 2 | 7 | 4 | 1 |
| admin | 1 | 6 | 2 | 0 |
| public | 0 | 4 | 3 | 0 |

Two deserve naming because they sit on paths that eat untrusted input:

- **`xlsx@0.18.5`** — high, **no fix available** at any version. This is the library the newest commit uses to read a laboratory's uploaded price list. Parsing a file supplied by an external party with a permanently-vulnerable parser is the one dependency finding here that is a design question, not a version bump. Worth migrating to a maintained reader before that feature is switched on.
- **`pdfjs-dist@3.6.172`** — high; the advisory covers script execution while parsing a malicious PDF.

Backend's single high is `ip-address` (SSRF / trust-boundary bypass, pulled in transitively) and is fixable with `npm audit fix`.

### 3.6 Feature limits do not hold at the one place a paywall would need them — MEDIUM

`breederDataService.ts:636-642`:

```ts
if (!animalAccess.allowed && animalAccess.reason === "Usage limit reached") { throw ... }
if (animalAccess.limit !== undefined && animalAccess.limit !== null && animals.length > Number(animalAccess.limit)) { throw ... }
```

Only *one* of `canAccessFeature`'s several denial reasons is enforced. A user with no active tier gets back `{ allowed: false, reason: "Feature requires X tier" }` — and crucially, **no `limit` key at all**. Both guards fall through, and the sync writes an unlimited number of animals.

This is harmless today because `changeOwnSubscription` gives any tier away for free anyway. It matters the moment billing exists, because it means the metering as written cannot be the paywall — it is a display of usage, not a gate on it.

### 3.7 The only door into the Lab Portal has a doorbell nobody can hear — MEDIUM

The partner-application journey is built in three of four parts:

- Entry point: form in `breeding-app-lab/src/features/auth/AuthGate.jsx:234` → `POST /api/partners/applications`. Works.
- Storage: `PartnerApplication` model with status/reviewer/review-note. Works.
- Admin API: `GET`/`PATCH /api/admin/partner-applications`. Works, and `breeding-app-admin/src/shared/apiClient.ts:1219` already has the client methods.
- Admin UI: **does not exist.** No page in `breeding-app-admin/src/admin/pages/` calls either method.

Since onboarding is invitation-only by deliberate design, this form is the only way a laboratory that hears about the platform can raise its hand. Applications currently accumulate in a table with no screen that reads them.

### 3.8 Public pricing is a second, disconnected source of truth — MEDIUM

`breeding-app-public/src/pages/PricingPage.jsx` hardcodes the plans and prices (5 / 10 / 20 monthly, with yearly variants). The `SubscriptionTier` table is what the admin console edits and what `canAccessFeature` enforces. The two can disagree silently, and the marketing page is the one customers read.

Two smaller faults on the same page: the "Contact us" CTA links to `/contact`, which has no route in `App.jsx` and therefore falls through the `*` catch-all to the homepage rather than 404ing; and the contact address is `hello@breedingplanner.com`, while the legal documents commit — in a legally binding way — to `info@serpentora.com`.

### 3.9 CI covers four workspaces of seven; the one automated deploy ships the product that is leaving — MEDIUM

`dependency-ci.yml` installs, tests and builds backend, shared, lab and breeder, then runs both Playwright suites. **admin, marketplace and public are in no pipeline at all** — never built, never tested, never type-checked on a PR. `breeding-app-public` has no `test` script and no `netlify.toml`, which is notable given it is the intended serpentora.com.

Meanwhile `deploy.yml`, the only workflow in the repo that deploys anything, publishes `breeding-app-marketplace` to GitHub Pages on every push to `main` — the app the July audit recorded as spinning out of this codebase.

### 3.10 The newest feature is not reachable from the UI — LOW (likely in flight)

HEAD is "Let a laboratory bring its price list as a spreadsheet". `parseCatalogueSheet.ts` and `buildCatalogueTemplate.ts` exist, are well-documented and have real tests — and are imported by nothing except those tests. No page renders an upload control for them; the only `<input type="file">` in the lab app is the logo picker in `LabSettingsPage.jsx`.

Given the branch name and a dirty working tree this is probably mid-flight rather than abandoned. Flagging it so it does not get counted as shipped.

### 3.11 A substantial amount of unpushed, unreviewed work — LOW but rising

20 modified and 18 untracked paths, including a new Prisma migration (`20260907120000_add_order_archive_and_certificates`), a new backend service (`labCertificateService.ts`), a new lab page, a backfill script, and schema changes. `origin/main` is level with HEAD, so none of it exists anywhere but this disk. The August status page recorded a clean tree; that property has been lost.

---

## 4. Carried forward from July, re-verified

| Finding | Still true? | Note |
|---|---|---|
| No payment gateway | **Yes** | No payment SDK in any `package.json`. `changeOwnSubscription` writes `paymentProvider: "self_service"`, `paymentStatus: "none"` and switches tier immediately. |
| No tests for subscription code | **Yes** | Zero test files matching `subscri*`. Unchanged, and still the one area where a bug costs money directly. |
| Legal placeholders | **Yes** | Impressum 8, Privacy 3, Terms 1 — same 12 as 2026-08-05. All trace to one unmade decision: the operating legal entity. |
| Breeder data still per-user | **Yes** | 63 models; 6 carry `organizationId`; ~32 still key directly to a `User`. `Animal`, `Pairing`, `Clutch`, `Listing` unmoved. |
| `breeding-app-shared` imported by nobody | **Yes** | Appears in no app's dependencies. Five diverged `apiClient.ts` copies: 58.7k (breeder), 51.7k (lab), 51.5k (admin), 46.9k (shared), 40.5k (marketplace). |
| Tokens in `localStorage` | **Yes** | Cookie mode activates only when `isSameOriginApiBaseUrl(baseUrl)`. `generate-netlify-redirects.cjs` writes the proxy rule, but every app still calls the absolute `VITE_API_URL`, so the rule is inert and cookie mode never engages in production. |
| Rate limiters skip outside production | **Yes** | Now compounded by §3.1. |
| No 2FA, no API keys, no OpenAPI | **Yes** | Unchanged. |
| Deploys not driven by CI | **Yes** | Netlify/Railway are dashboard-triggered; the branch mapping exists only in Netlify's UI. |
| Stale root `android/` | **Partly** | Present on disk but **untracked** (`git ls-files android` → 0). Local cruft, not a repository problem. The root `package.json`/`index.html` still describe a Vite app whose entry `/src/index.jsx` does not exist, so the root build is broken. |
| Settings → My Account render loop | **Unverified** | Requires a running app; not reproduced this session. |
| Cloud-sync 413s | **Unverified** | Instrumentation in place (`errorHandler.ts` logs path and caller); still awaiting production log data. |

Newly noted gaps in the same family: **no documented backup or restore policy** (no RPO/RTO, no evidence of a tested restore — the only backup mention in `docs/` is a pre-deploy step in the lab-tenancy runbook); **no uptime monitoring** configured in-repo; **admin console has 3 test files / 20 tests across 13 pages**; and **pre-2026-07-30 accounts have no `Membership` row** — no migration backfilled them, and `requireOrgRole` answers a member-less actor with 403, so the day a breeder route gets an org gate, every legacy account breaks.

---

## 5. What to do, in order

**Before anything else — the two-line fixes that are disproportionately expensive to leave.**
`app.set("trust proxy", 1)`, remove `skip: productionOnly`, and make the Railway health check query the database. Roughly an afternoon; each one is currently a production incident waiting for its first busy hour.

**Then the decision only you can make.**
The legal entity. Twelve placeholders across three documents, one conversation with a Steuerberater, and an entire launch gate closes. Nothing technical depends on it and nothing else can unblock it.

**Then finish the breeder tenancy you started.**
Breeder orgs exist and own nothing. Re-point `Animal`/`Pairing`/`Clutch`/`Listing` at `organizationId`, backfill memberships for legacy accounts, and add the team-invite routes and UI that the lab side already proves out. This is the item that gets more expensive every week — every model added in the meantime is another one to retrofit. The lab implementation is a working template; copying it is much cheaper than the first one was.

**Then billing.**
Stripe against `Organization`, `changeOwnSubscription` behind a checkout, enforcement of *every* denial reason rather than one, and the subscription tests that still do not exist.

**In parallel, cheap and independent:** un-flake the i18n test and hoist it into `shared`; add admin/public to CI; build the partner-applications admin page; delete or repoint `deploy.yml`; run `npm audit fix` on the backend and decide what to do about `xlsx`; reconcile the public pricing page with the tier table.

---

## 6. Bottom line

July's audit said the tenancy layer "does not degrade gracefully into SaaS; it has to be built." Half of it now is, properly, with tests — that is real progress and the hardest conceptual work is behind you. What has not moved is the half that carries the revenue: breeder data still belongs to individuals, no money can change hands, and the legal identity is undecided.

The new operational findings are the more urgent story, because they are cheap and they fail in production only. A platform-wide login lockout after ten attempts, and a health check that reports "ok" through a total database outage, are both an afternoon's work to fix and neither can be discovered by any test you currently run.
