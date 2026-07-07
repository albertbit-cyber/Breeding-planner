# Shared APK Workspace Guide

Canonical APK folder for both Codex and Claude:

`apk-backups/`

Do not use `dist/android/app-release.apk` or `android/app/build/outputs/apk/release/app-release.apk` as the handoff artifact. Those files are overwritten by every Android build. After every APK build, copy the produced APK into `apk-backups/` with a dated, descriptive filename.

## Current Latest APK

`apk-backups/app-release-2026-07-07-mobile-full-redesign.apk`

SHA256:

`1D54F0B5EB0D2C039EEEEB044A2EB8BC1D01C869C8D312CB803E38441839CAB6`

Built from the July 7, 2026 release APK after the mobile full-version redesign. The same binary also exists at:

- `apk-backups/app-release-2026-07-07-mobile-full-redesign.apk`

As of July 7, 2026, `apk-backups/` is the only folder that should keep APK files. Generated APK outputs under `dist/android/`, `android/app/build/outputs/apk/`, or cache folders must be treated as temporary build output and removed after their hashes are verified against the named copy in `apk-backups/`.

## Naming Rule

Always name APK handoff files with the build type, date, and short change summary:

`app-release-YYYY-MM-DD-short-change-name.apk`

`app-debug-YYYY-MM-DD-short-change-name.apk`

Use lowercase kebab case for the change name. Examples:

- `app-release-2026-07-05-cloud-sync-convergence.apk`
- `app-release-2026-07-04-encoding-fixed.apk`
- `app-debug-2026-07-03-debug-build.apk`

## Required Change Log Rule

Codex and Claude must both log every APK edit, rebuild, replacement, or handoff in `apk-backups/APK_CHANGELOG.md`.

Each log entry must include:

- Date and time in Europe/Berlin local time, including UTC offset.
- Agent name: `Codex`, `Claude`, or both if both worked on the APK.
- APK filename.
- Build type: release, debug, or AAB-related work.
- Short summary of the changes included in the APK.
- SHA256 hash when an APK file is created or replaced.
- Verification performed, or `Not run` with the reason.

Do this before telling the user which APK to install.

## Build Commands

Release APK:

```powershell
npm.cmd run android:release:apk
```

Debug APK:

```powershell
npm.cmd run android:debug
```

Release AAB:

```powershell
npm.cmd run android:release:aab
```

The release APK command runs:

1. `vite build --mode android-production`
2. `npx cap sync android`
3. Gradle `assembleRelease`
4. Copies the release artifact to `dist/android/app-release.apk`

## After Each APK Build

1. Copy the generated APK into `apk-backups/`.
2. Use the naming rule above with the date and the work summary.
3. Update `apk-backups/APK_CHANGELOG.md` with the date, time, agent, APK filename, changes, hash, and verification.
4. Update `apk-backups/CLAUDE_APK_HANDOFF.md`.
5. Record the SHA256 hash:

```powershell
Get-FileHash apk-backups\*.apk -Algorithm SHA256
```

6. Verify the generated APK output hash matches the named `apk-backups/` file.
7. Remove duplicate APK files from generated output or cache folders so `apk-backups/` remains the single APK location.
8. Keep all distinct APKs in `apk-backups/` unless the user explicitly asks to delete old builds.

## Files That Commonly Affect APK Behavior

- `src/features/mobile/MobileApp.jsx`
- `src/App.jsx`
- `src/AuthShell.jsx`
- `src/App.css`
- `capacitor.config.ts`
- `.env.android-production`
- `.env.android-staging`
- `.env.android-development`
- `android/`
- `scripts/android-build.ps1`
