# Help system plan: breeding-app-breeder

Status: **built, 7/7 (2026-10-07)** on `feature/help-system`. Section 13 records the outcome. Spec: [docs/handoff/help-system.md](handoff/help-system.md)
(repo copy of the "Serpentora Help System Handoff" doc). This file is the resumable record: later
sessions read this file and the handoff copy, not the original doc.

Scope: the breeder web app (`src/App.jsx`, `src/features/*`), at desktop and at 390px. Out of scope:
the Android UI (`features/mobile/MobileApp.jsx`), and the lab, marketplace, admin and public apps.
Section 12 covers how each of those could reuse this work later.

### Approved 2026-10-07, with these changes

The plan below was written on 2026-10-05. Four things landed before the build started; they override
the text they contradict.

1. **P3.2 ("One word for one thing") landed** (`69dcd73`). Topics use today's labels: "Breeding",
   "Lab tests", "Status", "For sale", "Import animals", "Active pairings". Section 9 is history.
2. **The phone-nav gap in 8.8 is fixed** (`5470aed`): the bottom bar has Dashboard, and a
   species-scoped tab with no species open shows a SpeciesGate ("Open a species first") instead of
   bouncing. No phone-nav change is part of this work; the essentials tour passes through the gate.
3. **Certificate lookup exists** (`def666c`): `breeding-app-public` has `/verify` and an
   unauthenticated backend route. Help may say a certificate carries a code that can be looked up on
   the public `/verify` page; it must not present this as live for buyers or as campaign copy.
4. **Billing exists in test mode** (`3ed0e32`): My Account can open Stripe checkout and the billing
   portal, which answer "Plans are not purchasable yet." without keys. Help may say Change plan opens
   a checkout page; it never says a plan can be bought or paid for today. Change plan stays explained
   only.

Line numbers in sections 1 and 2 predate these commits (App.jsx is now 27,623 lines); they are
re-checked while building, not rewritten here.

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Where the code lives | `src/features/help/`. Logic is in `.ts`; UI is in `.jsx`, to match App.jsx. |
| State | A small external store read with React 18's built-in `useSyncExternalStore`. No new state library. |
| Persisted help flags | One device-local localStorage key, `serpentora.help.v1`. It is never added to `plannerSyncState`, so no backend change. |
| Strings | One new i18n namespace, `help` (`src/locales/en/help.json`). Other locales fall back to English until P2.9. |
| Topic titles | The topic's title key points at the key the control itself renders wherever one exists, so title and label cannot drift. |
| Typo safety for `help('id')` | `.jsx` is not type-checked here. A source-scan test in `npm test` fails on any unknown id instead. |
| DOM tests | Add `jsdom` as a devDependency; guard and engine tests opt in per file. No testing-library needed. |
| Dialogs | All ~40 hand-rolled overlays get `role="dialog"`, `aria-modal`, a `data-dialog` id and a `?` in their header. |
| Example offer | The only real action a tour takes. It adds one animal named "Example animal" to the open species. |
| Backend | None needed. Nothing touches Prisma or Railway. |

## 1. Inventory: how the breeder app works

All line numbers are `src/App.jsx` unless another file is named.

- **Mounting.** `AppEntry.jsx:21-48` renders `AuthGate > BreedingPlannerApp` (App.jsx:6787) on web,
  inside `AppearanceProvider > SharedBackendProvider > FeatureAccessProvider > BatchOrderProvider`.
  A native shell renders `MobileApp` instead, so nothing added to App.jsx reaches Android.
- **State.** About 196 `useState` calls in `BreedingPlannerApp`. There are no stores and no signals
  (`src/signals/` is search code).
  - Main collections: `snakes` (6809), `pairings` (6818; clutch, egg and hatch data are fields on a
    pairing), `groupsBySpecies` (7143), `spacesState` (7198), `breederInfo` (7202), aliases, tags,
    and the backup state.
  - There is no single AppData object.
- **Persistence.**
  - Browser: one localStorage key per collection (`STORAGE_KEYS`, 1115-1139) through
    `saveStoredJson`/`loadStoredJson`.
  - Electron: `electronAPI.saveData`.
  - Cloud: `runCloudBreederSync` (7782) sends snakes, pairings and `plannerSyncState` (7726).
  - Standalone localStorage keys never sync. The existing pattern for device-local flags is
    `STORAGE_KEYS.quarantineNotice` and `speciesBackfillDone`.
  - `resetAppToDefaults` (8700) clears all localStorage, help flags included. That is intended:
    a reset is a fresh start.
- **Navigation.** There is no router.
  - State: `tab` (6869), plus `speciesScope` (6870). Tab ids are `dashboard`, `animals`, `pairings`,
    `advisor`, `familyTree`, `spaces`, `quarantine`, `calendar`, `shedTerminal`, `setup`.
  - Sub-views: `animalView` (all/males/females/groups), `pairingsView` (dashboard/active/completed/incubator),
    and `setupTab` inside Settings (info/id/aliases/geneAliases/export/appearance/backup/account/language/devTools).
  - Species-scoped tabs (`animals`, `pairings`, `advisor`, `familyTree`) bounce to the dashboard when
    no species is open (7048).
  - Programmatic navigation: `openSpeciesWorkspace`, `leaveSpeciesWorkspace`, `setTab`, `openSetupTab`.
  - Feed Prep is a modal, not a tab.
- **Top bar.** Inline JSX, not a component.
  - Desktop: `.bp-header-desktop` 11466-11516 (brand, NotSyncedPill, TabButton row).
  - At 768px and below, it swaps to a compact `.bp-header-mobile` (11519) plus a bottom nav
    (11540: Animals, Breeding, Calendar, Settings, More) and a More menu (11566: Advisor, Quarantine,
    Family Tree, Spaces, Shed Test).
- **Dialogs.** No native `<dialog>` and no top layer. About 40 `fixed inset-0` div overlays.
  - Some are portaled to `document.body`. The shared ones are `FloatingDialog` (26005),
    `ChoiceDialog` (26026) and the app alert/confirm/prompt (7613). They have about 11 uses; the rest
    are hand-rolled, about 27 in App.jsx and 9 in feature files.
  - Only 8 have `role="dialog"`. z-index runs up to `z-[10070]`. None close on Escape.
- **Keyboard.** The only global handler is `useHardwareScannerListener` (14425): `window` capture
  `keydown` and `paste`, active on scanner views. There are no app hotkeys.
- **i18n.** `src/i18n/index.js` imports static JSON per locale and namespace and calls
  `bootstrapI18n` from `breeding-app-shared`.
  - Namespaces: `common animals advisor auth electron`, with fallback `en`.
  - `scripts/check-app-locales.cjs` (`i18n:verify:apps`) checks only the namespaces listed in the
    shared `settings.json`.
  - Many controls are hard-coded English: Family Tree, My Account, Backups, Developer Tools, egg box,
    QR modals, the hatch wizard, and the marketplace form.
- **Tests and tooling.**
  - Vitest is configured in `vite.config.mts` with the node environment; `setupTests.js` is never
    loaded. There are 43 pure-logic tests, co-located. jsdom, happy-dom and testing-library are not installed.
  - Playwright (`playwright.config.mjs`) starts the backend (`:4000`) and vite on `:4174`. The setup
    project logs in the seeded `breeder@proherper.dev`. There is no fresh-account helper.
  - `tsc --noEmit` covers `.ts`/`.tsx` only (`checkJs:false`).
  - ESLint uses the root `eslint.config.mjs`, correctness rules only.
- **Existing attributes.** `data-help`, `data-tour` and `data-testid` appear nowhere. E2E selects by
  role and text.
- **First run is never empty.** A new account shows a demo collection (`createFreshSnakes`, 3777;
  `isDemoCollection`, 7020). The demo animals disappear once one real animal exists and come back if
  the last real animal is deleted (2860).

## 2. Inventory: screens and controls

These groups become the topic files. The counts are distinct controls, with form fields counted by group.

| Screen (where) | Controls a topic must cover |
|---|---|
| **Top bar and nav** (11466-11589) | Each desktop tab (Dashboard, Animals, Breeding Tracker, Breeding Advisor, Family Tree, Feed Prep, Spaces, Quarantine with its badge, Calendar, Shed Test Terminal, Settings); "Not synced" pill; phone bottom nav and More menu; species bar "All species"; scroll-to-top. ~20 |
| **Dashboard** (`SpeciesDashboard.jsx`) | Demo-collection banner; "Search every animal" with Clear and the results; totals; species cards; "New animal & species" tile; breeding table count cells. ~8 |
| **Animals** (11640-12092; SnakeCard 17103; SnakeListTable 17958; GroupCheckboxes 14778; GroupsSection 26795) | All/Males/Females/Groups tabs; Cards/List; sort select and direction; Export list CSV; Add animal, plus the phone "+" button; Import animals; Export QR; Scan QR; search; tag filter; delete tag "−"; group filter chips; Hide unassigned; phone Filters sheet. Card: Edit, Pair, More menu (Open family tree, Delete), activity tiles and their quick-add popover (Refused feed, Add), breeding-cycle Open, pairing chips, "+N more". Table: sortable headers, Edit, Pair, family tree, Order Genetic Test, Pairings (n), Delete. Groups: new group, Add, Delete. ~45 |
| **Animal record** (editor 13245-13985) | Delete, Open family tree, Export PDF, QR label, Order Genetic Test, Save changes, Cancel. Tag select and add tag; Name; ID with Generate ID and Update ID; Sex; Species; Birth date; Genetics (GeneAutocomplete); Weight. Feed Cycle box. For Sale toggle with price, currency, description and Publish to Marketplace. Group with add group. Photos: Take, Upload, View, Clear cover, and the gallery's Set as cover and Remove. ParentagePanel; BreederShedTestingPanel; ReproductiveIntelligencePanel (females); pairing overview; QuarantinePanel; LogsEditor (Feeds, Weights, Sheds, Cleanings, Meds: Add, Delete, Mark refused). ~55 |
| **Add and import** (AddAnimalWizard 6164; ImportSection 26156; `MorphMarketImportReview.jsx`) | Species; Quick Add text with Update Fields; Name, ID, Sex, tag, Genetics, weight, price, year, birth date, group, parentage; "Newly acquired" with source and seller; Add. Species backfill dialog; leucistic dialog. Import: From MorphMarket, Generic CSV / spreadsheet, Upload PDF, paste text, species for this import, Preview, Import (n); MorphMarket review rows (Import/Skip, Update existing) and Import n animals. ~30 |
| **Breeding Tracker** (12129-12438; 22937-25922) | Sub-tabs (Dashboard, Active projects, Completed projects, Incubator); search; Pairing QR labels; New pairing and the Create pairing dialog; year and outcome chips. Dashboard: urgency cards, stage counts, item actions. Pairing card: expand, Sire, Dam, QR label, Delete, Edit pairing, label, start date, appointments (Generate 5 months, Add, Lock, Remove), notes, hatchling chips, Genetics calculator and odds. Lifecycle: Log ovulation, Log pre-lay shed, the clutch fields, Eggs laid, Create clutch card, Eggs hatched, Clear egg record, Clear hatch record, Reopen project. Hatch gate and redo dialogs; hatch wizard. Completion: reason, confidence, note, Mark completed. Incubator: egg box view/edit (bad eggs, notes, Save) and Print clutch card. Breeders-only guard dialog. ~55 |
| **Breeding Advisor** (`SuggestionsTab.tsx`) | Goal; Run Advisor; Reset Advisor; Export by pairing; per card Accept (currently a no-op), Convert to Plan, Show Breeding Plan, Ignore, multi-generation toggle; progress dialog (Close, Retry, View Results); plan flowchart (Goal Threshold, Generation Limit, Update Plan, Close). ~15 |
| **Family Tree** (`FamilyTreePage.jsx`) | View tabs (Tree, Horizontal, Lineage, Clutch, Universe); Switch Snake; nodes; Pedigree Passport tabs (Overview, History, Health and Files, which say "coming soon"). ~10 |
| **Calendar** (27340-28555) | Previous/next month, month select, previous/next year, year input; Connect Google Calendar, Sync to Google, Sync n months, calendar target, Google Sign out; Refresh; Export appointment sheet, Export Google Calendar (.ics), Export Full Calendar; 8 filter checkboxes; day events; male legend. ~20 |
| **Feed Prep** (16878) | Select all, Clear, Copy report, Close, per-animal checkbox, Edit for a missing feeder profile. 6 |
| **Spaces** (14877; modals 214-1038) | Room name, Create Room, room card, Rename, Delete, Open room. Room: Create Rack, Create Terrarium, Close room, Rename, Move up, Move down, Delete. Rack form (name, tub size, lines, levels, custom size). Rack view: Edit, Delete, slots, assign (search, Empty). Terrarium form and view: occupants, Assign snake. ~25 |
| **Quarantine** (`features/quarantine/*`) | Read the notice; Tests & laboratories; summary tiles; In quarantine/Cleared/All; Log check; Mark cleared; Back into quarantine; more menu (Open animal, Restart clock, Remove record). Editor panel: status, source, dates, length, intake weight, checklist, Restart clock, Extend, checks, tests and treatments (each with Log and Delete). Dialogs: notice, clearance, quick check, check guidance; diagnostics reference with its lab links. ~30 |
| **Lab testing** (`features/lab/*`) | Order Genetic Test dialog (lab picker, suggested het tests, catalog tests, Save for later, Add to Batch); Batch Order cart (expand, Remove, Clear All, Submit Order, Retry); Shed Testing Orders panel (View details, Preview, Print, Download Labels, Download Certificate, View Certificate, label print preview); Shed Test Terminal (batch history, Refresh, Cancel Order, queue items, Submit Order, Re-download labels). ~25 |
| **Settings** (BreederSection 18229-22400) | Sub-tabs. Breeder info (fields, Upload logo, Save). ID wizard (Reset, Template, preview fields, token toggles). Morph and Gene alias managers (Import JSON, Export JSON, fields, Add/Update, Edit, Delete). Data exports (lab label size, PDF label settings, Animals exports and scope, catalog, text list, fields, Breeding projects exports, layout, filters). Appearance (presets, materials, save preset, high contrast, theme, background, six colours, typography, density, radius, motion). Language. Developer Tools (dev builds only). ~60 |
| **Backups and sync** (21630-21960) | Compress existing photos; Download backup; Save to vault; Schedule; Run now; Download latest snapshot; Sync cloud database; Retention limit; vault entry Download, Restore, Rename, Delete; Choose backup file; Import legacy JSON. 13 |
| **My Account** (21978-22345) | Refresh account; Sign out on this device; Change plan; Change email; Change password; Download my data (groups, Select all, Clear); Keep my account; Delete my account. ~12 |
| **Always-on chrome** | AuthGate "Signed in as" chip with Sign out; NotSyncedToast; app alert/confirm/prompt dialog; Batch Order cart button. 4 |

**Estimate: 330 to 380 topics in 17 categories.** That is about 300 controls plus screen headers and
concept topics (morph, het, possible het, visual, clutch, group vs tag, local-first).

### Core jobs a new keeper must learn first

1. **Find their way:** Dashboard, species, the tabs, and the "?".
2. **Add an animal:** their own, or the labelled example.
3. **Keep a record:** open an animal, read its genetics, log a feed.
4. **Plan and follow a pairing:** New pairing, then the Breeding Tracker stages through to the incubator.
5. **Bring an existing collection in:** import, explained only.
6. **Keep the data safe:** working on the device, backups, cloud sync, explained only.

### Destructive or outward actions: explained, never a do-step

| Kind | Controls |
|---|---|
| Delete | Animal (card, table, editor); pairing (`clutch.delete`); group; status tag "−" (no confirm, strips the tag from every animal); room, rack, terrarium; log rows; quarantine Remove record (no confirm), checks, tests, treatments; photo Remove and Clear cover; alias rows; appointment Remove; vault entry; Clear egg record and Clear hatch record; hatch redo (deletes the hatchlings); Batch cart Clear All and Remove; Delete my account. |
| Reset or restore | Return to Defaults (dev); ID wizard reset; label-size reset; appearance resets; vault Restore; Choose backup file and Import legacy JSON (replace data); Compress existing photos (rewrites photos); Reset Advisor. |
| Import | MorphMarket CSV; generic CSV/XLSX; Upload PDF and paste text; alias Import JSON; Quick Add "Update Fields" (it parses into the form only, but sits in the same family). |
| Cloud | Sync cloud database; the Not synced pill (navigates only, but the topic covers it). |
| Marketplace | Publish to Marketplace; For Sale plus Save changes (auto-publish and unpublish on save). |
| Lab | Order Genetic Test, Add to Batch, Submit Order (both places), Cancel Order. |
| Plan | Change plan. Checkout does not exist. |
| Google | Connect Google Calendar, Sync to Google, Sync n months, Google Sign out. |
| Account | Change email, Change password, Sign out on this device, the AuthGate Sign out, Download my data, Delete my account, Keep my account. |
| Outward but harmless | Run Advisor (fetches market signals from the web); all exports, prints, PDFs, QR, .ics and Copy report. These are fine to explain. None is a do-step in a tour. |

## 3. Files to add

All new files are under `breeding-app-breeder/` unless shown otherwise.

```
src/features/help/
  helpTypes.ts            HelpTopic, CATEGORIES (ordered), Category
  registry.ts             t() builder, merges topics/*, HelpId type, getTopic, topicsByCategory
  help.ts                 help(id) -> { 'data-help': id }; tour(id) -> { 'data-tour': id }
  search.ts               searchTopics(query, resolve) - ranked, local
  helpGuard.ts            installHelpGuard(target, { isActive, onExplain }) -> uninstall
  helpStore.ts            mode / menu / manual / popover, plus persisted flags (serpentora.help.v1)
  topics/                 one plain-object file per category (gettingStarted.ts, dashboard.ts, animals.ts, ...)
  ui/HelpRoot.jsx         mounts pill, popover, menu, manual, tour layer; body class
  ui/HelpButton.jsx       the top-bar ? and DialogHelpButton for dialog headers
  ui/HelpMenu.jsx  ui/HelpModePill.jsx  ui/HelpPopover.jsx  ui/HelpManual.jsx
  ui/HelpHint.jsx  ui/TourInvitation.jsx  ui/TourLink.jsx
  ui/help.css             skin tokens only (--sk-*), no hex literals
  tours/tourTypes.ts      Tour, TourStep, TourContext
  tours/tourStore.ts      start/next/back/skip/exit/finish/dismissInvitation
  tours/findTarget.ts     tours/placePanel.ts
  tours/useTourEngine.ts  250 ms tick + rAF, arm-once, baseline, missing timer
  tours/TourLayer.jsx     ring + panel + live region
  tours/ownTargets.ts     OWN_TARGETS
  tours/essentials.ts     tours/areas/*.ts (one per area)
  tours/exampleAnimal.ts  the one offer
  __tests__/ registry, search, helpGuard (jsdom), sourceScan, honesty, tours,
             ownTargets, predicates, placePanel, tourStore
src/locales/en/help.json
tests/e2e/help-essentials.spec.ts
```

Edits to existing files:

- **App.jsx and feature components:**
  - add `help()`/`tour()` attributes, plus dialog roles and ids;
  - add a `?` in each dialog header;
  - mount `HelpRoot`;
  - add a small `TourContext` provider fed from the existing state;
  - add the "Take a short tour" links.
- **`src/index.jsx` or `AppEntry.jsx`:** install the guard before the first render.
- **The scanner hook:** add one line so it skips while Help Mode is on.
- **`src/i18n/index.js`:** add the `help` namespace for `en` only.
- **`package.json`:** add `jsdom` as a devDependency.

## 4. Manual sections (categories, in order)

| # | Category | Covers |
|---|---|---|
| 1 | Getting Started | what Serpentora is for, the ? button, Help Mode, the manual, tours, the help hint, the main navigation, how saving works (saved on this device as you go) |
| 2 | Dashboard | species dashboard, search everything, species cards, breeding table, the example collection |
| 3 | Animals | the list, filters, sort, tags, groups, cards and table, QR export and scan |
| 4 | Animal record | the editor, genetics terms (morph, het, possible het, visual, super), parentage, logs, photos, feed cycle, quarantine panel, reproductive panel |
| 5 | Adding and importing | add animal, quick add, species backfill, leucistic, import from MorphMarket, CSV/spreadsheet and PDF |
| 6 | Breeding Tracker | pairings, stages, clutch, incubator, egg box, hatch, completion, appointments, odds |
| 7 | Breeding Advisor | goal, run, suggestions, plan flowchart |
| 8 | Family Tree | views, passport |
| 9 | Calendar | navigation, filters, exports, Google Calendar |
| 10 | Feed Prep | |
| 11 | Spaces | rooms, racks, tubs, terrariums |
| 12 | Quarantine | |
| 13 | Lab testing | genetic tests, batch order, shed testing orders, Shed Test Terminal, certificates |
| 14 | Selling | For Sale and Publish to Marketplace, worded per section 9 |
| 15 | Account | My Account, plans, email, password, sign out, download my data, delete account |
| 16 | Settings | breeder info, ID wizard, aliases, exports, appearance, language |
| 17 | Data, Backups & Sync | backups, vault, restore, cloud sync, Not synced, reset (the handoff's "Data & Privacy", last) |

## 5. Where tour and help progress is stored

| What | Where |
|---|---|
| Active tour id, step index, baseline, Help Mode, menu, manual, popover | In-memory store for this window only. Never persisted, never synced. |
| `invited`, `completed[]`, `paused {tour, index}`, `helpHintDismissed` | localStorage `serpentora.help.v1`, device-local like `quarantineNotice`. It is not part of `plannerSyncState`, so it never reaches the backend. Tabs of one browser share it, which matches the handoff's "shared settings". Another device starts fresh, which is acceptable and honest for v1. |

## 6. The essentials tour (`essentials`, "Get to know Serpentora")

This tour must finish at 390px and on desktop. Phone and desktop controls carry the same `data-tour`
id, and `findTarget` takes the visible one.

| Part | Step | Kind | Target | Done when |
|---|---|---|---|---|
| 1 · Finding your way | Welcome: what Serpentora keeps, and that this tour has you do the real thing and never changes anything for you | info | (note) | |
| | The tabs | info | `main-nav` (desktop row and phone bottom nav) | |
| | Open a species | do | `species-card` (route: dashboard) | `tab === 'animals'` and a species is open |
| | These are example animals until you add your own (shown only when `isDemoCollection`) | info | `demo-banner` or the animals header | |
| 2 · Your first animal | Press Add animal | do | `add-animal` | dialog `add-animal` is open |
| | Add one real animal, small is fine. **Offer:** "Add an example animal instead" | do | `dialog` | real (non-demo) animal count > baseline |
| 3 · Its record | Open its record | do | `card-edit` | dialog `edit-animal` is open |
| | Genetics: morph, het, possible het | info | `animal-genetics` | |
| | Nothing is kept until Save changes | info | `animal-save` | |
| | Close the record (Save changes or Cancel) | do | `dialog` | no dialog open |
| | Log a feed from its card | do | `card-activity-feed` | total feed logs > baseline |
| 4 · Breeding | Open the Breeding Tracker | do | `nav-pairings` | `tab === 'pairings'` |
| | Press New pairing | do | `new-pairing` | dialog `create-pairing` is open |
| | Choosing a male and a female, and the Breeders group. "This is your choice: close it if you are not ready." | info | `dialog` | |
| | Close it, or add the pairing if you have a real pair | do | `dialog` | no dialog open |
| | From pairing to hatchling: ovulation, pre-lay shed, eggs laid, incubator, hatch | info | `pairings-subtabs` | |
| 5 · Your records are yours | Bringing a collection in: Import animals (explained only, "This tour never does it for you.") | info | `import-animals` (route: animals) | |
| | Saved on this device as you go; backups and cloud sync live in Settings | info | `nav-setup` | |
| 6 · Help | Press ? any time: Explore, the manual and every tour live there | info | `help-button` | |

That is 19 steps in 6 parts: 9 do and 10 info.

**The one offer.** "Add an example animal instead". It adds one animal named "Example animal" with
id `EXAMPLE-1` to the open species, through the same path the Add dialog uses. Muted line: "It adds
one ordinary animal named ‘Example animal’. Delete it any time from its card. While it exists, the
built-in example collection steps aside." That last sentence is existing behaviour, said out loud.

## 7. Area tours (2 to 6 steps each, started from the screen header link)

| Tour | Steps (do = the keeper acts; nothing outward is a do) |
|---|---|
| `tour-dashboard` | search everything (do: type), species cards (info), breeding table counts (info), New animal & species (info) |
| `tour-animals` | Males/Females/Groups (do: switch), search (do: type), Cards/List (do: switch), tags and groups (info), Export QR and Scan QR (info), Import animals (info, explained only) |
| `tour-animal-record` | genetics (info), parentage (info), logs (do: open the Feeds section), photos (info), For Sale and Publish (info, explained only), Order Genetic Test (info, explained only) |
| `tour-breeding` | sub-tabs (do: open Incubator), a pairing card (do: expand), lifecycle buttons (info), completion (info), Delete (info, explained only) |
| `tour-advisor` | goal (info), Run Advisor looks up market signals online (info, explained only), Convert to Plan creates a pairing (info), the plan flowchart (info) |
| `tour-family-tree` | views (do: switch view), Switch Snake (info), Pedigree Passport (info; Health and Files are not available yet) |
| `tour-calendar` | month (do: next month), filters (do: untick one), exports (info), Google Calendar (info, explained only) |
| `tour-feed-prep` | open Feed Prep (do), pick animals (do: tick one), Copy report (info) |
| `tour-spaces` | rooms (info), racks and tubs (info), assigning an animal (info), deleting a room (info, explained only) |
| `tour-quarantine` | filters (do: switch), a record (info), Log check (info), Mark cleared (info), Read the notice (do: open it) |
| `tour-lab` | Order Genetic Test, Batch Order, Shed Testing Orders, certificates: all info. Ordering is explained only. |
| `tour-settings` | sub-tabs (do: open Appearance), Language (info), Data exports (info), Backups and sync (info, explained only), My Account (info, explained only) |

That is 13 tours in all, counting essentials.

## 8. Where the handoff does not fit Serpentora, and the proposed resolution

1. **"A typo in `help('…')` fails type-checking."** `.jsx` is not type-checked (`checkJs:false`), and
   App.jsx is 29k lines. **Resolution:** keep `HelpId` derived from the registry for `.ts`/`.tsx`
   callers, and make the source-scan test the gate for `.jsx`. Any unknown id fails `npm test`. The
   step 1 done-criterion becomes "a typo fails `npm test` (and `tsc` in `.ts` files)".
2. **No DOM test environment.** **Resolution:** add `jsdom` as a devDependency. Guard and engine tests
   use `// @vitest-environment jsdom`; every other test stays on node.
3. **No top-layer dialogs, about 40 hand-rolled overlays, z-index up to 10070.**
   - Rendering help *inside* the dialog is unnecessary here, because nothing is top-layer. Help UI
     renders in one body portal above the highest z-index.
   - Two parts of the handoff need dialogs to be recognisable: `findTarget`'s "only inside the open
     dialog" scoping, and "every dialog has its own ?".
   - **Resolution, step 3:** every overlay root gets `role="dialog" aria-modal="true" data-dialog="<id>"`
     and a `<DialogHelpButton/>` in its header. A source-scan test fails if an overlay has none.
     Screen readers gain from this too.
4. **The hardware-scanner listener runs on `window` capture,** ahead of a `document`-capture guard.
   **Resolution:** install the guard on `window` capture before React mounts, so it is registered
   first, and make the scanner hook skip while Help Mode is on. The signature stays
   `installHelpGuard(target, opts)`.
5. **No router.**
   - A step's `route` is `[tab, subView?]`, and "Take me there" calls one `navigate(route)` adapter
     over `setTab`, `openSetupTab` and the sub-view setters.
   - Species-scoped tabs open the last-used species, else the first one. If there is no species,
     the `missing` text says to open one from the Dashboard.
6. **No single AppData.** **Resolution:** `TourContext.data` is assembled from the existing state
   (snakes, pairings, spaces, quarantine) by a provider inside `BreedingPlannerApp`. `modal` is the
   top-most open `[data-dialog]`, and `view` holds the few sub-view flags.
7. **"A new user: no data yet."** A Serpentora account is never empty; it starts with the demo
   collection. **Resolution:** "no data yet" means `isDemoCollection`. The invitation shows then,
   after 900ms, when no dialog is open, no tour is running and the keeper has not been invited.
8. **Phone nav gaps (fixed by `5470aed`, kept for history).** The phone bottom nav has no Dashboard, and its Animals and
   Breeding items bounce back to the dashboard when no species is open. The essentials tour at 390px
   would stick on those.
   - **Proposed, needs your yes:** in step 7, make the phone Animals and Breeding items open the
     last-used species, else the first one, as desktop does after a species pick.
   - Do not add a Dashboard item. The species bar's "All species" already returns there.
9. **Strings.** All help text is i18n keys in a new `help` namespace, English only.
   - `check-app-locales` ignores the namespace until P2.9 adds `help` to the shared `settings.json`
     and translates it, so `i18n:verify:apps` stays as it is today.
   - "Serpentora" stays a literal brand in every value.
   - A topic's title reuses the control's own key where it has one (`nav.pairings`,
     `actions.addAnimal`, …), so it is the visible name exactly.
   - Hard-coded controls get a `help:title.<id>` key with today's exact English.
10. **Honesty for Serpentora.** The honesty test fails if any topic or tour text contains:
    - a buyer-side or public certificate lookup ("verify online", "buyers can verify"), unless
      `breeding-app-public/src/pages/VerifyCertificatePage.jsx` exists;
    - live payments, checkout, trials or upgrade purchase;
    - the marketplace as live or launched ("sell on Serpentora", "your listing is live");
    - iOS, App Store or iPhone;
    - "export to MorphMarket";
    - encryption, "never leaves your device", "only on this device", "private by default", or
      automatic or real-time sync.

    It also asserts the claims that must be there:
    - import is MorphMarket CSV in only;
    - a prediction is a probability;
    - work is saved on this device as you go;
    - cloud sync is something you run or that runs when signed in, and sends your records to the
      Serpentora server.

    These must be checked against `runCloudBreederSync` while writing the topics. Wording is pinned there.
11. **Things that exist but do not work as their label suggests.** Help never papers over these;
    each is listed for the tracker:
    - Advisor **Accept** is a no-op. Its topic will say only that it marks the suggestion, and only if
      that proves true; otherwise the topic says it has no effect yet.
    - Family Tree **Health** and **Files** say "coming soon".
    - PairingsSection's fallback title "Serpentora (N)" and its broken empty-state string.
    - Quarantine **Remove record** and the tag "−" delete without a confirm.
12. **Run Advisor is outward:** it fetches web search results for market signals. It is explained,
    never a do-step.
13. **Destructive-title test.** The banned do-step words are extended for Serpentora: connect, sign out,
    delete, remove, reset, restore, import, sync, publish, order, submit, cancel order, change plan,
    pay, clear.
14. **Global shortcut.** Alt+G returns focus to the tour panel. Nothing in the app binds it today.
15. **E2E "fresh account".** There is no fresh-account helper, and the suite already needs the local
    backend.
    - **Resolution:** the spec registers a unique account through the existing register API. If the
      email-verification gate blocks it, the fallback is the seeded breeder with cleared browser
      storage and a routed empty snapshot.
    - "Changes no stored data" is asserted two ways: localStorage is byte-identical before and after
      each Help-Mode press, and no non-GET API request fires.
    - This needs no backend change. If it turns out to need one, I stop and ask.

## 9. Topics P3.2 ("One word for one thing") will rename

*History: P3.2 landed in `69dcd73` before the build started; topics use the new labels.*

At planning time P3.2 had not landed (`t-one-word` still failed). The topics use today's labels, and these are the ones
whose titles or wording P3.2 will change:

| Today | Topics affected |
|---|---|
| "For sell" tag | `tag-filter`, `animal-tag`, `selling-for-sale` |
| "Import snakes from text" | `import-panel` |
| "Breeding Tracker" (desktop) vs "Breeding" (phone) | `nav-pairings` |
| "New pairing" vs the "Create pairing" dialog vs "Add pairing" | `new-pairing`, `create-pairing-dialog` |
| "Active projects" vs "Active pairings" vs "Breeding projects" | `pairings-subtabs`, `pairings-active`, `export-breeding-projects` |
| "Shed Test Terminal" vs "Shed Test" | `nav-shed-terminal` |
| "Feed Prep" vs "Feed preparation" vs "Feed Cycle" | `nav-feed-prep`, `feed-prep-dialog`, `animal-feed-cycle` |
| snake vs animal ("Edit snake", "Choose snake", "Assign snake", "Snake selection", "All snakes", "Switch Snake") | `spaces-assign`, `terrarium-assign`, `feed-prep-select`, `qr-export-scope`, `family-switch-snake` |
| Sire/Dam vs Male/Female | `pairing-sire`, `pairing-dam`, `pairing-edit` |
| the pairing Delete button uses key `clutch.delete` | `pairing-delete` |

Because titles reuse control keys, most of these rename themselves when P3.2 lands. The rest are
caught by the title test, which compares each title with the control's rendered key.

## 10. Build steps, and what ends each one green

After every step, in `breeding-app-breeder`, run `npm run typecheck`, `npm test` and `npm run lint`,
plus the touched Playwright specs. Each step is one commit, "Help system N/7: <name>".

1. **Registry and help() helper.** Types, categories, builder, merged registry, the `help` namespace,
   and the Getting Started topics. Registry tests pass.
2. **installHelpGuard.** The full event table, with fake-DOM (jsdom) tests.
3. **Help Mode UI.**
   - The `?` in the top bar (desktop and phone) and in every dialog; the Help menu, pill and popover;
     the body class and CSS.
   - Dialog roles and ids, with the overlay-coverage test.
   - Checked in the browser at desktop and 390px, then `impeccable critique` run on it.
4. **The manual.** Contents, topic view, Back, ranked search, with the search tests.
5. **Coverage pass.** `help()` on every control and screen header; every topic written; source-scan
   and honesty tests. No control shows the "no topic" fallback.
6. **Tour engine and UI.** Store, `findTarget`, `placePanel`, ring and panel, missing targets with
   "Take me there", keyboard and the live region. Placement and store tests pass, and a two-step
   test tour runs.
7. **Tours and onboarding.**
   - The essentials tour and the area tours; `OWN_TARGETS`; the invitation, hint and links.
   - `tests/e2e/help-essentials.spec.ts`; the phone-nav fix if approved.
   - Then the `emil-design-eng` motion pass and a final browser pass.

## 11. plan-check

`f-help-system` in `scripts/plan-check.mjs` passes when four things exist (tracked) in
`breeding-app-breeder/src`:

- the help registry (`features/help/registry.ts`);
- `installHelpGuard`;
- the tour engine (`useTourEngine`);
- a test that references `OWN_TARGETS`.

## 12. Reuse outside this scope, later

- **Android (`MobileApp.jsx`).** It is React in a Capacitor WebView, so it is still a DOM.
  - The registry, search, guard, tour engine and placement work unchanged.
  - It needs its own `help()`/`tour()` attributes and a `mobile` topic file for controls that differ.
  - Its `?` sits in its own header. Phone placement already falls back to corners.
- **Lab, marketplace and admin.** When a second app adopts this, move the framework-free core (types,
  builder, search, guard, `findTarget`, `placePanel`, tour store) into `breeding-app-shared/src/help`.
  Each app keeps its own topic files, tours and `help.json`. Do not move the core before then: one
  consumer does not justify a shared API.
- **Public site.** No Help Mode. Its only plausible reuse is the read-only manual and search as a
  public "How it works" page, filtered to topics that pass the honesty test.

## 13. Outcome (2026-10-07)

- 732 topics in 17 sections; 884 help ids in the source; every app window (39) is a dialog with its
  own ?. 14 tours: essentials (18 steps, 6 parts), 12 area tours and "Using help".
- English only, in `locales/en/help.json`; `check-app-locales.cjs` treats breeder `help` as an
  English-only namespace until P2.9 translates it.
- Changes from this plan made while building:
  - The feed step of the essentials tour moved into the record (+ Add in Feeds, then Save
    changes): a card's quick-add only opens from a tile that already has an entry.
  - A tour step can name controls the panel must keep clear of (`avoid`) and can leave the page
    unscrolled (`noScroll`); placePanel caps the panel to the free band on small phones.
  - One "Take a short tour" link row above each screen, plus links inside the record and Feed
    Prep windows, instead of one per screen header.
- Reported by the coverage pass and NOT fixed here (each topic describes what the code does):
  - Deleting an animal deletes its pairings, while the confirm says "detaches".
  - The record's Open family tree discards unsaved edits; photos, publish, add status and new
    group act at once and Cancel does not undo them.
  - No confirm, no undo: status "−" (strips a status from every animal), pairing Delete, Generate
    5 months, Clear egg/hatch record, appointment Remove, rack and terrarium Delete, quarantine
    Remove record, lab queue Remove and Clear All, alias Delete, Restore and Import legacy JSON,
    ID wizard / appearance / label resets.
  - A restore is not a true replace while signed in: the next sync merges it with the account.
  - Advisor Accept does nothing; Run Advisor's web search provider is inert in the browser build.
  - Saving a hatchling deletes the whole demo collection.
  - The QR preview window can never be opened; the phone status-filter chip's x does nothing; both
    search clear buttons are labelled "Clear filters"; Breeder info Save saves nothing extra.
  - Calendar: one male's appointments are shifted at least 3 days apart and exported shifted;
    Upcoming misses next month; the Google connection is lost on reload.
  - Spaces: tub numbers run left to right while the form hint says top-right downward; an
    animal can sit in a rack and a terrarium at once; two RoomModal labels use the wrong keys.
  - Generic CSV without headers reads unknown sex as Female.
  - Visible app strings with em dashes (hatch window, quarantine editor help, source options).
