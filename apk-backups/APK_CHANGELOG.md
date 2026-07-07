# APK Change Log

This is the required shared APK change log for Claude and Codex.

Every APK edit, rebuild, replacement, rename, copy into `apk-backups/`, or recommendation of the latest installable APK must be recorded here before the user is told which APK to install.

## Required Entry Format

| Date/time | Agent | APK | Type | Changes | SHA256 | Verification |
| --- | --- | --- | --- | --- | --- | --- |

Use Europe/Berlin local time with UTC offset, for example `2026-07-06 00:52 +02:00`.

## Entries

| Date/time | Agent | APK | Type | Changes | SHA256 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-07 14:05 +02:00 | Codex | `app-release-2026-07-07-mobile-full-redesign.apk` | Release | Rebuilt the mobile APK after the full mobile redesign: mobile snapshots now preserve planner state, mobile rack/spaces view reads desktop rooms/racks/terrariums, animal profiles include Feed Cycle, full details, all log categories, normalized genetics, settings data summaries, and automatic signed-in/online sync refresh with queued-action upload. | `1D54F0B5EB0D2C039EEEEB044A2EB8BC1D01C869C8D312CB803E38441839CAB6` | Ran root production build, Android production release APK build, verified generated APK hashes matched the archived APK, removed generated duplicate APKs from `dist/android/` and Android Gradle outputs, and re-scanned the workspace so retained APKs are only in `apk-backups/`. Root Vitest suite was attempted but failed on existing suite configuration issues unrelated to this change: backend tests missing `DATABASE_URL`, Playwright e2e specs being collected by Vitest, shared-package missing test imports, and `src/public_url.test.js` missing Vitest globals. |
| 2026-07-06 03:20 +02:00 | Codex | `app-release-2026-07-06-unified-cloud-sync.apk` | Release | Rebuilt the mobile APK with unified cloud sync fixes: backend nested animal/pairing merge preservation, owner planner-state sync for racks/rooms/groups/feed defaults/appearance, mobile save paths that merge with the latest cloud snapshot before uploading, and first-sync protection so a fresh device cannot overwrite existing cloud planner state with defaults. | `BA4194036827CF5E50394725DECA5E46515578D8879D79DA1DC69FF2C2327515` | Ran backend sync tests, backend build, root app build, breeder app build, Android release APK build, verified generated APK hashes matched the archived APK, and re-scanned the workspace so retained APKs are only in `apk-backups/`. |
| 2026-07-06 00:57 +02:00 | Codex | `apk-backups/*.apk` | APK folder cleanup | Made `apk-backups/` the only retained APK folder. Removed duplicate APK copies from `android/app/build/outputs/apk/`, `dist/android/`, and `node_modules/.cache/gh-pages/.../apk-backups/` after verifying each duplicate hash matched a file already in `apk-backups/`. Updated handoff docs so future APK builds remove duplicate generated/cache copies after archiving. | Multiple, unchanged from inventory rows in `CLAUDE_APK_HANDOFF.md` | Re-scanned the workspace for `*.apk`; only eight APK files remain, all under `apk-backups/`. |
| 2026-07-06 00:52 +02:00 | Codex | `app-release-2026-07-05-demo-snakes-local-only.apk` | Release | Confirmed as latest installable APK from the current archive state; includes cloud sync convergence and demo-snakes-local-only work. Added this mandatory shared APK logging rule for future Codex and Claude APK work. | `CCA6FBFE3C9AE317EB472176E70672140F4A6098C61053F49A4FBA7526312C15` | Compared workspace APK timestamps and SHA256 hashes. No APK rebuild performed. |
