# Account Email & Password Recovery Lifecycle

Added 2026-07-23. Companion to [email-notifications.md](./email-notifications.md) (the queue/
provider/template system this feature is built entirely on top of). This doc covers the
authentication-adjacent lifecycle: registration, email verification, forgot/reset password,
authenticated password/email change, and how invited (staff) users and pre-existing accounts fit
into it.

## 1. Baseline before this change

`breeding-app-backend` already had a working (if inconsistent) auth system before this feature:

- Express + Prisma + Zod, JWT access/refresh tokens (`src/utils/jwt.ts`), `bcryptjs` password
  hashing (cost 12), a `RefreshSession` table for server-tracked session revocation, and a
  `SecurityEvent` audit log (`src/services/securityEventService.ts`).
- `User.emailVerified: Boolean` already existed but nothing ever set it for self-registered users —
  verification used a **stateless JWT** (`signEmailVerificationToken`), and only the *admin invite*
  flow ever issued one.
- `requestPasswordReset`/`resetPassword` already worked end-to-end, but via a **legacy** inline
  `sendEmail()` (webhook-or-console-dry-run, not the Resend queue) and a single reusable
  `User.passwordResetToken`/`passwordResetExpiry` column pair.
- A **broken, orphaned** `POST /auth/recover-password` route: the admin frontend and a backend test
  expected an email+full-name-match password reset with no token or email at all. The route was
  never implemented in `authRoutes.ts`. This has been **retired** (not implemented) — see §9.

## 2. Architecture

```
Registration ──► issue verify_email AccountToken ──► enqueueEmail(account_email_verification)
                                                              │
Login (always succeeds; emailVerified is reported, not enforced, at the JWT/session layer)
                                                              │
GET/POST /auth/verify-email?token= ──► consumeToken(verify_email) ──► User.emailVerified = true

Forgot password ──► issue reset_password AccountToken ──► enqueueEmail(account_password_reset)
POST /auth/reset-password ──► consumeToken(reset_password) ──► new password + revoke sessions
                                                              └► enqueueEmail(account_password_changed)

PATCH /auth/me/email ──► User.pendingEmail set ──► issue verify_new_email AccountToken
                                                          └► enqueueEmail(account_verify_new_email, to NEW address)
GET/POST /auth/confirm-email-change?token= ──► consumeToken(verify_new_email)
                                                     ──► User.email = pendingEmail, emailVerified = true
                                                     └► enqueueEmail(account_email_changed, to OLD address)
```

Every email in this feature is queued through the **existing** `enqueueEmail`/worker/provider
system (see email-notifications.md) under the `account_and_security` category — the one
non-disableable category. Nothing here calls Resend, the mock provider, or a template renderer
directly; nothing sends inline during an HTTP request.

## 3. The `AccountToken` model

`prisma/migrations/20260722100000_add_account_tokens/migration.sql`. Replaces both the stateless
JWT verification token and the single-column password-reset token with one dedicated, purpose-typed
table:

```prisma
model AccountToken {
  id           String    @id @default(cuid())
  userId       String
  purpose      String    // "verify_email" | "reset_password" | "verify_new_email"
  tokenHash    String    @unique   // sha256(rawToken) — the raw token is never stored
  emailAddress String              // the email this token is scoped to
  expiresAt    DateTime
  consumedAt   DateTime?
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())
  createdBy    String    @default("self")   // "self" | "admin:<adminUserId>"
  @@index([userId, purpose])
}
```

`src/services/accountTokenService.ts`:

- **`issueToken(userId, purpose, emailAddress, ttlMs, createdBy)`** — generates
  `crypto.randomBytes(32).toString("hex")`, hashes it with sha256, and in a single
  `prisma.$transaction` first revokes every still-active token of the same `(userId, purpose)`
  before inserting the new row. This is what makes "new token issuance supersedes prior tokens"
  atomic rather than a separate read-then-write.
- **`consumeToken(rawToken, purpose)`** — hashes the input and does a single
  `updateMany({ where: { tokenHash, purpose, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })`.
  Only when exactly one row matches does the token count as validly consumed — this is the atomic,
  single-use guarantee (two concurrent requests with the same raw token can never both succeed).
  On a non-match, a **separate, read-only** lookup (by `tokenHash` + `purpose` alone) determines
  which specific failure to report (`expired`, `already_consumed`, `revoked`, or `invalid`) without
  weakening the atomicity of the success path.
- **`revokeAllForPurpose(userId, purpose)`** — used when a proactive password change should
  invalidate any outstanding reset-password link, or when an email-change is superseded.

TTLs: `verify_email` and `verify_new_email` 48 hours; `reset_password` 1 hour.

The old `User.passwordResetToken`/`passwordResetExpiry` columns are **kept in the schema but no
longer written** (see the comment in `schema.prisma`) — removing them wasn't necessary and this
avoids an unnecessary destructive migration.

## 4. Registration and verification

`registerUser` (`authService.ts`): creates the user (`emailVerified: false` by schema default),
then issues a `verify_email` token and queues `account_email_verification` to the new address.
Duplicate-email handling:

- Existing **verified** account with that email → `409 Email already exists.` (unchanged).
- Existing **unverified** account with that email → re-issues a fresh verification token/email
  (superseding any prior one) and returns `409` with a message pointing the user at their inbox,
  rather than silently creating a second account or silently re-sending nothing.

`verifyEmailForUser(rawToken)` consumes the token and sets `emailVerified: true`,
`emailVerifiedAt: now()`. Clicking an already-consumed link is **not** an error — it returns
`{ alreadyVerified: true, message: "Email already verified." }` with a `200`, matching the
"idempotent from the user's perspective" requirement.

`resendVerificationEmail(email)` (self-service, `POST /auth/resend-verification`, rate-limited via
`authVerificationLimiter`) always returns the same generic message
(`"If that email is registered and unverified, a new verification link has been sent."`) regardless
of whether the address exists, is already verified, or belongs to an inactive account — no
enumeration. It only actually issues a token and enqueues an email when the account exists and is
unverified.

## 5. Forgot / reset password

`requestPasswordReset(email)` (`POST /auth/forgot-password`, existing `authRecoveryLimiter`) always
returns the same generic message
(`"If that email is registered, a reset link has been sent."`) regardless of account
existence/verification/active state — this was already the behavior before this change; only the
token mechanism and the email path changed (now `AccountToken` + `enqueueEmail`, previously
`User.passwordResetToken` + legacy `sendEmail`). Link base URL now consistently uses
`env.publicAppUrl` (`PUBLIC_APP_URL`), fixing a pre-existing inconsistency where this one code path
read a separate, undocumented `process.env.APP_URL`.

`resetPassword({ token, newPassword })` (`POST /auth/reset-password`): consumes the `reset_password`
token, hashes and stores the new password, sets `passwordChangedAt`, calls the **existing**
`revokeRefreshSessionsForUser` (logs out every other session — this call already existed and is
unchanged), and queues `account_password_changed` to the user's email. Distinct `400` messages for
expired / already-used / revoked / invalid tokens; a second submission of the same token naturally
resolves to "already used."

## 6. Authenticated password change

`changePasswordForUser` (`PATCH /auth/me/password`, unchanged route): verifies the current
password, updates the hash, sets `passwordChangedAt`, revokes refresh sessions (existing behavior),
**additionally now** revokes any outstanding `reset_password` token
(`revokeAllForPurpose(userId, "reset_password")` — a stale emailed reset link shouldn't remain
usable after the user proactively changed their password through the app), and queues
`account_password_changed`.

## 7. Authenticated email change (two-step, request + confirm)

`changeEmailForUser` (`PATCH /auth/me/email`, same route, **changed semantics**): previously flipped
`User.email` immediately and reset `emailVerified: false`. Now:

1. Verifies the current password, validates the new address isn't taken, and rejects a request to
   change to the address that's already current.
2. Sets `User.pendingEmail` + `pendingEmailRequestedAt` — **`User.email` is untouched**, so the old
   address keeps working for login throughout.
3. Issues a `verify_new_email` token scoped to the **new** address and queues
   `account_verify_new_email` to that new address.

`confirmEmailChange(rawToken)` (`GET`/`POST /auth/confirm-email-change`, new route, public — the
token itself is the credential): consumes the token, re-checks the new address is still unique
(handles the race where someone else claimed it in the meantime — clears `pendingEmail` on that
failure so the user can retry with a different address), then moves `pendingEmail` → `email`, sets
`emailVerified: true`, clears the pending fields, revokes any other `verify_new_email` tokens, and
queues `account_email_changed` to the **old** address (captured before the overwrite) as a security
notice. The frontend never displays the full new address in that old-address notice context beyond
what the template itself includes (masked via the shared `maskEmail` util,
`src/utils/maskEmail.ts` — the same helper `emailHistoryService.ts` already used, now shared instead
of duplicated).

## 8. Session behavior

No new session system — reuses the existing `RefreshSession` table and
`revokeRefreshSessionsForUser`/`rotateRefreshSession` (`refreshTokenSessionService.ts`) exactly as
before:

- Password reset (forgot-password flow) → revokes all refresh sessions (already did this).
- Authenticated password change → revokes all refresh sessions (already did this).
- Email change → does **not** revoke sessions (the account holder is already authenticated and
  performing the change themselves; the old email's continued validity until confirmation means
  there's no credential compromise to react to the way there is for a password change).
- The access JWT payload was **not** changed to carry `emailVerified` — it's checked via a fresh DB
  read wherever it matters (`GET /auth/me`, `requireVerifiedEmail` middleware), keeping the token
  payload minimal and avoiding a second place that can go stale relative to the database.

## 9. Verification-gating policy (login enforcement)

Login (`loginUser`) is **unchanged in its token issuance** — an unverified user can still obtain a
normal access/refresh token pair. This was a deliberate choice (confirmed during planning) over
blocking login outright, for two reasons: (1) it requires no new backend session/partial-auth
architecture, and (2) the user still needs *some* authenticated capability (view their masked
email, request a resend, sign out) which a hard login block would complicate.

Enforcement instead happens at two levels:

1. **Frontend gate** — `publicUser()` (both `authService.ts`'s DTO and the admin-service DTO) now
   includes `emailVerified`. Both `breeding-app-breeder` and `breeding-app-admin`'s `AuthGate.jsx`
   check `profile.emailVerified === false` after login/registration and render a blocking
   "verify your email" card (with a resend action and sign-out) instead of the normal app — see
   §10.
2. **Backend allowlist** — a new `requireVerifiedEmail` middleware (`src/middleware/auth.ts`,
   applied after `requireAuth`) does a DB read of `emailVerified` and returns `403` if false. It is
   applied to exactly two routes, chosen as the clearest "sensitive write" actions in this
   single-tenant app: `PUT /api/listings/me` (marketplace listing creation/update) and
   `POST /api/lab/orders` (lab test order creation). It is **not** applied broadly — most read
   routes and most of the app are unaffected, by design (see the confirmed plan decision).

## 10. Frontend implementation

Scope (confirmed decision): `breeding-app-breeder` (primary public-registration surface) and
`breeding-app-admin` (staff surface, and the one with the broken recovery flow to fix).
`breeding-app-lab` and `breeding-app-marketplace` keep their own separate, duplicated
`AuthGate.jsx`/`apiClient.ts` copies untouched — **explicitly deferred**, see §13.

Both `AuthGate.jsx` files (there is no shared router in either app; `AuthGate` renders as an
overlay/blur over `children`, not a route) gained:

- A `linkFlow` parser that reads `window.location.pathname` + `?token=` once on mount for three
  plain (non-hash) paths the email templates link to: `/verify-email`, `/reset-password`,
  `/confirm-email-change`. The token is stripped from the URL immediately via
  `history.replaceState` so it can't be resubmitted on refresh or leak via referrer.
  - `/verify-email` and `/confirm-email-change` auto-call their API on mount and show a
    success/error result card.
  - `/reset-password` shows a new-password form and calls `resetPassword({ token, newPassword })`.
- A "Resend verification email" mini-flow (email-only form, generic sent-confirmation message),
  reachable both as a link under the login form and from the unverified-gate card.
- An unverified-gate card, shown instead of the app whenever
  `authState.profile?.emailVerified === false`, with a masked email address, a resend action, and
  sign-out.
- `apiClient.ts` gained `verifyEmail`, `resendVerification`, `confirmEmailChange` (all
  `requiresAuth: false`, same pattern as the existing `forgotPassword`).

The breeder app's existing "My Account" tab (`App.jsx`, the `setupTab === 'account'` block) already
had inline change-email/change-password mini-forms; it now also shows the verified/unverified badge
and, when `pendingEmail` is set, a "pending confirmation for `<address>`" notice. No new page was
needed there since the backend response messages (`"Check your new email address..."`, etc.) are
already surfaced dynamically through the existing success/error state.

The admin app's `TeamPage.jsx` ("Team & Account") gained the same pending-email row and short notes
under its existing change-email/change-password forms.

## 11. Invited (staff) user compatibility

`adminService.createAdminUser` (admin/moderator/support/lab account creation — the "organization
invitation" analogue, see email-notifications.md §2) is unchanged in shape: still creates the user
with `emailVerified: false`, still returns the temporary password only to the inviting admin (never
emailed), still queues the `team_invitation` email. Only its verification-link generation changed —
it now calls `accountTokenService.issueToken(..., createdBy: "admin:<actorId>")` instead of signing
a JWT, and builds the link from `env.publicAppUrl` consistently (previously it read a separate
`PUBLIC_APP_URL || ADMIN_APP_URL || CORS_ORIGIN` / API-URL cascade that pointed at the backend API
directly rather than the frontend page).

`resendUserEmailVerification` (the existing *admin-triggered* resend for another user, distinct
from the new *self-service* resend) was migrated the same way — off the legacy inline `sendEmail`
onto `enqueueEmail` + the new `account_email_verification` template — and now short-circuits with a
`400` if the target user is already verified.

**Deliberate non-change, stated explicitly:** invited users are **not** forced through a "must set a
new password" flow, and the temporary password remains the mechanism (unchanged from before this
feature). This was an open choice in the spec, not a requirement — the existing invite UX (admin
sees the temp password, shares it out-of-band, invitee verifies email via the link) already
converges cleanly with the new lifecycle once the shared `AccountToken`/queue mechanism is in place;
adding a forced first-login password reset would be a larger, separate UX change.

## 12. Existing-user migration / compatibility policy

Existing accounts (created before migration `20260722100000_add_account_tokens`) predate any real
verification flow — `emailVerified` was always `false` and dormant. Retroactively requiring
verification from them would lock out every current user. The migration's data step:

```sql
UPDATE "User" SET "emailVerified" = true, "emailVerifiedAt" = now() WHERE "emailVerified" = false;
```

grandfathers every pre-existing row as verified, uniformly for self-registered and admin-invited
accounts alike — this migration doesn't attempt to distinguish the two, since neither ever went
through a real verification flow. **Only accounts created after this migration ran** (new public
registrations, new admin invites) start at `emailVerified = false` and go through the real flow.
Confirmed by a dedicated login test (`auth.test.ts`, "still allows an unverified account to log in
...") that login never hard-requires `emailVerified` — matching the frontend-gate-only enforcement
decision in §9.

## 13. Explicitly deferred / out of scope

- `breeding-app-lab` and `breeding-app-marketplace` frontends — same duplicated `AuthGate.jsx`/
  `apiClient.ts` pattern as breeder/admin, not yet given the new pages. The backend already
  supports them (same routes, same DTO fields) — this is a frontend-only follow-up.
- Any configurable, user-facing notification-preference UI beyond what already existed
  (`account_and_security` remains the only non-disableable category; nothing here changes the
  breeding/incubation/digest/marketing preference system).
- MFA, social login, and account deletion/redesign were explicitly out of scope for this task and
  were not touched.

## 14. Troubleshooting

- **"This link is invalid or has expired"** on a verify/reset/confirm link — check
  `account_tokens.expires_at` vs now, and whether `consumed_at`/`revoked_at` is already set for that
  row (a newer request for the same purpose auto-revokes the old one — see §3).
- **A user reports never receiving the verification/reset email** — check `email_jobs` for a row
  with the matching `related_entity_id` (the user id) and `template_key`; if `status` is
  `suppressed`, the address is on `email_suppressions` (see email-notifications.md §5/§6). This
  system does not bypass suppression for verification/reset mail since they're still
  `account_and_security` category, which bypasses the *preference* check but not suppression — a
  suppressed address is still a real, undeliverable-per-Resend address.
- **Email-change confirmation fails with "no longer available"** — someone else registered/claimed
  that address between the request and the confirmation click; `pendingEmail` is cleared
  automatically so the user can retry with a different address from their account settings.
- **Local/dev testing without a real inbox** — with `EMAIL_ENABLED=false` (the default), the mock
  provider records every send in memory. `AccountToken.tokenHash` is a one-way hash and cannot be
  reversed back to the raw token, so to manually drive a flow in dev, read the queued job's
  `template_payload.actionUrl` (captured by the mock provider before it was hashed) rather than
  trying to recover it from the database.
