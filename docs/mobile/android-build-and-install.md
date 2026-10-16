# Serpentora Android build and install

The Android app is the breeder app itself, `breeding-app-breeder/`, packaged with Capacitor.
Since 12 October 2026 it runs the same `BreedingPlannerApp` as the browser and Electron; the
old separate mobile app (`src/features/mobile/MobileApp.jsx`) is gone. Device differences live
in `src/platform/` (file save via share sheet, hardware back, haptics, status bar, splash).

## App identity

- Launcher name: `Serpentora`
- Package: `com.serpentora.mobile`
- `versionCode` and `versionName` derive from `breeding-app-breeder/package.json` at build time
  (`android/variables.gradle`): `0.1.84` → versionName `0.1.84`, versionCode `10084`. The
  pre-commit hook bumps the package version, so every commit can ship as an upgrade.
- Min SDK 24, target and compile SDK 36. Capacitor 8 publishes safe-area insets as
  `--safe-area-inset-*` CSS variables; the header, bottom nav and body padding use them.

## Build

From inside `breeding-app-breeder/`, in PowerShell:

```powershell
$env:JAVA_HOME = "D:\Git Clone\Breeding-planner\.tools\jdk21\jdk-21.0.11+10"
$env:ANDROID_HOME = "D:\Git Clone\Breeding-planner\.tools\android-sdk"
powershell -ExecutionPolicy Bypass -File scripts\android-build.ps1 -Environment staging -Artifact apk -BuildType release
```

- `JAVA_HOME` must point at the repo's JDK 21. The script only falls back to `.tools` when the
  variable is unset, and a machine-wide 32-bit Java 8 breaks Gradle with an object-heap error.
- `-Environment staging` bakes `.env.android-staging` in. Every live Serpentora site reads the
  staging backend and that is where real data lives; production is empty. Build staging unless
  told otherwise.
- The script runs the web build, `npx cap sync android`, then Gradle. A full release build
  takes about ten minutes on the reference machine (R8). Use `-SkipWebBuild -SkipCapSync` to
  rerun only Gradle.
- Release signing needs `android/key.properties` and `android/app/breedingplanner.keystore`,
  both ignored by git. In a worktree, copy them from the main checkout first.
- Output: `dist/android/app-release.apk`. Copy it into `apk-backups/` with the
  `app-release-YYYY-MM-DD-short-change-name.apk` name and log it in
  `apk-backups/APK_CHANGELOG.md` with its SHA256 before handing it over.

## Install

```powershell
adb install -r apk-backups\app-release-<date>-<name>.apk
```

Builds under `com.serpentora.mobile` upgrade each other as long as the versionCode rises.
Builds from before 12 October 2026 used `com.breedingplanner.mobile` and install side by side;
uninstall "Breeding Planner Mobile" once the new one works.

## What the phone does differently

- Backups: Settings → Backups → "Download backup" writes the `.bpbackup` file to the app cache
  and opens the share sheet (Files, Drive, mail). Restore uses the normal file picker.
- Field tab: scan a tag, search, feeds due, recent animals, quick logs with Undo.
- Hardware back closes the top-most sheet or modal, then returns to Field, then backgrounds
  the app.
- Photos use the existing camera-capable file input; no separate photo pipeline.

## Not done yet

- Push notifications: the plugin and permission are present, no Firebase project exists.
- Cloud upload of animal photos: photos sync like on desktop (stripped from the cloud
  snapshot, kept locally and in backups).
- The orphaned root `android/` project is untouched and should not be used.
