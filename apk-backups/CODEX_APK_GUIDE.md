# APK Build Guide for Codex

## Current release APK

`apk-backups/app-release-2026-07-04-encoding-fixed.apk`

This is the canonical release build. Always update **this file** after each new build.

## How to build a new APK

```powershell
npm run android:release:apk
```

This runs `scripts/android-build.ps1 -Environment production -Artifact apk -BuildType release`, which:
1. Runs `vite build --mode android-production` (bundles web assets)
2. Runs `npx cap sync android` (copies web assets into the Android project)
3. Runs Gradle to produce `android/app/build/outputs/apk/release/app-release.apk`

## After each build

1. Copy the new APK here with a dated name:
   ```
   apk-backups/app-release-YYYY-MM-DD-<feature>.apk
   ```
2. Delete the previous APK from this folder.
3. Keep only the most recent APK in `apk-backups/`.

## Source files that affect the APK

- `src/features/mobile/MobileApp.jsx` — main mobile UI
- `src/AuthShell.jsx` — provider wrappers for native Android shell
- `src/App.css` — shared styles
- `capacitor.config.ts` — Capacitor configuration
- `android/` — native Android project (do not edit manually)
