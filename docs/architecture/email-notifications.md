# Email Notification System

Added 2026-07-22. Lives entirely in `breeding-app-backend`. This is the current, authoritative
reference for the transactional email system — provider abstraction, queue, worker, templates,
preferences, suppression, and the Resend webhook.

## 1. Architecture overview

```
Domain trigger (adminService, reproductiveCycleService, ...)
        │  enqueueEmail(...)
        ▼
email_jobs table (Postgres, durable outbox)
        │  claimNextBatch() — atomic FOR UPDATE SKIP LOCKED
        ▼
Worker tick (src/email/worker.ts, polling loop in server.ts)
        │  1. check notification preference
        │  2. check suppression list
        │  3. render template
        │  4. call provider
        ▼
EmailProvider interface (src/email/provider.ts)
        ├── ResendEmailProvider  (real send, isolates the Resend SDK)
        └── MockEmailProvider    (used whenever EMAIL_ENABLED=false — dev/test)
        ▼
Resend ──(webhook)──► POST /api/webhooks/resend ──► email_jobs.status, email_events
```

Nothing outside `src/email/providers/resendProvider.ts` imports the `resend` package. Domain
services (`adminService.ts`, `reproductiveCycleService.ts`) only ever call `enqueueEmail(...)` —
they have no knowledge of Resend, HTTP, or retry logic.

Key files:

- `src/email/types.ts` — `EmailMessage`, `EmailSendResult`, typed error hierarchy (`EmailError` and
  subclasses: configuration / validation / rendering / suppressed-recipient / retryable-provider /
  permanent-provider).
- `src/email/provider.ts` — the `EmailProvider` interface.
- `src/email/providers/resendProvider.ts`, `src/email/providers/mockProvider.ts` — the two adapters.
- `src/email/providerFactory.ts` — chooses the provider from `env.email`; nothing else touches this
  decision.
- `src/email/templates/` — one file per template + a registry (`templates/index.ts`) keyed by
  `templateKey` + `templateVersion`.
- `src/email/queueService.ts` — all persistence: enqueue, claim, cancel, retry scheduling, webhook
  status transitions, stuck-job recovery.
- `src/email/worker.ts` — the polling loop and per-job processing logic.
- `src/email/preferencesService.ts` — per-user, per-category notification preferences.
- `src/email/suppressionService.ts` — bounce/complaint/unsubscribe suppression list.
- `src/email/webhookService.ts` — Resend (Svix-format) signature verification + event processing.
- `src/email/emailHistoryService.ts` — read-side DTOs for the user and admin history views.
- `src/email/idempotency.ts` — deterministic idempotency-key builders for each trigger.

## 2. Why this design, given the existing codebase

This app has **no organization/membership/invitation model** — it's single-tenant-per-`User`, with
roles (`breeder`, `lab_owner`, `lab_staff`, `admin`, `buyer`, ...) and data scoped by `ownerId`/
`userId`, not by an organization id. Two adjustments follow from that:

- **"Tenant" = `User.id`.** Every `email_jobs` row has an `owner_id` FK to `User`, and all
  history/queue lookups filter by it. There is no separate organization table to isolate against.
- **"Organization invitation" (Integration A) maps to the existing admin-creates-a-team-user
  flow** (`adminService.createAdminUser`, used for admin/moderator/support/lab account creation).
  It was already the closest real analogue to "an authorized user invites someone to join" in this
  codebase — it persists a new `User` row and previously sent an inline email. See §7.

## 3. Database

Migration: `prisma/migrations/20260722090000_add_email_system/migration.sql`.

- **`email_jobs`** — the durable outbox. One row per queued email. Columns match the fields
  requested in the originating spec (`owner_id`, `recipient_email`, `category`, `template_key`,
  `template_version`, `template_payload` (jsonb), `subject`, `scheduled_for`, `status`,
  `attempt_count`, `maximum_attempts`, `next_attempt_at`, `last_error_code`, `last_error_message`,
  `provider`, `provider_message_id`, `idempotency_key` (unique), `related_entity_type`/`_id`,
  timestamps for created/processing_started/sent/delivered/failed/cancelled/updated).
  Indexes: `owner_id`; `(status, next_attempt_at)` and `(status, scheduled_for)` for worker polling;
  `provider_message_id` for webhook lookups; `(related_entity_type, related_entity_id)` for
  cancel-on-change lookups from domain code.
  Status values: `pending, processing, provider_accepted, delivered, delivery_delayed, failed,
  bounced, complained, suppressed, cancelled`.
- **`email_events`** — append-only history of provider webhook events per job.
  `provider_event_id` (the Resend/Svix `svix-id`) is unique, which is what makes webhook processing
  idempotent — a redelivered webhook is a no-op insert, not a duplicate history row.
- **`notification_preferences`** — one row per `(user_id, category)`. Missing rows fall back to
  documented defaults (§6), they are not created eagerly for every user/category pair.
- **`email_suppressions`** — one row per normalized email address (global, not per-tenant — see §6
  for why no organization scoping was added here).
- **`account_tokens`** — added 2026-07-23 (`20260722100000_add_account_tokens`), a dedicated
  purpose-typed, hashed, single-use token table for email verification, password reset, and
  email-change confirmation. Not part of the email-queue system itself, but the thing that feeds
  the action URLs into the five account-lifecycle templates. Full detail in
  [account-lifecycle.md](./account-lifecycle.md) §3.

No existing migration was modified. `prisma migrate deploy` was verified against a brand-new empty
database (`breeding_planner_fresh_test`) — all 29 migrations, including this one, apply cleanly in
sequence, and a second `migrate deploy` run against the already-migrated dev database is a correct
no-op.

## 4. Environment variables

See `breeding-app-backend/.env.example`. Server-only, never exposed to any frontend build:

```
PUBLIC_APP_URL=                 # trusted base URL for links in emails — never derived from request headers
EMAIL_ENABLED=false             # false ⇒ MockEmailProvider is used everywhere, regardless of EMAIL_PROVIDER
EMAIL_PROVIDER=resend
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
EMAIL_FROM_NAME="Breeding Planner"
EMAIL_FROM_ADDRESS=notifications@mail.example.com
EMAIL_REPLY_TO=support@example.com
EMAIL_WORKER_ENABLED=true
EMAIL_WORKER_POLL_INTERVAL_MS=15000
EMAIL_WORKER_BATCH_SIZE=10
EMAIL_WORKER_STUCK_JOB_MINUTES=10
```

`src/config/env.ts` throws at process startup if `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=resend`
but `RESEND_API_KEY`, `EMAIL_FROM_NAME`, or `EMAIL_FROM_ADDRESS` are missing. It never logs the key
or webhook secret values themselves.

## 5. Worker

There is no Redis/BullMQ in this repository, and this deploys as a single Railway web process
(`railway.toml` → one `startCommand`), so the worker is an **in-process polling loop**
(`setInterval` in `startEmailWorker()`, started from `server.ts` after `app.listen`), not a
separate service. This matches the existing architecture rather than introducing new
infrastructure. If the app is later split into multiple Railway services, `runWorkerTick()` /
`processEmailJob()` are already framework-free and can be lifted into a dedicated worker process
unchanged.

Claiming is concurrency-safe even with multiple instances of the web process (e.g. during a
Railway deploy overlap): `claimNextBatch()` runs a single atomic
`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, so two workers can never claim the
same row. `recoverStuckJobs()` resets jobs stuck in `processing` (worker crashed mid-send) back to
`pending`, or to `failed` if `attempt_count >= maximum_attempts`.

Retry backoff: `30s * 3^(attempt-1)`, capped at 1 hour. Once `attempt_count` reaches
`maximum_attempts`, the job moves to `failed` (terminal) instead of retrying forever.

One job's failure (including a template-rendering crash) never stops the batch — `processEmailJob`
never throws; every path updates the job row.

## 6. Notification preferences and suppression

Categories (`src/email/preferencesService.ts`): `account_and_security`,
`organization_invitations`, `breeding_reminders`, `incubation_reminders`,
`unexpected_breeding_events`, `weekly_summary`, `product_updates`.

`account_and_security` is the only category treated as required/non-disableable — it corresponds
to authentication, verification, and security-relevant account notices. Every other category can
be turned off per user. Defaults (used when no preference row exists yet): everything defaults
**on** except `weekly_summary` and `product_updates`, which default **off** — nobody is silently
opted into a digest or marketing email.

Suppression (`email_suppressions`) is **global per address**, not scoped to an owner. This is a
deliberate consequence of §2: this app has no organization boundary, and a given email address
already maps 1:1 to at most one `User.email` (unique constraint), so a per-tenant suppression
scope wouldn't mean anything here — suppressing `x@y.com` because Resend hard-bounced it is valid
regardless of which `User` row happens to reference that address in a job payload.

Required-category email (`account_and_security`) bypasses both the preference check and the
suppression check in the worker — see `REQUIRED_CATEGORIES` in `preferencesService.ts` and its use
in `worker.ts`.

## 7. Resend webhook

`POST /api/webhooks/resend`, mounted in `app.ts` **before** the global `express.json()` middleware
via `express.raw({ type: "*/*" })`, because Svix/Resend signature verification needs the exact raw
bytes of the request body — a JSON-parsed-then-reserialized copy will not verify.

Signature verification (`src/email/webhookService.ts#verifyResendWebhookSignature`) implements the
Svix v1 scheme by hand (HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, using the
base64-decoded secret after stripping the `whsec_` prefix) rather than adding the `svix` package as
a dependency, since it's a small, well-specified algorithm. It also rejects any event whose
timestamp is more than 5 minutes old (replay protection).

The job (and therefore its owner) is resolved **only** via `provider_message_id`, which we
generated and stored ourselves when the email was sent — the webhook payload's own email/recipient
fields are never trusted for identity or authorization purposes.

Status transitions are rank-gated (`STATUS_RANK` in `queueService.ts`): an out-of-order or
duplicate webhook can never move a job backward from a more-terminal status to a less-terminal
one. Duplicate webhook deliveries (same `svix-id`) are detected via the unique
`email_events.provider_event_id` constraint and are a no-op (`{ outcome: "duplicate" }`).

Bounce → suppress `hard_bounce` (source `webhook`); complaint → suppress `complaint`. A plain
`email.failed` does not suppress — only a bounce or complaint does.

## 8. Templates

`src/email/templates/`. Each template is a pure function `(props) => { subject, html, text }`,
registered by `templateKey` + integer `templateVersion` in `templates/index.ts`. All user-supplied
string fields are HTML-escaped (`escapeHtml.ts`) before interpolation into the shared branded
layout (`layout.ts`).

1. **`team_invitation`** (`invitationTemplate.ts`) — inviter/invitee name, role, optional
   expiration, secure action link. No internal IDs are exposed in the email body.
2. **`breeding_reminder`** (`breedingReminderTemplate.ts`) — one reusable template covering all 7
   reminder subtypes listed in the originating spec (pairing follow-up, ultrasound/follicle check,
   expected ovulation window, pre-lay shed follow-up, expected egg-laying window, incubation check,
   estimated hatch window). It receives an already-formatted, already-timezone-converted display
   date string from the caller — it does not do any date math itself.
3. **`unexpected_egg_laying`** (`unexpectedEggLayingTemplate.ts`) — for the "eggs recorded after
   project closure" scenario described in the spec. **Not currently wired to a trigger** — see §11.
4. **`account_email_verification`**, **`account_password_reset`**, **`account_password_changed`**,
   **`account_verify_new_email`**, **`account_email_changed`** — added 2026-07-23 for the account
   email/password lifecycle (registration verification, forgot/reset password, authenticated
   password/email change). Full detail in
   [account-lifecycle.md](./account-lifecycle.md). These five also queue under
   `account_and_security` and follow the exact same registry/versioning pattern as the templates
   above — no new template infrastructure was added.

Subjects are intentionally generic ("Breeding reminder", "You're invited to Breeding Planner") —
no animal name, genetics, or health information is ever placed in a subject line. The same applies
to the five account-lifecycle templates: no password, password hash, or raw token value ever
appears in a subject or body — only the one-time action URL.

## 9. The two wired application flows

### A. Admin-invite → invitation email (`adminService.createAdminUser`)

Unchanged: the invitation persists the new `User` row and audit-logs the action exactly as before.
Changed: instead of calling `sendEmail(...)` inline (which could fail the whole request if the
provider hiccups, and had no retry/tracking), it now calls
`enqueueEmail({ ..., idempotencyKey: invitationIdempotencyKey(createdUserId) })`. The HTTP response
now returns `{ queued: true, jobId }` instead of `{ delivered, provider }` for the email field.

One deliberate behavior change, called out for review: the previous inline email put the temporary
password directly in the email body in plaintext. The new template does not (no template should
ever carry a live credential). The temporary password is now **always** returned in the API
response to the calling admin (previously it was only returned when `sendInvite=false`) — same
audience as before (the admin who is creating the account), just no longer transiting through
email as a second, weaker channel.

### B. Ovulation recorded → expected egg-laying reminder (`reproductiveCycleService`)

Hooked into `syncExpectedEggLayingReminder()`, called from
`ingestAllPairingsIntoReproductiveCycles()` (the function that already runs, fire-and-forget, every
time the breeder app syncs its snapshot — see `breederDataService.ts`). Chosen because it's a real
row-level mutation with concrete before/after ovulation-date values, unlike the reproductive
prediction engine (`getFemaleReproductiveProfile`), which is a pull-based, on-demand read model
with no natural "something changed" hook.

Logic:

- Ovulation date newly set → enqueue a reminder for the *average* expected egg-laying date
  (reusing `buildWindowFromDefault(SPECIES_DEFAULTS.ovulationToEggLaying, ...)`, the same function
  the prediction engine itself uses — no duplicated day-math).
- Ovulation date unchanged → no-op, existing reminder (if any) is left alone.
- Ovulation date changed → cancel the previous reminder (`cancelByIdempotencyKey`) and queue a
  replacement.
- Ovulation date cleared → cancel only, nothing rescheduled.

Idempotency key: `breeding_reminder:<cycleId>:expected_egg_laying_window` — stable across re-syncs
of the same pairing.

**Known limitation:** the reminder email's call-to-action link
(`{PUBLIC_APP_URL}/#/?focusPairing=<id>`) is a best-effort deep link. The breeder frontend does not
currently read a `focusPairing` query parameter to auto-open the relevant pairing — a user
following the link lands in the app but must navigate manually to the pairing. Wiring that up is a
small, contained frontend follow-up (see the recommended next prompt in the handoff doc).

## 10. Email history / operator visibility

- `GET /api/emails/history` — any authenticated user's own history (`emailHistoryService.ts`
  `toUserSafeDto`): masked recipient address, no internal IDs, user-safe failure wording.
- `GET /api/emails/preferences`, `PUT /api/emails/preferences/:category` — self-service preference
  management.
- `GET /api/admin/emails?status=`, `POST /api/admin/emails/:id/retry` (requires a `reason`, audit
  logged as `email_job_retried`) — admin-only, `adminRoutes.ts`.
- `GET /api/admin/email-suppressions`, `POST /api/admin/email-suppressions/:email/release`
  (requires a `reason`, audit logged as `email_suppression_released`).
- Admin UI: `breeding-app-admin` → **Emails** page (`src/admin/pages/EmailsPage.jsx`), linked from
  the sidebar under System.

## 11. Recommended next steps

- Wire the `unexpected_egg_laying` template to the actual "eggs recorded after project closure"
  event (the `Pairing.completionReason`/`workflowStatus`/`completedAt` fields added in
  `20260715180000_add_breeding_project_completion` are the right anchor — this file's ingestion
  loop already has `clutch`/`pairingRow` in scope at the right point).
- Add a "resend invitation" admin action that reuses `invitationIdempotencyKey` so an authorized
  resend never creates a second active invite email.
- Have the breeder frontend read `?focusPairing=`/`?focusAnimal=` on load to actually jump to the
  linked record (currently a no-op deep link, see §9).
- Consider sourcing the expected-egg-laying window from the personal/collection-informed
  prediction (`buildPredictions`) instead of the species-default window, now that the wiring proves
  the architecture — would need `syncExpectedEggLayingReminder` to receive the already-computed
  analytics rather than recomputing from defaults.
