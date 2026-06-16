# First Frontend E2E Start Report

Date: 2026-05-17
Scope: Step 64

## Result

No frontend E2E runtime was started in this pass.

## Reason

The backend could not be started against a confirmed database because no local/staging `DATABASE_URL` is configured.

## Recommended First Frontend

Use `breeding-app-lab` for catalog/pricing verification, or `breeding-app-breeder` if the breeder workflow is the preferred first user path.

## Command After Backend Is Running

```powershell
npm.cmd --prefix breeding-app-lab run dev
```

or:

```powershell
npm.cmd --prefix breeding-app-breeder run dev
```

## Required Env

```env
VITE_API_URL=http://127.0.0.1:4000/api
```

