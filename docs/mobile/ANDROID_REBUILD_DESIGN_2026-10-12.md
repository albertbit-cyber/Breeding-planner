# Android rebuild: design and plan, 12 October 2026

Companion to `docs/audits/ANDROID_APP_AUDIT_2026-10-12.md`. That document says what is
wrong; this one says what the phone app becomes and in what order it is built.

## Design read

One app, one store. The phone is the animal-room client of the same Serpentora the
browser and Electron run: same local-first data, same sync, same modules, same skin
tokens. On top of it sits a thin "Field" layer, which is what a keeper actually does
standing in front of a rack: scan, look, log, move on. Nothing on the phone gets its own
data model again.

Visual direction is the existing house system (`VISUAL_LANGUAGE.md`: role-based
`--sk-*` colour, Space Grotesk, density tokens, 8 px radius with pill chips, 250 ms
motion). No new visual world. The phone-specific work is hierarchy, reach and touch
targets, not a restyle.

## The decisions

| Question | Decision | Why |
|---|---|---|
| What runs in the APK | `BreedingPlannerApp` (the real app), not `MobileApp.jsx` | Every module and backups arrive at once; the second data model and its sync bugs go away |
| Where the data lives on the phone | The real app's local-first store with cloud delta sync | Works offline by design; backup = export of local state, same `.bpbackup` file as desktop |
| Backup save | Native `saveFile()` via Filesystem + Share sheet, one implementation behind a platform module | Anchor downloads are dead in a WebView; the desktop's three copies collapse into one |
| Backup load | The existing `<input type="file">` path | Already works in Android WebView |
| Terminal mode | Kept, as the **Field** surface inside the app, reachable from the tab bar, remembered as the start screen if the keeper prefers it | It is the one good mobile idea; it no longer needs a mode picker |
| Scanner | One: the real app's `QrScannerModal`, given a native-friendly camera path | Two scanners is one too many |
| Quick logs | Written to the local store through the real app's log functions, synced by the normal delta sync | Idempotent by construction, offline by construction, no `/mobile/log` or `/mobile/sync` |
| Photos | Captured with the Camera plugin, compressed with the app's existing photo pipeline, stored like desktop photos | Same behaviour on every platform; cloud media upload remains a separate, later item |
| `/mobile/*` endpoints | Keep `/mobile/permissions` for device registration; stop calling the rest from the phone | They are derivable from the snapshot and have the audit's C1-C5 defects |
| Strings | Reuse desktop keys; new Field strings go into the normal namespaces in all ten locales | Ends the duplicate `mobile.*` namespace |
| Android version | `versionCode` and `versionName` derived from `package.json` at build time | Updates install over the previous build |

## Navigation map

Bottom tab bar, five items, thumb-reachable, with safe-area padding:

```
Field | Animals | Breeding | Calendar | More
```

- **Field** (phone home). Top: a big Scan button that opens the camera. Below: "Due
  today" (feeds due from the feed cycle, overdue first), then "Recent" (last animals
  opened on this device). Scanning a tag or tapping a row opens the animal's card with
  the quick-log row in reach. Manual entry of an ID stays as a fallback under the
  scanner.
- **Animals**, **Breeding**, **Calendar**: the real app's tabs, as they are.
- **More**: a full-screen list, not a popover: Dashboard, Breeding cards, Breeding
  Advisor, Family Tree, Spaces, Quarantine, Lab tests, Settings (with Backups),
  Account, Help, Sign out. Grouped with section labels; this is also where "start on
  Field / start on Dashboard" is chosen.

The animal card on the phone:

```
[< Back]  Name                      [⋯]
hero: photo, name, sex, status, genetics, location
quick-log row: Feed · Weight · Shed · Clean · Water · Note · Photo
tabs: Overview · Logs · Breeding · Details · Photos
```

Each quick log is a bottom sheet with one or two fields and a single primary button.
Clean and Water log in one tap with an undo toast. Weight prefills the last value.

Hardware back: closes the topmost sheet or modal, then goes back to the previous tab
or list, and only on the Field screen asks "Leave Serpentora?" once.

## The native layer

One module, `src/platform/`, that every caller uses instead of touching `window` or a
plugin directly. Each function has a browser, Electron and Android implementation.

| Function | Browser | Electron | Android |
|---|---|---|---|
| `saveFile({name, mime, data})` | anchor download | existing IPC | Filesystem write to cache, then Share sheet |
| `pickFile(accept)` | input element | input element | input element |
| `takePhoto()` | input capture | input capture | Camera plugin, native downscale |
| `scanQr()` | html5-qrcode | html5-qrcode | html5-qrcode over getUserMedia (same) |
| `haptic(kind)` | no-op | no-op | Haptics plugin |
| `onBackButton(handler)` | no-op | no-op | App plugin listener |
| `networkState()` | navigator | navigator | Network plugin |
| `safeArea` | CSS env() | CSS env() | CSS env() plus StatusBar overlay config |
| `keyboard` | no-op | no-op | Keyboard plugin resize mode |

`AppEntry.jsx` stops switching apps. It mounts the real app on every platform and
hands it a `platform` prop.

## Phone-width fixes to the real app

From the audit's E3, all inside the existing CSS and components:

1. Remove the dead band inside `.bp-header-mobile`; the mobile header becomes one
   compact row with the wordmark, sync state dot and the Scan shortcut.
2. Replace emoji in the tab bar and More list with the app's icon set.
3. Safe-area padding top and bottom; tab bar sits above the gesture bar.
4. Touch targets at 44 px minimum on list rows, chips and the Settings chip tabs.
5. Settings → Backups on the phone says "Save backup to device" and "Share backup",
   and the vault rows get the same two actions.
6. First-paint budget: code-split the PDF, XLSX and pdf.js chunks so the main chunk
   loads without them (they load when an export is requested).

## Backup extraction

Move `createBackupPayload`, `handleRestoreBackup`, the vault helpers and the
auto-backup scheduler out of `App.jsx` into `src/features/backup/` with the pure
normalizers already exported. Fix while moving:

- back up `groupsBySpecies`, not the current species' groups;
- validate `version` and refuse unknown versions with a clear message;
- surface storage-quota failures to the user instead of `console.warn`;
- one `downloadBackup(payload, name)` that calls `platform.saveFile()`.

Restore stays "replace", as on desktop. Tombstone interaction with restore is checked
and documented in the same change.

## Phases

**Phase 1, foundation.** `src/platform/` with the Android implementations, AppEntry
mounting the real app on Android, hardware back, safe areas, status bar, version from
`package.json`, backup save and load working on the phone through the real Settings
page, backup extraction with the four fixes. Delete `MobileApp.jsx` and its CSS.

**Phase 2, Field.** The Field tab, the scan flow into the real animal card, quick-log
sheets on the real store, Due today, Recent, start-screen preference, More list.
Phone-width fixes 1 to 5.

**Phase 3, QA and polish.** Impeccable critique at 390 and 768 px, fixes, then motion
with emil-design-eng on the sheets and tab transitions. Code splitting (fix 6). Locale
strings in all ten languages. Tests for the platform module and the backup module.

**Phase 4, ship.** Release APK against staging from `feature/mobile-rebuild`,
changelog entry with hash and honest verification notes, PR to `main`. On-device checks
listed as done or not done.

## Not in scope

The Lab APK. iOS. Cloud media upload for animal photos. Push notifications (still
blocked on a Firebase project). The orphaned root `android/` project.
