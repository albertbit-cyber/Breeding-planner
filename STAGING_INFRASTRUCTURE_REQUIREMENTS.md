# Staging Infrastructure Requirements

Date: 2026-05-20

## Backend

- Node runtime compatible with the backend package.
- HTTPS endpoint.
- Environment secret injection.
- Ability to run Prisma migration deploy.

## Database

- Isolated staging PostgreSQL.
- No production data.
- Backup before migrations.

## Frontends

- Staging hosting for breeder app.
- Staging hosting for lab app.
- Explicit staging API URL.

## Storage

- Isolated staging upload storage.
- Write/read permissions for backend only.

## Secrets

- `DATABASE_URL`
- `JWT_SECRET`
- CORS origins
- upload storage configuration if externalized

