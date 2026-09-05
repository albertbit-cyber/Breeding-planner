# breeding-app-backend

Prepared shared backend/API split from the combined Breeding Planner repository.

## Contains

- Express backend source in `src/`.
- Prisma schema, migrations, and seed in `prisma/`.
- Backend package metadata copied from `server/`.
- Health checks at `/health`, `/api/health`, and `/api/system/health`.
- Local-only database check at `/api/system/db-check`.
- Auth foundation probes at `/api/auth/foundation/protected`, `/admin-only`, `/breeder-only`, and `/identity`.

## Environment

Create `.env` from `.env.example` and provide:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN` for browser app domains. If this is empty in production, the backend still starts for health checks, but browser requests will not receive CORS headers.
- `PORT`

## Email in local development

By default `EMAIL_ENABLED` is unset, which selects the in-memory **mock**
provider: queued emails are marked sent and discarded, and **nothing is
delivered**. This is intentional for tests, and it is the single most common
reason a verification email "never arrives" locally.

The boot log always states which transport is live:

```
[mail] transport=smtp host=localhost:1025 secure=false from=notifications@serpentora.com configured=true
[mail] NO TRANSPORT CONFIGURED - verification emails will not be sent (...)
```

Every attempted send then logs one structured line with the recipient,
template, outcome (`sent` / `skipped` / `failed`) and either the provider
message id or the full provider error.

### Option 1 — Mailpit (recommended)

A local SMTP catch-all. It accepts every message and forwards none, so you see
the real rendered email with no provider account and no risk of mailing anyone.

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Then in `.env`:

```
EMAIL_ENABLED=true
EMAIL_PROVIDER="smtp"
SMTP_HOST=localhost
SMTP_PORT=1025
PUBLIC_APP_URL="http://localhost:5210"
```

Read the mail at <http://localhost:8025>.

Set `PUBLIC_APP_URL` to whichever port your Vite dev server is on — when it is
unset the backend falls back to the first `CORS_ORIGIN` entry, which silently
produces verification links pointing at the wrong port.

### Option 2 — no transport at all

Leave `EMAIL_ENABLED=false`. Outside production the worker prints the link the
email would have contained:

```
[mail][dev] verification link for you@example.com: http://localhost:5210/verify-email?token=...
```

This is hard-guarded on `NODE_ENV !== "production"`.

### Option 3 — real provider

`EMAIL_PROVIDER="resend"` with `RESEND_API_KEY`, or `EMAIL_PROVIDER="smtp"`
against a real relay. Two things to know:

- **Resend**: until your sending domain is verified, Resend delivers only to
  the address that owns the account; other recipients are rejected outright.
- **Gmail SMTP**: requires a 16-character App Password with 2FA enabled — not
  your account password. Port 587 (`SMTP_SECURE=false`) or 465
  (`SMTP_SECURE=true`).

### Unblocking a local account

If mail is broken and you just need past the verification gate:

```bash
npm run dev:verify-user -- someone@example.com
```

Sets `emailVerified` directly and revokes any outstanding token. CLI only —
there is deliberately no HTTP equivalent — and it refuses to run under
`NODE_ENV=production`.

## Commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
npm run build
npm run start:migrate
npm start
npm test
npm run dev:verify-user -- someone@example.com
```

## Known Cleanup

- Update imports to consume safe pure contracts from `breeding-app-shared`.
- Keep Prisma and secrets backend-only.
- Add deployment-specific CORS origins for the final frontend domains.
- Replace coarse route guards with domain ownership checks before exposing expanded multi-app APIs.
