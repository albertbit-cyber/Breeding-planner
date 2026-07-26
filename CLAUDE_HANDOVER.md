# Claude Handover - Breeding Planner

Date: 2026-07-23
Repo: `D:\Git Clone\Breeding-planner`
Current branch: `staging/runtime-review-20260521`

## What Was Done: Account Email & Password Recovery Lifecycle

Implemented the complete user account email lifecycle on top of the Resend email system from the
previous session (below): public registration with email verification, resend-verification,
forgot/reset password, authenticated password/email change, and staff-invite convergence into the
same lifecycle.

**Full design writeup:** [`docs/architecture/account-lifecycle.md`](docs/architecture/account-lifecycle.md) —
read this before touching auth/account code further. This section is a summary.

### Repository baseline (inspected before writing anything)

- Auth was already JWT + `RefreshSession`-backed, with `bcryptjs` (cost 12), a `SecurityEvent` audit
  log, and CSRF-protected cookie auth alongside bearer tokens — all reused unchanged.
- Email verification existed but used a **stateless JWT** that nothing ever issued for
  self-registered users (`User.emailVerified` was permanently `false` and dormant for them).
  Forgot/reset-password already worked end-to-end but via the **legacy** inline `sendEmail()`
  (not the Resend queue) and a single reusable `passwordResetToken` column.
- A broken, orphaned `POST /auth/recover-password` route (email + exact full-name match, no token)
  was expected by the admin frontend's "forgot password" UI and by one backend test, but was never
  implemented in `authRoutes.ts` — confirmed via `git status`/test failure in the prior session's
  handover. **Retired** rather than implemented: the admin frontend's reset UI now uses the same
  secure token-based flow the breeder app already had; the stale test block was deleted.
- Admin-invite (`adminService.createAdminUser`) already queued its invitation email correctly (from
  the prior session) but its verification link used the old JWT signer.

### Architecture decisions (confirmed with the user before implementation)

1. Retire `/auth/recover-password` entirely; one secure recovery mechanism app-wide.
2. Login keeps issuing tokens normally for unverified accounts (no new partial-auth session
   architecture); `emailVerified` is now in the user DTO; frontends gate on it; a
   `requireVerifiedEmail` middleware gates exactly two backend routes
   (`PUT /api/listings/me`, `POST /api/lab/orders`), not the whole app.
3. Frontend scope: `breeding-app-breeder` + `breeding-app-admin` only.
   `breeding-app-lab`/`breeding-app-marketplace` (separate duplicated `AuthGate.jsx`/`apiClient.ts`
   copies in each) are explicitly deferred — the backend already supports them unchanged.

### Database changes

- New migration: `prisma/migrations/20260722100000_add_account_tokens/migration.sql` — new
  `AccountToken` model (dedicated, hashed, single-use, purpose-typed token table replacing both the
  JWT verification token and the reusable reset-password column) plus four new `User` columns
  (`emailVerifiedAt`, `pendingEmail`, `pendingEmailRequestedAt`, `passwordChangedAt`).
- **Data migration in the same file**: back-fills `emailVerified = true` for every row that existed
  before this migration ran, since none of them ever had a real verification flow — prevents
  locking out all existing users. Only accounts created after this migration start unverified.
- Verified: fresh-DB migration (all 30 migrations, empty `breeding_planner_fresh_test` database) and
  a repeat `migrate deploy` against the already-migrated dev DB (correct no-op).
- No existing migration file was modified. The unrelated, already-known
  `20260705120000_add_reproductive_family_tree` drift (see
  `memory/project_local_db_migration_blocker.md`) was not touched, only worked around the same way
  the email-system migration was (hand-authored via `prisma migrate diff`).

### Files changed/added (backend)

- `prisma/schema.prisma` — `AccountToken` model, 4 new `User` columns, `passwordResetToken`/
  `passwordResetExpiry` kept but marked deprecated (no longer written).
- `src/services/accountTokenService.ts` — new: `issueToken`/`consumeToken`/`revokeAllForPurpose`.
- `src/utils/maskEmail.ts` — new: extracted from `email/emailHistoryService.ts` (now shared between
  it and `authService.ts`'s `pendingEmail` masking).
- `src/email/templates/account{EmailVerification,PasswordReset,PasswordChanged,VerifyNewEmail,EmailChanged}Template.ts` —
  5 new templates, registered in `templates/index.ts`.
- `src/email/idempotency.ts` — 5 new idempotency-key builders for the account-lifecycle emails.
- `src/services/authService.ts` — rewritten: `registerUser` now queues verification;
  `verifyEmailForUser` and `requestPasswordReset`/`resetPassword` moved off the JWT/legacy-email
  path onto `AccountToken` + `enqueueEmail`; new `resendVerificationEmail`; `changeEmailForUser`
  changed to request-based (sets `pendingEmail`, doesn't flip `email` immediately); new
  `confirmEmailChange`; `changePasswordForUser` now also revokes outstanding reset tokens and
  queues a confirmation email.
- `src/services/adminService.ts` — `createAdminUser`/`resendUserEmailVerification` migrated onto
  `accountTokenService`/`enqueueEmail`; `USER_SELECT`/`normalizeUser` now surface `pendingEmail`.
- `src/controllers/authController.ts`, `src/routes/authRoutes.ts` — new `resendVerification`,
  `confirmEmailChange` handlers/routes; `src/validators/authValidators.ts` — 2 new schemas.
- `src/middleware/rateLimiters.ts` — new `authVerificationLimiter`.
- `src/middleware/auth.ts` — new `requireVerifiedEmail` middleware, applied in
  `listingRoutes.ts`/`orderRoutes.ts`.

### Tests added/updated

29 new tests across `accountTokenService.test.ts`, `authVerification.test.ts`,
`authForgotReset.test.ts`, `authChangePassword.test.ts`, `authChangeEmail.test.ts`,
`email/accountEmailTemplates.test.ts`; `auth.test.ts`'s orphaned `recover-password` block deleted
and its register/login fixtures extended for the new fields; `email/adminInvitationIntegration.test.ts`
and `orderRoutes.test.ts` updated for the new `AccountToken`/`requireVerifiedEmail` dependencies.

### Files changed (frontend)

- `breeding-app-breeder/src/shared/apiClient.ts` — `verifyEmail`, `resendVerification`,
  `confirmEmailChange`.
- `breeding-app-breeder/src/features/auth/AuthGate.jsx` — `?token=` link-flow handling for
  `/verify-email`, `/reset-password`, `/confirm-email-change`; resend-verification mini-flow;
  unverified-account gate card.
- `breeding-app-breeder/src/App.jsx` — account tab already had change-email/password forms; added
  verified/unverified badge and pending-email notice.
- `breeding-app-admin/src/shared/apiClient.ts` — same 3 new functions; removed the broken
  `recoverPassword`.
- `breeding-app-admin/src/features/auth/AuthGate.jsx` — replaced the broken name+email recovery UI
  with the token-based forgot/reset flow; same link-flow handling, resend mini-flow, unverified gate.
- `breeding-app-admin/src/admin/pages/TeamPage.jsx` — pending-email row, confirmation-email notes.
- `breeding-app-lab`, `breeding-app-marketplace` — **untouched**, deferred (see above).

### Verification results

- Backend: `npx tsc -p tsconfig.json --noEmit` clean; `npm run build` clean; `npx vitest run` —
  **237/237 passing** (38 test files). Both pre-existing failures documented in the prior handover
  turned out to be the two non-coincidental assertions inside the single orphaned
  `describe("POST /api/auth/recover-password", ...)` block (the 200-case and 400-case both expected
  a status the missing route could never return; the 404-case happened to pass by coincidence,
  since an unmatched Express route also 404s) — resolved by retiring that route/test entirely
  rather than fixing it in place, per the confirmed decision to standardize on the token-based flow.
- Fresh-DB migration and repeat-deploy no-op both verified.
- `breeding-app-admin`: `npx tsc --noEmit` clean, `npm run build` clean.
- `breeding-app-breeder`: `npx tsc --noEmit` clean, `npm run build` clean (one transient
  out-of-memory crash from the local Windows esbuild/node process during this session, unrelated to
  the code — resolved on retry with no code changes).
- Root lint: still pre-existing broken (no `eslint.config.js`), unchanged/not attempted, per explicit
  instruction not to take on a repo-wide lint migration here.

### Known limitations

- `requireVerifiedEmail` is only applied to 2 routes (listing creation, order creation) — a
  deliberate, narrow allowlist rather than app-wide enforcement, per the confirmed decision. Other
  write actions remain available to unverified accounts at the API layer (the frontend gate is the
  primary enforcement for the general app experience).
- `breeding-app-lab`/`breeding-app-marketplace` frontends do not yet have the new verify/reset/
  account-security pages — same backend endpoints already support them, only their duplicated
  frontend copies need the same additions.
- Invited (staff) users still receive a temporary password out-of-band via the inviting admin, with
  no forced "set your own password" step — an explicit, deliberate non-change (see
  account-lifecycle.md §11), not an oversight.
- No admin UI action to force-verify or force-reset a user's own email/password beyond what already
  existed (`markUserEmailVerified`, `resendUserEmailVerification`).

### Manual operator actions required

None beyond what the existing email-operations-runbook.md already lists (Resend/DNS setup) — this
feature adds no new operator-facing infrastructure, environment variables, or manual steps. It rides
entirely on the already-documented Resend account/webhook setup.

### Recommended next prompt

"Build the user-configurable notification-preference system: let users manage
`breeding_reminders`/`incubation_reminders`/`unexpected_breeding_events`/`weekly_summary`/
`product_updates` preferences from a real settings UI (the backend `preferencesService.ts`/
`GET|PUT /api/emails/preferences` already exists but has no dedicated frontend page in either app),
then extend the same duplicated-`AuthGate.jsx` treatment from this session to
`breeding-app-lab`/`breeding-app-marketplace` so all four frontends share the same account-lifecycle
UX."

## Prior Session: Resend Email Notification System (2026-07-22)

Implemented a production-ready, provider-neutral transactional email system in
`breeding-app-backend`, isolating Resend behind an `EmailProvider` interface, backed by a
Postgres-based durable queue/worker (no Redis/BullMQ — none existed in this repo, and it deploys
as a single Railway process).

**Full design writeup:** [`docs/architecture/email-notifications.md`](docs/architecture/email-notifications.md)
**Operations runbook (DNS, key rotation, troubleshooting, operator checklist):**
[`docs/architecture/email-operations-runbook.md`](docs/architecture/email-operations-runbook.md)

Read those two docs before touching this system further — this section is a summary, not the
full picture.

### Repository baseline (inspected before writing anything)

- Express + Prisma (Postgres) + Zod backend in `breeding-app-backend/`, single Railway web
  process (`railway.toml`), no existing queue/worker/scheduler/cron of any kind.
- **No organization/membership/invitation model exists.** This app is single-tenant-per-`User`
  (roles: `breeder`, `lab_owner`, `lab_staff`, `admin`, `buyer`, ...), tenant isolation is by
  `ownerId`/`userId`. "Organization invitation" was mapped to the existing
  `adminService.createAdminUser` admin-invites-a-team-user flow — see the architecture doc §2/§7
  for why.
- A prior "Reproductive Intelligence" feature already existed
  (`reproductiveCycleService.ts`, `ReproductiveCycle`/`LockEvent` tables) with a prediction engine
  for ovulation/pre-lay-shed/egg-laying windows. The new breeding-reminder integration reuses its
  existing window-calculation function rather than duplicating the math.
- Existing thin `emailService.ts` (webhook-or-dry-run) and `notificationService.ts` (in-app
  notifications, unrelated to email) were left in place and untouched — they're still used by
  unrelated admin ad-hoc email actions (`sendUserEmail`, `resendEmailVerification`) which were
  intentionally left out of scope.
- Test convention in this backend: `vi.mock("../lib/prisma", ...)` full mocks, no real-DB
  integration test harness. Followed the same convention for all new tests.

### Architecture decisions

- Provider-neutral `EmailProvider` interface (`src/email/provider.ts`), with `ResendEmailProvider`
  and `MockEmailProvider` implementations. Domain services never import the `resend` package.
- Durable Postgres outbox (`email_jobs` + `email_events` tables), claimed via atomic
  `FOR UPDATE SKIP LOCKED`, processed by an in-process polling worker started from `server.ts`.
- Templates are pure `(props) => {subject, html, text}` functions, keyed by `templateKey` +
  integer `templateVersion`, registered in `src/email/templates/index.ts`.
- Notification preferences (7 categories, `account_and_security` is the only non-disableable one)
  and a global email-address suppression list (bounce/complaint/manual).
- Resend webhook (`POST /api/webhooks/resend`) verifies Svix-format signatures by hand (no `svix`
  dependency added), mounted with `express.raw()` before the global JSON body parser.

### Database changes

- New migration: `prisma/migrations/20260722090000_add_email_system/migration.sql`
  (hand-authored via `prisma migrate diff` against the live dev DB, since `prisma migrate dev` was
  blocked by pre-existing, already-known migration drift on `20260705120000_add_reproductive_family_tree`
  — see `memory/project_local_db_migration_blocker.md`; that drift was **not** touched or fixed
  here, only worked around for this new migration).
- New tables: `email_jobs`, `email_events`, `notification_preferences`, `email_suppressions`.
- Verified: applies cleanly to a brand-new empty database (all 29 migrations in sequence), and a
  second `prisma migrate deploy` against the already-migrated dev DB is a correct no-op.
- No existing migration file was modified.

### Files changed/added (backend)

- `prisma/schema.prisma` — 4 new models + 2 new `User` relations.
- `src/config/env.ts` — `env.email.*` config, fails startup if `EMAIL_ENABLED=true` with missing
  Resend config.
- `src/email/**` — new module: `types.ts`, `provider.ts`, `providerFactory.ts`,
  `providers/{resendProvider,mockProvider}.ts`, `templates/**`, `queueService.ts`, `worker.ts`,
  `preferencesService.ts`, `suppressionService.ts`, `webhookService.ts`,
  `emailHistoryService.ts`, `idempotency.ts`.
- `src/controllers/{emailController,emailWebhookController,adminEmailController}.ts`,
  `src/routes/{emailRoutes,emailWebhookRoutes}.ts` — new; `src/routes/adminRoutes.ts` extended
  (4 new admin endpoints).
- `src/app.ts` — mounted the two new route groups (webhook before `express.json()`).
- `src/server.ts` — starts/stops the worker with graceful shutdown on `SIGTERM`/`SIGINT`.
- `src/services/adminService.ts` — `createAdminUser` now queues the invitation email via
  `enqueueEmail` instead of sending inline; temporary password is now always returned to the
  calling admin (was previously omitted when `sendInvite=true`, since it used to travel via the
  email body instead — the new template never carries a password).
- `src/services/reproductiveCycleService.ts` — added (and exported for testing)
  `syncExpectedEggLayingReminder()`, called from `ingestAllPairingsIntoReproductiveCycles()`.
- `.env.example` — new email variables documented.

### Files changed/added (admin frontend)

- `breeding-app-admin/src/shared/apiClient.ts` — 4 new functions (email history, retry, list/release
  suppressions).
- `breeding-app-admin/src/admin/pages/EmailsPage.jsx` — new page: email job table with status
  filter + retry action, suppression list with release action.
- `AdminApp.jsx` / `AdminLayout.jsx` — route + nav entry ("Emails").

### Tests added

89 new tests in `breeding-app-backend/src/tests/email/` (all passing), covering: email validation
and typed errors, the mock provider, Resend error-code mapping (retryable vs. permanent), all
three templates (including HTML-escaping), the queue service (idempotent enqueue, cancel/terminal-
state guards, atomic claiming, retry backoff + max attempts, out-of-order webhook rank-gating,
stuck-job recovery), preferences (required-category guard, defaults), suppression, the worker
(preference/suppression gating, success/retry/permanent-failure paths, one malformed job doesn't
stop the batch), the webhook (signature valid/invalid/tampered/replay/missing, unknown event type,
unknown message id, duplicate delivery, bounce/complaint suppression), the invitation integration
(queues instead of sending inline, password never in the template payload), the breeding-reminder
integration (new/unchanged/changed/cleared ovulation date), and tenant isolation on the history
read paths.

### Verification results

- `npx tsc --noEmit` (backend): clean.
- `npm run build` (backend): clean.
- `npx vitest run` (backend): **191/193 passing** — the 2 failures are pre-existing and unrelated
  (`src/tests/auth.test.ts`, `POST /api/auth/recover-password` returns 404 because that route does
  not exist in `authRoutes.ts`; confirmed via `git status` that this file and the test file were
  never touched this session).
- `breeding-app-admin`: `npm run typecheck` and `npm run build` both clean.
- Root `npm run lint`: **pre-existing broken**, unrelated to this work — ESLint 9 is installed but
  there is no `eslint.config.js` anywhere in the repo; not attempted to fix (out of scope, and
  fixing repo-wide lint config risks touching unrelated files).
- Fresh-database migration run and repeat-deploy no-op both verified (see §"Database changes").

### Known limitations (be honest about these)

- The breeding-reminder email's "view record" link uses a `?focusPairing=` query parameter the
  breeder frontend does not yet read — clicking it opens the app but does not auto-navigate to the
  pairing. Small, contained frontend follow-up.
- The `unexpected_egg_laying` template exists but is **not wired to a trigger** — the spec only
  required one full reminder integration, and this template was explicitly listed as one of the
  three to build regardless. The natural trigger point
  (`Pairing.completionReason`/`workflowStatus`/`completedAt`, from migration
  `20260715180000_add_breeding_project_completion`) is identified in the architecture doc §11 but
  not implemented.
- No "resend invitation" admin action was added (would reuse the same idempotency key to avoid a
  duplicate active invite email) — only the initial invite is wired through the queue.
- The expected-egg-laying reminder date uses the species-default interval window
  (`SPECIES_DEFAULTS.ovulationToEggLaying`), not the personal/collection-informed prediction the
  reproductive intelligence system can produce for a female with cycle history — a reasonable,
  deterministic, testable first cut, but not the most accurate one available in this codebase.
- Manual operator work (Resend account, DNS/SPF/DKIM/DMARC, webhook registration, production
  secrets) is **entirely unstarted** — see the runbook's checklist. Nothing in that checklist was
  performed or can be verified from inside this repository.

### Recommended next prompt

"Wire the `unexpected_egg_laying` template to `Pairing` completion/reopen state in
`reproductiveCycleService.ts` (or `breederDataService.ts`, wherever clutches get ingested for an
already-completed pairing), following the same enqueue/cancel pattern used for the expected-egg-
laying reminder. Then have the breeder frontend consume `?focusPairing=`/`?focusAnimal=` query
parameters on load so the reminder emails' links actually navigate to the right record instead of
just opening the app."

## Prior Session Context (2026-06-29, resolved)

The previous handover entry (auth-isolation fix across admin/breeder/lab/marketplace apps,
commits `91e87ae` and `f699151`) has been superseded by the above. That work was verified deployed
and closed out; if you need the details, they're in git history at those two commit hashes.
