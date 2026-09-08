# Runbook: "the confirmation email never arrived"

Covers account verification, password reset, email-change confirmation, and
every other message that goes through the transactional queue.

The fast path is the **Mail delivery** panel at the top of the admin app's
**Emails** page (`/admin/emails`). It reads the configuration the running
backend actually loaded — not what the deploy is assumed to have set — and
states in one sentence whether mail will be delivered right now.

---

## 1. Read the verdict

`GET /api/admin/email-diagnostics` (admin only), or just open `/admin/emails`.

| Verdict | Meaning |
| --- | --- |
| `Mail is configured (resend) and the worker is running.` | Delivery works. Skip to §4 — this is a spam-placement or bounce problem. |
| `Mail will NOT be delivered: …` | A blocking misconfiguration. The panel names it and the fix. |

Every problem carries a stable `code`. The blocking ones:

| Code | Cause | Fix |
| --- | --- | --- |
| `transport_unconfigured` | `EMAIL_ENABLED` is not `"true"`, or the provider's variables are missing. The mock transport accepts mail and discards it. | §2 |
| `worker_disabled` | `EMAIL_WORKER_ENABLED=false`. Mail is queued but nothing drains the queue. | Remove the variable (it defaults to true) and redeploy. |
| `worker_not_ticking` | The worker never started, or its poll loop has stalled. | Restart the service; check the boot log for `[email-worker] tick failed`. |
| `worker_tick_failing` | The poll loop is throwing — nearly always database connectivity. | Check `DATABASE_URL` and that migrations ran. |
| `public_app_url_unset` / `public_app_url_local` | Mail is delivered but the link inside points nowhere the recipient can reach. | Set `PUBLIC_APP_URL` to `https://serpentora.com`. |

Warnings worth acting on:

- `from_domain_mismatch` — mail is sent from a domain unrelated to the app host.
  If that domain is not verified with the provider, **every send to anyone but
  the provider account owner is rejected**. This is the exact shape of "it works
  when I test it, but real signups get nothing".
- `recent_failures` — read `lastErrorMessage`; it carries the provider's own
  rejection text verbatim.
- `queue_backlog` — mail is being queued and never sent. Fix the blocking
  problem above, then retry the stuck jobs from the same page.

## 2. Required production variables

Set on the **backend** service (Railway), then redeploy:

```
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=<key from the Resend dashboard>
EMAIL_FROM_NAME=Serpentora
EMAIL_FROM_ADDRESS=notifications@serpentora.com   # must be on a VERIFIED domain
EMAIL_REPLY_TO=support@serpentora.com
PUBLIC_APP_URL=https://serpentora.com             # host used in every emailed link
EMAIL_WORKER_ENABLED=true
```

`EMAIL_ENABLED` defaults to **false**. A deploy that never sets it boots
happily, queues every message, marks each one sent, and delivers nothing. The
boot log says so — `[mail] NO TRANSPORT CONFIGURED` — and the diagnostics panel
now says so too.

`PUBLIC_APP_URL` falls back to the first entry of `CORS_ORIGIN` when unset,
which in a typical config is a `localhost` dev origin. That produces mail that
arrives with an unclickable link.

## 3. Prove delivery end to end

From the diagnostics panel, **Send test** posts to
`POST /api/admin/email-test-send`. It bypasses the queue and hands back the
provider's own response synchronously — which is the point: a queued send
records its failure on a job row and returns success to the caller, so it tells
an operator nothing.

Send it to an address **on a different mail provider than your own**. An
unverified sending domain delivers fine to the provider account owner and is
rejected for everyone else, so testing against your own inbox is exactly the
test that cannot detect the most common cause.

The result includes an `interpretation` field naming the next action.

## 4. Delivered but not received

If the transport is healthy and the provider accepted the message:

1. Check the recipient's spam folder.
2. Check the provider's own delivery log for a bounce or block.
3. Check the **Suppressions** list on `/admin/emails` — a previously bounced or
   complained address is suppressed and later mail to it is skipped. Release it
   there if the address is known good.
4. Confirm SPF, DKIM and DMARC are green for the sending domain. Account mail
   from a domain without them lands in spam at Gmail and Outlook regardless of
   what the provider reports.

## 5. Recovering affected users

Anyone who registered while mail was broken has an account but no verification
link. They do not need to re-register — re-registering is refused as a duplicate.
Either:

- point them at **Resend verification email** on the sign-in screen, or
- from `/admin/users/:id`, use **Resend verification** (an admin-triggered
  re-send against the existing account).

Registration itself no longer fails when the queue does: the account is created,
the response reports `verificationEmailQueued: false`, and the signup screen
tells the user the link could not be sent and offers the resend action instead
of pointing them at an inbox that will stay empty.
