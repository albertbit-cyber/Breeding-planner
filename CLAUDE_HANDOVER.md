# Claude Handover - Breeding Planner

Date: 2026-06-29
Repo: `D:\Git Clone\Breeding-planner`
Current branch: `staging/runtime-review-20260521`

## Current Git State

Important committed work is already pushed to origin on:

- `staging/runtime-review-20260521`

Recent pushed commits:

- `91e87ae feat(breeder): show cycle day on pairing cards`
- `f699151 fix(auth): isolate extracted app sessions`

There are uncommitted/untracked local files that were not part of the finished auth fix:

- `.claude/settings.json`
- `.claude/settings.local.json`
- `breeding-app-admin/src/App.css`
- `breeding-app-admin/src/admin/AdminApp.jsx`
- `.tmp-dev-server/`
- `breeding-app-backend/fixPasswords.js`

Do not revert those unless Alberto explicitly asks. Some may be local/user/generated work.

## What Was Done

### 1. Breeder Pairing Cards - Clutch Progression Day

The breeder app now shows the current day number for breeding cycle counters in pairing cards.

Implemented behavior:

- Ovulation counter shows the current day of that stage.
- Pre-lay shed counter shows the current day of that stage.
- Egg laying counter shows the current day of that stage.
- The day label is shown beside the countdown badge in pairing dashboard cards.

Files changed and committed:

- `src/App.jsx`
- `src/App.test.js`
- `breeding-app-breeder/src/App.jsx`

Verification completed:

- `npm.cmd test -- src/App.test.js` passed.
- Root `npm.cmd run build` passed.

Commit:

- `91e87ae feat(breeder): show cycle day on pairing cards`

### 2. Admin/Breeder/Lab/Marketplace Auth Isolation

Problem:

The deployed admin app was sharing authentication behavior with other apps. In the screenshot, the admin Netlify page showed a top-right navigation chip with cross-app buttons:

- `Open Lab App`
- `Marketplace`
- shared signed-in state

It also showed `Admin access required` even though a user was signed in, because the admin app could be mounted while the wrong auth scope/session was active.

Fix implemented:

- Admin app now uses admin auth scope only.
- Breeder, lab, marketplace, and admin auth gates no longer show cross-app navigation buttons.
- Signed-in chips now only show the current signed-in identity and `Sign out`.
- App children are rendered only after the auth overlay is no longer active, avoiding stale role reads during initial auth state setup.

Files changed and committed:

- `breeding-app-admin/src/features/auth/AuthGate.jsx`
- `breeding-app-breeder/src/features/auth/AuthGate.jsx`
- `breeding-app-lab/src/features/auth/AuthGate.jsx`
- `breeding-app-marketplace/src/features/auth/AuthGate.jsx`

Verification completed:

- `npm.cmd run build` in `breeding-app-admin` passed.
- `npm.cmd run build` in `breeding-app-breeder` passed.
- `npm.cmd run build` in `breeding-app-lab` passed.
- `npm.cmd run build` in `breeding-app-marketplace` passed.

Commit:

- `f699151 fix(auth): isolate extracted app sessions`

## Login Information

### Local Admin Login

Local backend was seeded and verified successfully.

Admin credentials:

- Email: `admin@breedingplanner.dev`
- Password: `admin1234`

Local backend health check was verified at:

- `http://127.0.0.1:4000/api/health`

Local admin frontend was previously run at:

- `http://localhost:5176/#/admin`

### Netlify Admin Login

Use the admin Netlify site directly at:

```text
https://YOUR-ADMIN-NETLIFY-SITE.netlify.app/#/admin
```

Then log in with:

```text
Email: admin@breedingplanner.dev
Password: admin1234
```

If login still shows the old shared navigation or `Admin access required`, check these in order:

1. Confirm Netlify deployed commit `f699151`.
2. Confirm Netlify is deploying from the correct branch, likely `staging/runtime-review-20260521` unless the project expects `main`.
3. Confirm the admin Netlify app has `VITE_API_URL` set to the deployed backend `/api` URL.
4. Confirm the deployed backend database has the admin user seeded.
5. Clear site data or open the admin link in a private/incognito Chrome window.

Important: seeding the local database does not seed the deployed backend database.

## Browser Cleanup Without DevTools

If Chrome is holding an old session:

1. Open the admin Netlify page.
2. Click the lock/settings icon next to the address bar.
3. Open `Site settings`.
4. Click `Delete data` or `Clear data`.
5. Reload the admin URL.
6. Log in again.

Using an incognito/private window is the fastest test because it avoids old local storage and cookies.

## What Still Needs To Be Done

### Required Deployment Check

Claude should verify whether Netlify has actually deployed:

- `f699151 fix(auth): isolate extracted app sessions`

If Netlify is watching `main`, this branch push alone will not update the deployed site. In that case, merge or cherry-pick the commit into the branch Netlify deploys from, then push.

### Required Backend Check For Netlify

Claude should verify the deployed backend database contains:

- `admin@breedingplanner.dev`
- role: `admin`
- password matching `admin1234`

The local seed already works, but deployed Netlify login depends on the deployed backend and deployed database.

### Required Chrome Test

In Chrome, test the deployed admin app in a fresh private/incognito window:

1. Open `https://YOUR-ADMIN-NETLIFY-SITE.netlify.app/#/admin`.
2. Log in with `admin@breedingplanner.dev` / `admin1234`.
3. Confirm there are no cross-app navigation buttons in the top-right chip.
4. Confirm the admin panel opens instead of `Admin access required`.

### Optional Cleanup

After verifying everything, consider removing generated/local-only files if Alberto approves:

- `.tmp-dev-server/`
- `breeding-app-backend/fixPasswords.js`

Do not delete anything without explicit approval.

## Useful Commands

Check current branch and working tree:

```powershell
git branch --show-current
git status --short
```

Build admin app:

```powershell
cd breeding-app-admin
npm.cmd run build
```

Build all affected apps from repo root:

```powershell
cd breeding-app-admin
npm.cmd run build
cd ..\breeding-app-breeder
npm.cmd run build
cd ..\breeding-app-lab
npm.cmd run build
cd ..\breeding-app-marketplace
npm.cmd run build
```

Run local backend:

```powershell
cd breeding-app-backend
npm.cmd run dev
```

Run local admin frontend:

```powershell
cd breeding-app-admin
$env:VITE_API_URL="http://127.0.0.1:4000/api"
npm.cmd run dev -- --port 5176 --strictPort
```

## Notes For Claude

- Prefer not to touch unrelated local changes.
- If deployment is needed, first identify which branch Netlify deploys from.
- If backend seeding is needed in production, use the deployed backend/database mechanism, not the local Prisma seed.
- The visible old navigation in Netlify usually means either the latest commit has not deployed, or the browser is still holding old site data.
