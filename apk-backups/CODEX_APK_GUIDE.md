# Shared APK Workspace Guide

Canonical APK folder for both Codex and Claude:

`apk-backups/`

Do not use `dist/android/app-release.apk` or `android/app/build/outputs/apk/release/app-release.apk` as the handoff artifact. Those files are overwritten by every Android build. After every APK build, copy the produced APK into `apk-backups/` with a dated, descriptive filename.

## Current Latest APK

`apk-backups/app-release-2026-07-05-demo-snakes-local-only.apk`

SHA256:

`CCA6FBFE3C9AE317EB472176E70672140F4A6098C61053F49A4FBA7526312C15`

Built from the July 5, 2026 release APK after the demo snakes local-only fix. The same binary also exists at:

- `dist/android/app-release.apk`
- `android/app/build/outputs/apk/release/app-release.apk`

## Naming Rule

Always name APK handoff files with the build type, date, and short change summary:

`app-release-YYYY-MM-DD-short-change-name.apk`

`app-debug-YYYY-MM-DD-short-change-name.apk`

Use lowercase kebab case for the change name. Examples:

- `app-release-2026-07-05-cloud-sync-convergence.apk`
- `app-release-2026-07-04-encoding-fixed.apk`
- `app-debug-2026-07-03-debug-build.apk`

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
3. Update `apk-backups/CLAUDE_APK_HANDOFF.md`.
4. Record the SHA256 hash:

```powershell
Get-FileHash apk-backups\*.apk -Algorithm SHA256
```

5. Keep all distinct APKs unless the user explicitly asks to delete old builds.

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
