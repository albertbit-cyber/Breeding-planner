# GitHub Repository Preparation Report

Date: 2026-05-16
Scope: Step 29 preparation audit for split repositories. No pushes were performed and no source files were changed.

## Summary

The six split repositories have `README.md`, `.env.example`, `package.json`, and root `.gitignore` files. Generated artifacts still need index cleanup before publishing them as standalone GitHub repositories.

## Repository Checklist

| Repository | README | `.gitignore` | `.env.example` | `package.json` | Dev command | Build command | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `breeding-app-shared` | Present | Present | Present | Present | N/A | `npm run build` | Shared package is private and has build/test/typecheck scripts. |
| `breeding-app-backend` | Present | Present | Present | Present | `npm run dev` | `npm run build` | Backend includes Prisma migration scripts and startup commands. |
| `breeding-app-breeder` | Present | Present | Present | Present | `npm run dev` | `npm run build` | Android/Capacitor assets are included. |
| `breeding-app-admin` | Present | Present | Present | Present | `npm run dev` | `npm run build` | Static frontend app. |
| `breeding-app-lab` | Present | Present | Present | Present | `npm run dev` | `npm run build` | Static frontend app with lab role workflows. |
| `breeding-app-marketplace` | Present | Present | Present | Present | `npm run dev` | `npm run build` | Static frontend app. |

## Required Before GitHub Publication

- Decide whether each repository needs a `LICENSE`; none was verified in the split roots during this audit.
- Remove or exclude generated folders before repository initialization if they are not intentionally versioned:
  - `node_modules` exists in all six split folders.
  - `build` exists in frontend split folders.
  - `dist` exists in backend and shared split folders.
- Confirm README deployment notes are sufficient for each hosting target.
- Confirm each `.env.example` matches the final hosted environment variable names.

## Suggested Standard `.gitignore` Coverage

- `.env`
- `.env.*`
- `!.env.example`
- `node_modules/`
- `dist/`
- `build/`
- `coverage/`
- `.vite/`
- `*.log`
- Platform/signing secrets such as `*.keystore`, `*.jks`, and Android key properties where applicable.

## Publication Status

Not ready for GitHub publication until generated artifact policy and index cleanup are handled.
