# Claude APK Handoff

This folder is the shared APK workspace for Claude and Codex:

`apk-backups/`

Both agents must use this same folder for APK handoff work so APK files, hashes, and notes stay synchronized.

## Current Status

Most recent release APK:

`app-release-2026-07-05-demo-snakes-local-only.apk`

This APK was built after the demo snakes local-only fix. It should be the starting APK if Claude needs to test or continue mobile release work.

Latest committed baseline before this APK:

`2b9826e Fix cloud sync convergence`

## Collected APK Inventory

| APK | Type | Size bytes | SHA256 | Notes |
| --- | --- | ---: | --- | --- |
| `app-release-2026-07-05-demo-snakes-local-only.apk` | Release | 24843730 | `CCA6FBFE3C9AE317EB472176E70672140F4A6098C61053F49A4FBA7526312C15` | Most recent. Built July 5, 2026 after making demo snakes local-only preview data. |
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

As of July 6, 2026, `apk-backups/` must be the only folder in the workspace that keeps APK files.

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

- The current latest APK is the demo snakes local-only APK from July 5, 2026.
- As of July 6, 2026, all retained APK files are under `apk-backups/`; duplicate APK build outputs and cache APKs were removed after SHA256 verification.
- A release AAB also exists under `android/app/build/outputs/bundle/release/app-release.aab`, but this handoff folder is for APK files unless the user asks for AAB collection too.
- Do not delete old APKs from this folder without explicit user approval.
