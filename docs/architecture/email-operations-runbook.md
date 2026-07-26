# Email System — Operations Runbook

Companion to [email-notifications.md](./email-notifications.md) (architecture/design) and
[account-lifecycle.md](./account-lifecycle.md) (the registration/verification/password-recovery
feature built on top of this system). This doc is the how-to: account setup, DNS, environment
configuration per stage, key rotation, and troubleshooting. Nothing in this file is a substitute for
reading the architecture doc first.

Everything below already applies unchanged to the five account-lifecycle templates
(`account_email_verification`, `account_password_reset`, `account_password_changed`,
`account_verify_new_email`, `account_email_changed`) — they use the same Resend account, DNS,
worker, retry, and suppression behavior as every other template. No new operator setup was
introduced by that feature.

## 1. Resend account setup (one-time, done by the repository owner)

1. Create or access the Resend account at resend.com.
2. Add your production sending domain, or better, a **dedicated subdomain** for transactional mail
   (e.g. `mail.yourdomain.com` rather than `yourdomain.com`) — this isolates your app's sender
   reputation from any other mail (marketing, personal) sent from the root domain.
3. Add the SPF record Resend gives you for that (sub)domain.
4. Add the DKIM record(s) Resend gives you.
5. Add a DMARC policy for the (sub)domain (start with `p=none` to monitor, then move to
   `p=quarantine`/`p=reject` once delivery is confirmed clean).
6. Verify the domain in the Resend dashboard — do not proceed to production sending until this
   shows verified.
7. Create three separate API keys:
   - A **development** key (safe to use with `EMAIL_ENABLED=false` locally — or not used at all,
     since the mock provider needs no key).
   - A **staging** key.
   - A **restricted production sending key** (sending-only permission, not full account access).
8. Register the webhook endpoint in the Resend dashboard: `https://<your-api-host>/api/webhooks/resend`.
9. Copy the webhook **signing secret** Resend shows you — this is `RESEND_WEBHOOK_SECRET`, not the
   API key.

None of the above can be completed by an AI agent working in this repository — they require access
to Resend's dashboard and your DNS provider. Nothing in this checklist should be marked done
without someone actually having performed it and observed the result (e.g. Resend showing the
domain as verified).

## 2. Environment configuration per stage

All variables are server-only (`breeding-app-backend`), never exposed to a frontend build. See
`.env.example` in that package for the full list with comments.

| Variable | Local dev / test | Staging | Production |
|---|---|---|---|
| `EMAIL_ENABLED` | `false` | `true` | `true` |
| `EMAIL_PROVIDER` | `resend` (unused while disabled) | `resend` | `resend` |
| `RESEND_API_KEY` | unset | staging key | restricted production key |
| `RESEND_WEBHOOK_SECRET` | unset | staging webhook secret | production webhook secret |
| `EMAIL_FROM_ADDRESS` | n/a | `notifications@mail-staging.serpentora.com` (or a Resend test address) | `notifications@serpentora.com` |
| `PUBLIC_APP_URL` | `http://localhost:5173` | staging frontend URL | production frontend URL |

With `EMAIL_ENABLED=false`, every code path uses `MockEmailProvider` regardless of what
`EMAIL_PROVIDER` is set to — this is what local development and the automated test suite rely on.
No real network call to Resend ever happens in that mode.

If `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=resend` but `RESEND_API_KEY`, `EMAIL_FROM_NAME`, or
`EMAIL_FROM_ADDRESS` are missing, the backend **fails to start** (`src/config/env.ts`) rather than
silently falling back to a broken send path.

## 3. Local development with the mock provider

No setup needed — this is the default. `MockEmailProvider` (`src/email/providers/mockProvider.ts`)
records every "sent" message in memory (`provider.sent`) and never touches the network. Tests use
the same provider and assert against `provider.sent`.

To exercise the worker loop locally without a real Resend account, leave `EMAIL_ENABLED=false` and
trigger one of the two wired flows (create a team user via the admin panel, or sync a breeder
snapshot with a newly-observed ovulation date) — a row appears in `email_jobs` and the worker picks
it up on its next poll tick (`EMAIL_WORKER_POLL_INTERVAL_MS`, default 15s).

## 4. How retries work

- Retryable provider failures (rate limit, transient 5xx, network error) reschedule the job with
  exponential backoff: `30s * 3^(attempt-1)`, capped at 1 hour.
- Permanent failures (invalid recipient, validation error, bad API key) go straight to `failed` —
  no retry, since retrying won't change the outcome.
- Once `attempt_count` reaches `maximum_attempts` (default 5), the job is `failed` regardless of
  error type.
- A job stuck in `processing` for longer than `EMAIL_WORKER_STUCK_JOB_MINUTES` (default 10) — e.g.
  the worker process crashed mid-send — is automatically recovered: back to `pending` if attempts
  remain, or `failed` if exhausted.

## 5. How suppression works

An address is suppressed automatically when Resend reports a hard bounce or spam complaint via the
webhook (`src/email/webhookService.ts`). Suppressed addresses are skipped for every category except
`account_and_security` (required/security mail is never silently dropped). Suppression is **not**
automatically lifted — an administrator must review and release it explicitly via
`POST /api/admin/email-suppressions/:email/release` (or the Emails page in the admin app), and must
supply a reason, which is written to the admin audit log.

## 6. How to add a new template

1. Add `src/email/templates/yourTemplate.ts` exporting a `render...Template(props)` function
   returning `{ subject, html, text }`, plus `YOUR_TEMPLATE_KEY` and `YOUR_TEMPLATE_VERSION = 1`
   constants. Use `renderLayout`/`renderPlainText` from `layout.ts` and `escapeHtml` for any
   user-supplied string.
2. Register it in `templates/index.ts`'s `TEMPLATES` map.
3. Call `enqueueEmail({ templateKey, templateVersion, templatePayload, ... })` from wherever the
   triggering domain event lives — never call the template renderer or the provider directly from
   a route handler.
4. If you ever change an existing template's props/output in a way that isn't backward compatible
   with already-queued jobs, bump its `..._VERSION` constant and keep the old version's render
   function around (or accept that in-flight jobs referencing the old version will fail to render
   until reprocessed — decide per situation).

## 7. How to add a new notification category

1. Add the category string to `NOTIFICATION_CATEGORIES` in `src/email/preferencesService.ts`.
2. Add its conservative default to `DEFAULT_ENABLED` in the same file (default **off** for anything
   marketing/digest-like; default **on** for anything operationally useful to the user).
3. If the category must never be user-disabled (rare — only account/security-critical mail
   qualifies), add it to `REQUIRED_CATEGORIES` instead, and the worker will bypass both the
   preference and suppression checks for it.

## 8. How to connect another breeding/incubation event

Follow the pattern in `reproductiveCycleService.ts#syncExpectedEggLayingReminder`:

1. Find the concrete mutation point where the relevant date/state is actually written (not a
   read-only prediction endpoint — those have no "something changed" hook).
2. Build a stable idempotency key from a durable ID that doesn't change across re-syncs
   (`breedingReminderIdempotencyKey(entityId, reminderType)` or similar).
3. On each write: if the relevant date is unchanged, no-op; if changed, cancel the previous job
   (`cancelByIdempotencyKey`) and enqueue a replacement; if cleared, cancel only.
4. Reuse whatever calculation already produces the display date — do not reimplement the
   species/interval math in the email-triggering code.
5. Add a unit test mirroring `breedingReminderIntegration.test.ts`.

## 9. Troubleshooting failed or bounced emails

- **Nothing is being sent at all**: check `EMAIL_ENABLED=true` and that the backend didn't fail to
  start (check startup logs for the "missing required email environment variable" error). Check
  `EMAIL_WORKER_ENABLED` is not `false`.
- **Jobs stay `pending` forever**: the worker poll loop may not have started — check for
  `"[email-worker] started"` in startup logs. Confirm the process wasn't restarted mid-flight
  without the worker being re-initialized.
- **A specific job is `failed`**: check `last_error_code` / `last_error_message` on the
  `email_jobs` row (visible in the admin Emails page) — this distinguishes a Resend-side rejection
  from a local rendering failure.
- **A recipient stopped receiving mail**: check `email_suppressions` for that address — if
  present and not released, that's expected (see §5).
- **Webhook events aren't updating status**: check that the webhook is actually registered in
  Resend pointing at the correct deployed URL, and that `RESEND_WEBHOOK_SECRET` matches what Resend
  shows for that endpoint. A signature mismatch is logged (without the secret value) as
  `"[email-webhook] signature verification failed"`.
- **A webhook came in but nothing changed**: if the `email_id` in the payload doesn't match any
  stored `provider_message_id`, the event is intentionally ignored (`ignored_unknown_message_id`) —
  this is correct behavior for events about emails this system didn't send, not a bug.

## 10. Key rotation

**Rotating the Resend API key:**
1. Create a new key in the Resend dashboard (don't delete the old one yet).
2. Update `RESEND_API_KEY` in the deployment environment and redeploy/restart the backend.
3. Confirm a test send succeeds (trigger one of the wired flows, or use the admin "send email"
   action, and check the job reaches `provider_accepted`).
4. Delete the old key in the Resend dashboard.

**Rotating the webhook signing secret:**
1. In the Resend dashboard, roll the signing secret for the webhook endpoint.
2. Update `RESEND_WEBHOOK_SECRET` in the deployment environment and redeploy/restart.
3. Send a test webhook event (Resend's dashboard usually offers a "send test event" action) and
   confirm it returns `200` and `{ outcome: "applied" | "duplicate" }` rather than `401`.

Neither secret is ever logged, and neither is stored in the database — both are read from the
process environment only.

## 11. Manual operator checklist

```text
[ ] Create or access the Resend account
[ ] Add the production sending domain or subdomain
[ ] Add SPF records
[ ] Add DKIM records
[ ] Add a DMARC policy
[ ] Verify the domain in Resend
[ ] Create a development API key
[ ] Create a staging API key
[ ] Create a restricted production sending key
[ ] Add server-side secrets to deployment (Railway env vars for breeding-app-backend)
[ ] Register the webhook endpoint in Resend (https://<api-host>/api/webhooks/resend)
[ ] Add the webhook signing secret
[ ] Send a test email to an approved address
[ ] Verify delivery event processing (email_jobs.status reaches "delivered")
[ ] Verify bounce processing (send to Resend's bounce test address, confirm suppression)
[ ] Confirm the production sender address
```

None of these have been performed as part of this repository change — they all require live
access to Resend, DNS, and the production deployment, which this session did not have.
