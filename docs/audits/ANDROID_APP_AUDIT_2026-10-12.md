# Android app audit (breeder APK), 12 October 2026

Scope: the breeder Android app, package `com.serpentora.mobile`, built from
`breeding-app-breeder/`. The Lab APK is a separate app and is out of scope.

Read-only audit. Evidence is the source at `origin/main` (`e4763e0`) and the
`feature/lab-results-and-launch-prep` branch the last APK was built from, plus the
app driven in a 390 px wide browser against a dead backend (screenshots in the
session scratchpad, reproduced in the findings below). No device was attached.

## The one-paragraph verdict

The APK does not run Serpentora. `src/AppEntry.jsx:21` detects Capacitor and mounts a
second, much smaller app, `src/features/mobile/MobileApp.jsx` (3,077 lines in one file,
plus 1,653 lines of its own CSS). That app has eight screens, its own data model, its
own sync, its own scanner, its own strings and its own component vocabulary. Nothing in
it is shared with the real app except two lab panels and the advisor. Every feature the
user misses on the phone, backup included, is missing because it was never built a
second time. The real app, meanwhile, already renders acceptably at phone width with a
bottom tab bar, a More sheet and a Settings page that has the whole Backups section.
The structural fix is to stop maintaining two apps.

## Findings, ranked

### A. Structural (cause of almost everything else)

**A1. Two apps, one product.** `AppEntry.jsx:11-19` switches on `VITE_PLATFORM=android`
or `Capacitor.isNativePlatform()` and mounts `MobileApp` instead of `BreedingPlannerApp`.
The mobile app re-implements login, animal list, animal profile, quick logs, pairings,
tasks, rack view, photos and settings from scratch. Not present on the phone: backups
and restore, genetics calculator, clutches and incubation, family tree, calendar, the
breeding cards shipped in PR 17, finances, marketplace, quarantine, spaces editing,
account, language, appearance beyond theme, help, imports (MorphMarket, CSV), exports,
certificates, QR label printing.

**A2. One 3,077-line file.** `MobileApp.jsx` holds helpers, merge logic, 25 components,
two whole "modes" and the root. There is no routing, no module boundary, and no test.
Any change is a change to everything.

**A3. Two data models for the same rows.** Backend research confirms mobile and desktop
read and write the same `animal`, `pairing`, `clutch` and `breederPlannerState` tables
through the same `GET/PUT /api/breeder/snapshot`. The difference is entirely client
side: desktop is local-first with delta sync, cursors and tombstones
(`App.jsx` ~7839-7920, `breederDataService.ts:421,536`); mobile does a full
read-modify-write of the whole account on every edit (`MobileApp.jsx:1898-1918,
2259-2290`), sends no tombstones and ignores `deleted`. Consequences:

- An animal deleted on desktop can be resurrected by a phone edit made from a stale
  cache.
- Every photo or field change on the phone uploads the entire account.
- The phone has no concept of "unsynced local change" except the six quick-log types.

### B. Backup and restore (the reported bug)

**B1. Backup does not exist in the mobile app.** No file picker, no save, no use of
`@capacitor/filesystem` anywhere in `src/` (`grep` finds only `@capacitor/camera`).
The user cannot load or save a backup because there is no control for it.

**B2. Even the desktop code would not save a file in the WebView.** The desktop writes
backups with Blob → `URL.createObjectURL` → temporary `<a download>` click, copied three
times (`App.jsx:19296-19339, 19387-19430, 20324-20367`). A Capacitor WebView ignores
anchor downloads. Saving needs the Filesystem plugin plus the system share sheet or a
document-picker intent. Reading uses `<input type="file">` and `file.text()`
(`App.jsx:20452-20502`), which does work in the WebView, so "load" comes for free once
the real Settings page is on the phone.

**B3. The backup system is not extractable as-is.** `createBackupPayload`,
`handleRestoreBackup`, `runAutoBackup` and the vault are closures over component state
inside `App` (`App.jsx:8548-8708`). Bugs found on the way, to fix when touching it:

- Only the current species' groups are backed up (`groups` memo at 7222, not
  `groupsBySpecies`). A full restore loses the other species' groups.
- `version` is never validated on restore.
- localStorage quota failures are only `console.warn`ed (2680-2700). On a phone, where
  the WebView quota is roughly 5-10 MB and photos are base64 inside the records, this is
  the silent data-loss path.
- Restore replaces local state but does not touch cloud tombstones; the next sync can
  bring back records the restore removed (unverified, flagged by the research pass).

### C. Sync correctness on the phone

**C1. Offline queue loses failed actions.** `runSync` (`MobileApp.jsx:2383-2393`)
clears the whole queue on any HTTP 200, but `/mobile/sync` returns per-action
`failed` results inside a 200 (`mobileService.ts:366-394`).

**C2. No idempotency.** The server overwrites the client action id with a UUID
(`mobileService.ts:261-285`), so a retried batch creates duplicate feed, weight and
shed entries.

**C3. Photos never reach the cloud.** `stripEmbeddedMediaForSync`
(`apiClient.ts:970-997`) removes every `data:` URL before upload. The phone shows
"Photo saved." and keeps the photo only in localStorage. There is no media upload
endpoint for animals; only the marketplace has one.

**C4. Deleted animals leak into mobile endpoints.** `findAnimalByQr`,
`getTodayMobileTasks` and `getRackMode` do not filter `deletedAt: null`
(`mobileService.ts:146, 289, 314`).

**C5. Cross-account cache.** `ANIMALS_CACHE` is a global key (`MobileApp.jsx:37`), not
user-scoped like `SNAPSHOT_CACHE`. Terminal mode reads it first. Two accounts on one
device see each other's animals in the scan lookup.

### D. Native integration

**D1. Ten Capacitor plugins installed, one used.** `package.json` lists app, camera,
filesystem, haptics, keyboard, network, preferences, push-notifications, splash-screen
and status-bar. Only Camera is imported. Consequences:

- **Android back button exits the app** from any screen. Nothing listens to
  `App.addListener('backButton')`.
- No safe-area handling for notches and gesture bars (the bottom nav sits on the
  gesture area).
- Online state comes from `navigator.onLine`, which is unreliable in WebViews.
- Push notifications are declared in the manifest (`POST_NOTIFICATIONS`) with no
  registration code.

**D2. Mode picker on every launch.** `MODE_KEY` is written (`MobileApp.jsx:3059`) and
never read, so the Terminal / Full Access choice is asked every cold start.

**D3. Version never bumped.** `android/app/build.gradle:10-11` hardcodes
`versionCode 1`, `versionName "1.0"` while the web app reports v0.1.82. Updates over
an installed build rely on side-loading semantics; Play would reject them.

**D4. Release shrinking is opt-in.** `minifyEnabled` and `shrinkResources` are gated on
a Gradle property `enableReleaseOptimization` (`build.gradle:49-50`). The built web
bundle is 16 MB with a 3.3 MB main chunk; the APK ships fonts (two Noto TTFs, 1.1 MB)
and PDF/XLSX libraries whether or not the phone ever uses them.

Correct and worth keeping: `androidScheme: https`, `cleartext: false`, keystore and
`key.properties` ignored by git, CAMERA and media permissions, the FileProvider entry,
the staging-by-default build script, and the JDK/SDK bootstrap in
`scripts/android-build.ps1`.

### E. Product and UX

**E1. The mobile app says "full desktop features on mobile"** on its mode card
(`MobileApp.jsx:802`). `PRODUCT.md` lists the claims the product may make; this one is
not true and should go.

**E2. Terminal mode is the one good idea.** Scan a tag, land on the card, log feed,
weight, shed, clean, water, note or photo in two taps. It resolves locally first and only
falls back to the tier-gated endpoint. This workflow is worth keeping as the phone's
home, not as a separate mode behind a picker.

**E3. The real app at 390 px is already a better phone app than the mobile app** on
every screen except the scan-and-log flow. Observed in the browser:

- Dashboard: species cards, search, counts, demo banner, six-tab bottom nav.
- Animals: species list ("open a species first"), then animals inside.
- Settings: horizontal chip tabs including **Backups** with Download backup
  (.bpbackup), Save to vault, Automatic backups, Cloud database sync, Backup vault,
  Restore from file.
- More: Breeding Advisor, Quarantine, Family Tree, Spaces, Lab tests.

Its phone problems are smaller and fixable in place: a dead ~100 px band inside the
sticky mobile header above the logo; emoji used as nav icons; no scan or quick-log
entry anywhere; desktop verbs ("Download") where the phone needs "Save to device" and
"Share"; no safe-area padding; a 3.3 MB main chunk on first paint.

**E4. Two scanners.** The mobile app has a `getUserMedia` + BarcodeDetector + jsQR
scanner; the desktop has `QrScannerModal` on `html5-qrcode`. Keep one.

**E5. Strings are duplicated.** The mobile app has its own `mobile.*` namespace, 328
lines per locale in `common.json`, maintained separately from the desktop strings for
the same concepts.

### F. Housekeeping

- `docs/mobile/android-build-and-install.md` is stale: old package name
  `com.breedingplanner.mobile`, "mobile PWA route at `#/mobile`", which no longer exists.
- The last APK (12 Oct, `feature/lab-results-and-launch-prep@bdd4bff`) is 5 commits
  ahead and 6 behind `origin/main`; it lacks PR 17. The mobile file differs from main by
  42 lines. New work starts from `origin/main`.
- Root `android/` and root `scripts/android-build.ps1` are still the orphaned legacy
  project (known, unchanged).

## What this means for the rebuild

1. **Ship the real app in the APK.** Remove the second app. The phone runs
   `BreedingPlannerApp` with the same local-first store and the same cloud sync as the
   browser and Electron. Backups, restore, vault and every module arrive on the phone
   at once, and A3, B1, C1-C5 and E5 disappear instead of being fixed one by one.
2. **Add a native layer once.** A small platform module that the app calls for: save a
   file (Filesystem + Share), open a file (existing input works), camera, haptics,
   hardware back, status bar and safe areas, network state, keyboard. The desktop's three
   copies of the download code collapse into one `saveFile()` that picks the right
   implementation for browser, Electron and Android.
3. **Bring the one good mobile idea into the real app.** A "Field" surface: scan a tag,
   land on the animal, log in two taps, see today's due feeds. Built on the real store,
   it also works offline for free.
4. **Fix the phone-width defects of the real app** found in E3 rather than designing a
   new visual world; the house system (`VISUAL_LANGUAGE.md`, `--sk-*` tokens) stays.
5. Fix the backup bugs in B3 while extracting the backup code out of `App.jsx`.

Decisions recorded with the user on 12 October 2026: breeder app only; hybrid
direction; Terminal kept as a mode inside the app; new branch off `origin/main`
(`feature/mobile-rebuild`, worktree `.claude/worktrees/mobile-rebuild`); verification
in a browser at phone width with on-device checks reported honestly as done or not done.
