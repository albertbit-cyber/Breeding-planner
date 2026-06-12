# Staging Deployment Commands

Date: 2026-05-20

## Status

Commands are templates only. No deployment was performed.

## Backend Template

```powershell
cd breeding-app-backend
npm.cmd run build
npm.cmd run prisma:migrate:deploy
npm.cmd start
```

## Lab Frontend Template

```powershell
cd breeding-app-lab
$env:VITE_API_URL='<https-staging-api>/api'
npm.cmd run build
```

## Breeder Frontend Template

```powershell
cd breeding-app-breeder
$env:VITE_API_URL='<https-staging-api>/api'
npm.cmd run build
```

## Deployment Order

1. Backend.
2. Database migrations.
3. Backend health.
4. Lab frontend.
5. Breeder frontend.
6. Smoke tests.

