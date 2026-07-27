# Claude APK Handoff

This folder is the shared APK workspace for Claude and Codex:

`apk-backups/`

Both agents must use this same folder for APK handoff work so APK files, hashes, and notes stay synchronized.

## Current Status

**IMPORTANT — two separate Android projects (discovered 2026-07-27):** this repo contains two divergent Capacitor Android projects that both use appId `com.breedingplanner.mobile`: the repo-root `android/` (legacy, still named "Breeding Planner Mobile", last touched 2026-07-03, built via `npm run android:release:apk` at repo root) and `breeding-app-breeder/android/` (the actively developed one — matches the real "Serpentora" branding and icons). Because they share an appId, whichever one you build+install last silently replaces the other on-device. Every APK in the inventory below except the 2026-07-27 entry was built from the **root** project. Root's `scripts/android-build.ps1` was never repointed at `breeding-app-breeder/` (known issue, see apk-workflow reference memory) — building `breeding-app-breeder` for real requires running `npm run build` + `npx cap sync android` + `gradlew assembleDebug`/`assembleRelease` directly inside `breeding-app-breeder/` (its copy of `scripts/android-build.ps1` is present but NOT wired up — it still calls nonexistent `build:android:dev/staging/prod` npm scripts and will fail). This should be fixed properly (either repoint root's pipeline at `breeding-app-breeder`, or retire root's `android/` project entirely) rather than worked around indefinitely.

Most recent **breeder** app build overall, and the first one built from the correct (`breeding-app-breeder/`) project:

`app-debug-2026-07-27-serpentora-logo-splash.apk`

Debug build verifying the new Serpentora logo (icons + splash) on-device. Not yet confirmed on a physical device. See `APK_CHANGELOG.md` for full details.

Most recent **breeder** app **release** APK, built from the legacy **root** project (`com.breedingplanner.mobile`):

`app-release-2026-07-09-mobile-cloud-animal-sync.apk`

This APK includes the full mobile redesign plus the canonical Android entry/style restoration and cloud animal loading safeguards. It does NOT include the new Serpentora logo/splash work (that only exists in `breeding-app-breeder/android/` so far). Once the two-project situation above is resolved, this should be rebuilt as a release from `breeding-app-breeder/`.

Most recent **lab** app build (`com.breedingplanner.lab`, separate app, installs side-by-side with the breeder app):

`app-debug-2026-07-10-lab-staging-sampleid-fix.apk`

Fourth build of the Laboratory portal's mobile companion. Two fixes: sample IDs/QR codes now derive from the human-readable order number (`07AA00001-1`, `07AA00001-2`, ...) instead of the internal database ID; and the app is now built against the **staging** backend (`breeding-planner-staging.up.railway.app`), not production — confirmed via the deployed web app's JS bundle that staging is where the user's test orders actually live, which is why they weren't showing up in the mobile dashboard before (different database, not a bug). Debug-signed only. See `APK_CHANGELOG.md` for full details and known caveats. (Superseded: `app-debug-2026-07-10-lab-bottom-nav-scan-routing.apk`, `app-debug-2026-07-10-lab-mobile-nav-scan-fix.apk`, `app-debug-2026-07-10-lab-mobile-app.apk`.)

Note: `breeding-app-lab` now has both `.env.android-production` and `.env.android-staging`. `npm run android:debug` now defaults to **staging** (matches where the user's actual test data is); use `npm run android:debug:prod` for a production-pointed debug build, and `npm run android:release:apk` for a production release build.

Latest committed baseline before this APK:

`db4575a fix(cleanup): Phase 6 low-priority cleanup — console leaks, polygenic, scheduler (Findings 1.4, 2.5, 2.6)`

## Collected APK Inventory

| APK | Type | Size bytes | SHA256 | Notes |
| --- | --- | ---: | --- | --- |
| `app-debug-2026-07-27-serpentora-logo-splash.apk` | Debug | 20493009 | `17B3153111F7E293885DE41FCB8392F91AF2DD0B669CCAA09D628EB479D1ACA6` | Built from `breeding-app-breeder/android/` (not the legacy root project). Verifies the new Serpentora ouroboros logo across app icons and native splash screens. On-device appearance not yet confirmed. |
| `app-release-2026-07-09-mobile-cloud-animal-sync.apk` | Release | 25248521 | `447C7EB55D954A73A2D320EE04BF9CE48768A1FF6E60477E4E24846D63EA9969` | Most recent. Restores native mobile routing and the full mobile stylesheet after consolidation, keeps account-specific cached snapshots, reports actual cloud read errors, and blocks unsafe writes when cloud loading fails. |
| `app-release-2026-07-07-mobile-full-redesign.apk` | Release | 24849810 | `1D54F0B5EB0D2C039EEEEB044A2EB8BC1D01C869C8D312CB803E38441839CAB6` | Prior July 7 build after the mobile full-version redesign: planner-state preservation, desktop spaces/racks/terrariums in mobile rack view, full animal details, Feed Cycle tab, full log category display, settings data summary, and automatic mobile sync refresh/queued-action upload. |
| `app-release-2026-07-06-unified-cloud-sync.apk` | Release | 24845494 | `BA4194036827CF5E50394725DECA5E46515578D8879D79DA1DC69FF2C2327515` | Prior July 6 build after backend nested merge, owner planner-state sync, mobile save-before-upload merge, and first-sync default overwrite protection. |
| `app-release-2026-07-05-demo-snakes-local-only.apk` | Release | 24843730 | `CCA6FBFE3C9AE317EB472176E70672140F4A6098C61053F49A4FBA7526312C15` | Prior July 5 build after making demo snakes local-only preview data. |
| `app-release-2026-07-05-cloud-sync-convergence.apk` | Release | 24843198 | `C458A6B68488733B465736136312B933AFFE94233B8896481FF2C678EB7A25B9` | Prior July 5 build after cloud sync convergence work. |
| `app-release-2026-07-04-encoding-fixed.apk` | Release | 24841322 | `296B013A872BD0A60B9147F1C7CCC5029A4E408641541600807467728D6C7E2F` | Prior release backup for encoding fix work. |
| `app-release-2026-07-03-photos-breeding.apk` | Release | 24831838 | `085F24A98DCC0A2F63F485062436FDF8E757AA754BA74387B15BC018BE5DF4C9` | Historical APK from gh-pages cache, now copied here. |
| `app-release-2026-07-03-breeding-logging.apk` | Release | 24833638 | `F00AC06B9FCBBF123425B1AEBAC35D4494FB06B963C17A58D3077D286FD2463E` | Historical APK from gh-pages cache, now copied here. |
| `app-release-2026-07-02-fixed.apk` | Release | 24816622 | `BA8630B9731CD739FAA3B35C97DE82BA5584E0C0D0B0AD93A330363B1678065B` | Historical APK from gh-pages cache, now copied here. |
| `app-release-2026-07-02.apk` | Release | 19623154 | `4F1379CA18FA267E15DCF8072D15C994D873E8AFD5DD1790BD6A6ED4C48B75A8` | Historical APK from gh-pages cache, now copied here. |
| `app-debug-2026-07-03-debug-build.apk` | Debug | 28279335 | `C882A95FC5039FF010193FD014138C84D283826A1F1F972CDE11E6DFBC69B1D1` | Debug APK copied from Android build outputs. |

## Historical Duplicate APK Locations

These duplicate source locations were scanned on July 5, 2026 and removed on July 6, 2026 after each APK hash was verified against a matching file in `apk-backups/`:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`
- `dist/android/app-release.apk`
- `apk-backups/app-release-2026-07-04-encoding-fixed.apk`
- `node_modules/.cache/gh-pages/.../apk-backups/app-release-2026-07-02.apk`
- `node_modules/.cache/gh-pages/.../apk-backups/app-release-2026-07-02-fixed.apk`
- `node_modules/.cache/gh-pages/.../apk-backups/app-release-2026-07-03-breeding-logging.apk`
- `node_modules/.cache/gh-pages/.../apk-backups/app-release-2026-07-03-photos-breeding.apk`

The `node_modules/.cache/gh-pages/...` APKs were cache copies only. They were copied into `apk-backups/` before removal so future work does not depend on the cache.

As of July 7, 2026, `apk-backups/` must be the only folder in the workspace that keeps APK files. The July 7 generated release copies from `dist/android/app-release.apk` and `android/app/build/outputs/apk/release/app-release.apk` were removed after their SHA256 hashes matched `app-release-2026-07-07-mobile-full-redesign.apk`.

## Required Naming Rule

Always create a descriptive APK filename when copying a build into this folder:

`app-release-YYYY-MM-DD-short-change-name.apk`

`app-debug-YYYY-MM-DD-short-change-name.apk`

Rules:

- Use the build type: `app-release` or `app-debug`.
- Use the build date.
- Use a short lowercase kebab-case summary of the work.
- Do not leave handoff APKs named only `app-release.apk` or `app-debug.apk`.
- Do not overwrite a prior named APK unless the user explicitly requests it.

Examples:

- `app-release-2026-07-05-cloud-sync-convergence.apk`
- `app-release-2026-07-04-encoding-fixed.apk`
- `app-release-2026-07-03-breeding-logging.apk`

## Required APK Change Log Rule

Claude and Codex must both update `apk-backups/APK_CHANGELOG.md` whenever an APK is edited, rebuilt, replaced, renamed, copied into `apk-backups/`, or recommended to the user as the latest installable APK.

Each entry must record:

- Date and time in Europe/Berlin local time, including UTC offset.
- Agent name: `Claude`, `Codex`, or both.
- APK filename.
- Build type: release, debug, or AAB-related work.
- Clear short summary of what changed in that APK.
- SHA256 hash when an APK file is created or replaced.
- Verification performed, or `Not run` with the reason.

No agent should tell the user an APK is the latest installable build until this log has been updated for that APK state.

## Claude/Codex Coordination Instructions

Claude and Codex should both use `apk-backups/` as the single APK coordination folder.

After creating a new APK:

1. Run the build command.
2. Copy the generated APK into `apk-backups/` using the naming rule.
3. Update `apk-backups/APK_CHANGELOG.md` with the date, time, agent, APK filename, changes, hash, and verification.
4. Update this file with the new APK name, notes, size, and SHA256.
5. State whether the APK came from release, debug, or AAB work.
6. Verify the generated APK output hash matches the named `apk-backups/` file.
7. Remove duplicate APK files from `dist/android/`, Android Gradle output folders, and cache folders so `apk-backups/` stays the single APK location.

Recommended release build command:

```powershell
npm.cmd run android:release:apk
```

Recommended hash command:

```powershell
Get-FileHash apk-backups\*.apk -Algorithm SHA256
```

## Notes For Next Agent

- The current latest APK is `app-release-2026-07-07-mobile-full-redesign.apk`.
- As of July 7, 2026, all retained APK files are under `apk-backups/`; duplicate APK build outputs and cache APKs were removed after SHA256 verification.
- A release AAB also exists under `android/app/build/outputs/bundle/release/app-release.aab`, but this handoff folder is for APK files unless the user asks for AAB collection too.
- Do not delete old APKs from this folder without explicit user approval.
