# Breeding Planner — Complete Hand-off (for ChatGPT)

**Purpose of this document:** paste this whole file into a ChatGPT conversation to bring it up to
speed on the entire app in one shot — what it is, how it's built, what already exists, what's
mid-flight, and what's known-broken. Use it as the shared context before asking ChatGPT to design or
plan any new aspect of the product. It is self-contained; ChatGPT should not need anything else to
reason about the product, though it obviously can't read the live codebase itself.

This document describes the repo as of **2026-07-27**. Where it disagrees with older docs in this
repo (`docs/handoff/architecture.md`, `docs/handoff/product-spec.md`, etc. — dated 2026-04-25), this
document is newer and more accurate; those older files describe a pre-monorepo-split layout
(`src/App.jsx`, `server/`) that no longer exists at the repo root.

---

## 1. What the product is

**Breeding Planner** is a full-stack software suite for reptile breeders (primarily ball python
breeders — genetics coverage is built around morph/het terminology for that species, though the data
model is generic). It replaces the spreadsheets, paper cards, and group chats breeders currently use
to run a collection with one connected system covering:

- animal record-keeping (identity, genetics, health, weight, feeding, photos)
- physical housing management (rooms → racks → terrariums → slots)
- breeding project planning (pairings, incubation, clutches, hatchlings)
- a genetics engine that predicts morph/het outcomes from a pairing (Punnett-square math over a
  500+ gene database, including complex alleles like BEL)
- an accredited genetic-testing pipeline: breeders order shed-skin tests, a lab receives and
  processes physical samples via QR-coded labels, and results/certificates flow back and
  auto-update the animal's genetics
- a marketplace for breeders to list and sell animals, with per-seller storefronts
- a public marketing site, pricing/subscription tiers, and an admin back-office for the whole
  platform
- transactional email (verification, password reset, breeding reminders) and an account lifecycle
  (verify/reset/change-email) built on top of that
- per-female "reproductive intelligence" — personalized breeding-cycle predictions learned from a
  female's own history
- a family tree / pedigree graph across the whole breeding ecosystem

It runs as a responsive web app, an Electron desktop app (Windows/macOS/Linux), and Capacitor mobile
apps (iOS/Android). The breeder app is **local-first**: it works fully offline with data in local
storage, and optionally syncs to a shared backend for multi-device use, the marketplace, and lab
testing (which cannot work offline).

---

## 2. Architecture & repo layout (current, verified against the filesystem)

The repo is a monorepo of **separate, independently-deployable apps**, not one SPA anymore. Each app
folder is its own Vite project with its own `package.json`, `railway.toml`/`netlify.toml`, and (for
some) its own Capacitor Android project.

```
breeding-app-backend/       Express + Prisma (PostgreSQL) API — the one real backend
breeding-app-breeder/       Main breeder app (web + Electron + Capacitor Android/iOS) — canonical
breeding-app-admin/         Admin/moderation back-office (web only)
breeding-app-lab/           Lab portal (web + its own Capacitor Android app)
breeding-app-marketplace/   Standalone marketplace app (web only)
breeding-app-public/        Public marketing site (web only)
breeding-app-shared/        Shared TS library (types, api client, constants, genetics) consumed by the others
```

Legacy/vestigial folders still present at repo root — do not treat these as active:

- `server/` — dead build-output stub (`dist/*.js` only, no source). The real backend is
  `breeding-app-backend/`.
- `apps/`, `packages/` — empty placeholders from an earlier migration plan, not tracked by git, no
  real content.
- `android/`, `ios/` (root) — stale Capacitor projects predating the app split; per-app Android
  projects now live in `breeding-app-breeder/android` and `breeding-app-lab/android`. Root's own
  Android build scripts are broken (they build against a `src/` that no longer exists).
- `electron/` (root) — still **actively used**: the desktop installer (`npm run dist:win` etc.)
  builds `breeding-app-breeder`, then copies its output into root `build/` so root's
  `electron-builder` config can package it. Root `package.json` is a thin orchestration/tooling layer
  now (desktop packaging + repo-wide i18n checks + PDF generation), not an independent app.

### Backend (`breeding-app-backend`)

Express + Prisma + Zod, PostgreSQL, single Railway process, no Redis/queue system (email delivery
uses a Postgres-based outbox worker instead, described below).

Route groups (`src/routes/*.ts`): `authRoutes` (login/register/refresh/logout/verify/reset),
`authFoundationRoutes` (low-level role-check probes), `adminRoutes`, `breederDataRoutes` (synced
animal/pairing/clutch/planner snapshot), `profileRoutes`, `labRoutes`, `orderRoutes` (shed-test
orders), `marketplaceRoutes`, `listingRoutes` (legacy simple listings), `inquiryRoutes`,
`savedSearchRoutes`, `familyTreeRoutes`, `reproductiveRoutes`, `subscriptionRoutes`,
`notificationRoutes`, `emailRoutes`, `emailWebhookRoutes` (Resend delivery/bounce webhooks),
`mobileRoutes`, `systemRoutes` (`/api/health`).

Data model highlights (~45 Prisma models) — grouped by domain:

- **Identity/auth**: `User`, `AccountToken` (verify/reset/email-change tokens), `RefreshSession`,
  `SecurityEvent`, `Profile`.
- **Core breeder data**: `Animal`, `Pairing`, `Clutch`, `BreederPlannerState` (full planner snapshot
  per user — this is how offline/local-first state syncs to the cloud).
- **Family tree**: `ParentRelationship`, `OwnershipHistory`.
- **Reproductive intelligence**: `ReproductiveCycle`, `LockEvent`, `ReproductiveAnalyticsCache`.
- **Marketplace**: `Listing`/`ListingInquiry` (legacy simple flow) plus the full
  `MarketplaceListing`/`MarketplaceMedia`/`MarketplaceStore`/`MarketplaceConversation`/
  `MarketplaceMessage`/`MarketplaceSale`/`MarketplaceReview`/`MarketplaceFavorite`/
  `MarketplaceUserBlock`/`MarketplaceMessageReport` domain.
- **Lab/testing**: `ShedTestCatalog`, `PricingConfig`, `ShedTestOrder` + related animal/test/result
  tables, `LabAccount`.
- **Subscriptions/billing**: `SubscriptionTier`, `FeatureCatalog`, `TierFeature`,
  `UserSubscription`, `UserFeatureOverride`, `UsageTracking`.
- **Admin/moderation**: `AdminAuditLog`, `Report`, `ListingModerationAudit`, `VerificationRequest`,
  `MarketplacePermission`, `GdprRequest`.
- **Mobile**: `MobileScanLog`, `MobileSyncQueue`, `UserDeviceSession`.
- **Email system**: `EmailJob`, `EmailEvent`, `NotificationPreference`, `EmailSuppression`.

### Deployment / environments

Two Railway environments exist: **staging** and **production**, each with its own backend + database.
Frontends are deployed to a mix of Railway and Netlify (each app folder has its own config; only
`breeding-app-marketplace` lacks a `railway.toml`, only `breeding-app-public`/`breeding-app-backend`
lack a `netlify.toml`). Every frontend reads its backend URL from `VITE_API_URL` at **build time**
(baked into the JS bundle, not runtime-configurable) — so mismatched staging/production URLs are a
recurring class of bug (see §7). Android builds similarly bake in the backend URL via
`.env.android-staging` / `.env.android-production` / `.env.android-development` at build time; an
already-installed APK does not pick up a new backend URL without a rebuild+reinstall.

---

## 3. The surfaces (who sees what)

One product family behind one login; a user's `role` (`breeder` / `lab` / `admin`, plus marketplace
`buyer`) determines which portals they can enter. A breeder can also be a marketplace seller.

| Surface | Audience | Folder | Deployed as |
|---|---|---|---|
| **Public marketing site** | Prospective customers, logged-out visitors | `breeding-app-public` | Marketing website + login/register/pricing |
| **Breeder app** | Reptile breeders (primary paying customer) | `breeding-app-breeder` | Web, Electron desktop, Capacitor Android/iOS |
| **Marketplace** | Breeders browsing/selling animals | `breeding-app-marketplace` | Embedded in breeder app + standalone web |
| **Lab portal** | Lab technicians processing genetic test orders | `breeding-app-lab` | Web + Capacitor Android app for lab techs |
| **Admin portal** | Internal platform staff (support, moderation, billing ops) | `breeding-app-admin` | Web only, admin-role-gated |
| **Mobile shell** | Breeders in the field (phone-first subset of the breeder app) | `breeding-app-breeder/src/features/mobile` | Capacitor Android/iOS, also a web route |

---

## 4. Domain concepts (glossary a designer or engineer needs)

- **Morph / het / genetics string** — a snake's visual appearance (morph, e.g. "Pastel Clown") plus
  invisible carried traits ("het", e.g. "Het Pied," or probabilistic "66% Het Pied"). Renders as
  **tag/chip lists**, often many per animal — cards/table cells must handle wrap/overflow gracefully.
- **Punnett square / breeding odds** — given two parents' genetics, the app computes probability
  distributions of offspring outcomes (per-gene odds, combined visual odds, projected hets). Shows up
  as percentage-labeled outcome grids/lists in pairing details and the Breeding Advisor.
- **Pairing → breeding cycle → clutch → incubation → hatchlings** — the breeding project lifecycle:
  pairing → scheduled appointments → observed lock/ovulation/pre-lay-shed events → clutch (egg count,
  fertile eggs, slugs) → incubation countdown → hatchlings linked back to parents. A
  timeline/stage-progress UI problem.
- **Spaces hierarchy** — Room → Heat Rack (with slots) / Terrarium → occupant. A spatial/
  occupancy-grid UI problem.
- **Shed testing / lab certificates** — breeder orders a genetic test, ships a physical shed-skin
  sample with a printed QR label, a lab tech scans it, enters results, and a certificate (with a
  verification code) is generated. Two very different UI modes: breeder-facing lightweight
  order/status/certificate view vs. lab-facing operational queue (intake → result entry → completed).
- **Physical print layouts** — real printable artifacts: QR sample labels, shipping labels, clutch
  cards, animal PDFs, appointment sheets. Millimeter-precise (safe margins, QR min/max size,
  auto-shrinking text-to-fit) — label sizes as small as ~50×25mm.
- **Marketplace listing / store** — species, category, sex, birth date, weight, genetics,
  price/currency, availability, location, shipping/pickup, photos. Sellers get a storefront with
  Available / Reserved / Sold / About / Reviews / Terms tabs.
- **Groups & status tags** — free-form groups (e.g. "2026 Holdbacks") and user-defined status tags
  (Active, Holdback, Grow-out, Breeder, Quarantine, For sell, Sold) — the primary color-coded
  filter/badge vocabulary throughout the breeder app.
- **Reproductive intelligence** — per-female breeding-history analytics (lock dates, cycle intervals,
  predicted next-lock windows with confidence), three-tier prediction fallback: personal history →
  collection averages → species defaults. Surfaced as an Overview/Cycles/Predictions panel inside the
  animal editor (gated to female animals only).
- **Family tree** — interactive pedigree graph (ReactFlow-based) with Tree/Horizontal/Descendants/
  Clutch/Universe views, ancestor/descendant traversal, ownership history, ownership/privacy filters.
- **Account lifecycle** — email verification, forgot/reset password, authenticated email/password
  change, all token-based (not JWT-stateless anymore) via a dedicated `AccountToken` table.
  `emailVerified` gates exactly two backend routes today (creating a listing, creating a lab order) —
  not the whole app.

---

## 5. Feature inventory per surface

### 5.1 Breeder app (the core product)

Top-level tabs: **Animals · Spaces · Breeding Planner · Breeding Advisor · Shed Test Terminal ·
Calendar · Settings**, plus a **Family Tree** pedigree graph and **Reproductive Intelligence** panel
reachable from an animal record.

- **Animals** — the primary database. Card/list views; sub-filters (All/Males/Females/Groups); global
  search; status tags. "Quick add" free-text parser (paste a loose description → structured fields).
  Cards/rows: photo, name, ID, sex, birth date, genetics chips, weight, group, price, status, inline
  log shortcuts (feed/weight/shed/cleaning/medication). Full editor: identity, genetics, weight,
  price, group, pairing links, log history, photo gallery, PDF export, QR label, "Order Genetic
  Test," Reproductive Intelligence panel (females), Family Tree link. Bulk feed-prep tool groups
  selected snakes into a defrost report by food type/size (does not track freezer inventory).
- **Spaces** — Rooms → Heat Racks (slot grid) / Terrariums, occupancy-aware slot assignment.
- **Breeding Planner** — Pairings in Active / Completed / Incubator views. Pairing detail = auto-
  generated 5-month appointment schedule, lifecycle milestones, genetics-odds calculator output,
  clutch-card PDF export, pairing QR labels. Only animals tagged into a "Breeders" group are eligible
  to pair.
- **Breeding Advisor** — natural-language breeding-goal input → ranked pairing suggestions from the
  collection, each with goal-success %, projected visuals/hets, next-gen plan hints.
- **Shed Test Terminal** — breeder-side view of lab order status, label PDFs, results, certificates.
- **Calendar** — month view combining care events and breeding events, category toggles, per-sire
  filtering; exports to `.ics` and spreadsheet formats.
- **Settings** — breeder profile/branding (logo reused on PDFs/labels), ID-generation wizard,
  morph/gene alias managers, exports (PDF/XLSX/CSV), **Appearance** (theme/palette/font/density
  presets, see §6), Backups (manual + scheduled + versioned vault), Language (10 languages),
  account verified/unverified badge + change email/password forms.

### 5.2 Marketplace

Browse/search listings (species, category, price range, sort), listing detail modal, contact/inquiry
form, per-seller store panel (Available/Reserved/Sold/About/Reviews/Terms). Seller dashboard +
store-settings form. Listing creation: basic info → animal details → genetics → pricing &
availability → location & logistics → photos.

### 5.3 Lab portal

Operational queue tool for lab staff. Pages: Dashboard, All Shed Orders, Sample Intake (QR camera
scan), Result Entry, Completed Tests, Admin Oversight, Test Catalog, Pricing & Logic, Order Details
(6-step workflow progress). Ships as its own Capacitor Android app (`com.breedingplanner.lab`) with a
persistent bottom tab bar (Dashboard/Orders/Scan/Results/More) and a global full-screen QR scanner
that routes directly to the correct next step based on the scanned order's status.

### 5.4 Admin portal

Internal back-office. Sidebar groups: Dashboard, Users (all/pending-verification/suspended, user
detail), Breeders (applications, verified breeders), Subscriptions (tier overview/editor), Reports
(open reports, marketplace disputes, message reports), Marketplace (listing moderation), Labs (lab
accounts), Emails (job queue + suppression list), Messages (announcements), Settings (GDPR tools).
Classic admin-CRUD information architecture.

### 5.5 Mobile shell (breeder, phone-first)

Reduced, phone-optimized subset for field use: `terminal` (QR scan + recent animals + quick logging),
`animals`, `breeding` (pairing stage progress), `tasks`, `rack` (read view of synced spaces), `more`
(settings/sync/appearance). Animal profile has its own tabs: Overview / Feed / Details / Logs /
Photos / Breeding. One-handed, scan-first workflows.

### 5.6 Public marketing site

Hero, feature grid (Animal management, Genetics calculator, Breeding records, Shed testing & lab,
Marketplace, AI tools), 3-step "how it works," pricing, login/register. Its own distinct "editorial"
visual identity, deliberately different from the in-app product.

---

## 6. Visual design system

Canonical token system (CSS custom properties: color, typography, spacing/density, radius, motion)
lives in `breeding-app-breeder/src/contexts/AppearanceContext.jsx`, documented fully in
[`VISUAL_LANGUAGE.md`](../../VISUAL_LANGUAGE.md) at repo root — treat that file as the source of
truth for exact values; summarized here so this doc stands alone.

- Color roles: Primary `#0ea5e9`, Secondary `#2563eb`, Accent `#f59e0b`, Background `#f6f7f9`, Card
  `#ffffff`, Text `#0f172a`. Fixed semantic colors for success/error/warning/danger/neutral.
- 6 selectable presets today: Default, Minimal, High contrast, Visually impaired, Dark breeder, Soft
  pastel — **plus a new Editorial preset added 2026-07-26** (near-black + gold, matching the public
  site's identity, applied to a 5-screen restyle as a first design pass).
- Font: Space Grotesk (fallbacks + accessibility/branding alternates: Inter, Roboto, Open Sans,
  Cormorant Garamond, IBM Plex Mono). Base 16px, line-height 1.6 default.
- Density toggle (compact/comfortable/spacious) scales padding/row-height together.
- Corner radius presets (2/8/16px), but buttons/badges/chips are **always pill-shaped** regardless.
- Motion: 250ms standard transition (0ms if reduced-motion), buttons scale 0.97 on `:active`.

**The gap (as of the last full design audit, 2026-07-12, partially closed 2026-07-26):** only the
breeder app fully implements this token system. Admin (dark-navy `#101828`, ad hoc status colors),
Marketplace (independent forest-green brand `#12392b`/`#14533f`/`#e7f5ee`), and Lab (no theme of its
own, copy-pasted hex from admin, silently drifting) have each drifted into their own hardcoded
palette. The public marketing site's separate "editorial" identity (near-black `#1c1c1a` + gold
`#c8a840`, cream `#faf8f3`) is a **deliberate** brand choice and should stay differentiated — don't
unify it with the rest. A first proposal to unify the in-product surfaces was implemented 2026-07-26
(Editorial preset + a 5-screen restyle); the remaining unification work across admin/marketplace/lab
is still open.

---

## 7. Platform & technical constraints that shape any design or feature work

- **Local-first + optional sync**: the breeder app must work fully offline (local storage). Sync
  status, "shared backend unavailable," and offline/degraded states need real designed states — shed
  testing, marketplace, and multi-device sync specifically require the backend.
- **Three runtime shells**: browser tab, Electron desktop window (no browser chrome), Capacitor
  WebView (phone-sized viewport, camera access for QR scanning). Designs must hold up across a wide
  viewport range without assuming hover states. Known live gap: several lab/admin screens were built
  desktop-first (`hidden lg:block`, `overflow-x-auto`, fixed `min-w-[...]`) and needed retrofitting
  for phone width — a few instances were fixed reactively (lab dashboard order table, order-details
  progress bar) but a full responsive audit of dense tables across lab/admin is still open.
- **Print is a first-class output**: QR sample labels, shipping labels, clutch cards, animal/pairing
  PDFs, appointment sheets — millimeter-precise, safe margins, auto-shrinking text-to-fit. Any
  redesign needs real print dimensions, not just screen mockups.
- **10 languages** supported app-wide — avoid fixed-width text containers and layouts that break with
  longer translated strings.
- **Accessibility presets already exist** (high-contrast, visually-impaired, reduced-motion) — check
  new components against these too.
- **Data density is real**: collections range into the hundreds of animals.
- **Backend URLs are baked in at build time**, not runtime env vars — every new deployable surface
  (or environment) needs its own correctly-configured build, and swapping environments requires a
  rebuild, not a config toggle. This has caused real staging/production cross-wiring bugs (§9).
- **No Redis/queue infrastructure, no WebSocket/SSE anywhere in the repo.** Email delivery uses a
  Postgres-based outbox + in-process polling worker. Lab↔breeder sync is polling-based
  (`useAutoRefetch`, ~15-30s). Keep this in mind before proposing anything that assumes real-time
  push — it would be new infrastructure, not a small addition.

---

## 8. Recent engineering work (roughly the last 3 months, most recent first)

- **2026-07-26 — Editorial design preset + 5-screen restyle**: first implemented output of the
  design-collaborator workflow (a "Claude Design" handoff document very similar to this one was used
  to brief an AI design collaborator, which proposed a new Editorial preset and restyled 5 screens;
  it was implemented). `docs/design/CLAUDE_DESIGN_HANDOFF.md` and `docs/design/APP_DESIGN_BRIEF.md`
  are the prior design-brief documents this hand-off builds on and updates.
- **2026-07-24/25 — Cloud sync 413 investigation (open, see §9)**: mobile photo-stripping and a
  request-size-limit bump did not fully resolve intermittent 413 errors on breeder cloud sync;
  diagnostic logging was added to capture real payload sizes from production before picking a fix.
- **2026-07-23 — Account email lifecycle**: registration + email verification, forgot/reset password,
  authenticated email/password change, staff-invite convergence onto the same flow, all rebuilt on a
  dedicated `AccountToken` table (replacing a dormant JWT-based verification flow and a broken
  `/auth/recover-password` route that was retired). `emailVerified` now gates exactly two routes
  (listing creation, lab order creation) as a deliberate narrow allowlist, not app-wide enforcement.
  Full design doc: `docs/architecture/account-lifecycle.md`.
- **2026-07-22 — Transactional email system**: provider-neutral email architecture (Resend behind an
  `EmailProvider` interface), Postgres-based durable job queue/worker, 7 notification-preference
  categories, templates for verification/reset/breeding-reminder/etc., Resend webhook handling for
  bounces/complaints. Full design doc: `docs/architecture/email-notifications.md`, operations runbook:
  `docs/architecture/email-operations-runbook.md`.
- **2026-07-10 — Lab mobile app**: a Capacitor Android wrapper (`com.breedingplanner.lab`) around the
  existing `breeding-app-lab` web app for lab technicians — same feature set as the browser portal
  (Incoming Orders, Sample Intake with QR scan, Result Entry, Completed Tests), not a bespoke mobile
  redesign. Debug-signed only so far.
- **Family Tree and Reproductive Intelligence** — both originally built as frontend-first features
  with mock data or as new isolated modules; both now have real backend integration wired
  (`familyTreeRoutes.ts`/`reproductiveRoutes.ts`, `ParentRelationship`/`OwnershipHistory` and
  `ReproductiveCycle`/`LockEvent`/`ReproductiveAnalyticsCache` Prisma models, real API calls from
  `useFamilyTreeData.js` and the Reproductive Intelligence panel — no longer mock data as of this
  writing).

---

## 9. Known open issues / explicitly deferred work

Be honest about these if asked to build on or design around them — don't assume they're finished:

- **Cloud sync 413 errors (OPEN, unresolved)**: some breeder accounts intermittently get
  "payload too large" on cloud sync even after photo-stripping and a 64MB limit raise. Root cause not
  confirmed; diagnostic logging (`[cloud-sync] 413 payload too large` in Railway logs) was added
  2026-07-24 to capture real numbers before choosing a fix. Don't re-propose "strip photos" or "raise
  the limit" — both already tried and insufficient alone.
- **Local dev DB migration drift (workaround in place, not fixed)**: a local-only Postgres migration
  checksum mismatch on `20260705120000_add_reproductive_family_tree` has been routed around three
  times now (via `prisma migrate diff` + hand-authored migrations instead of `prisma migrate dev`) for
  the email system and account-token additions. Not blocking, but worth a real fix if it starts
  blocking something that needs `migrate dev` specifically.
- **Root Android build pipeline is broken**: `breeding-app-breeder` and `breeding-app-lab` each have
  their own working Android build pipelines; the root-level one (`scripts/android-build.ps1`,
  `npm run build:android:*` at repo root) was never repointed after `src/` was removed from root and
  is effectively dead.
- **Lab and Marketplace frontends lack the new account-lifecycle pages**: verify-email,
  resend-verification, forgot/reset-password, and the unverified-account gate exist in
  `breeding-app-breeder` and `breeding-app-admin` only. The backend already supports all four apps
  identically — `breeding-app-lab`/`breeding-app-marketplace` just need the same
  `AuthGate.jsx`/`apiClient.ts` additions ported over (each app has its own independently-duplicated
  copy of these files, so this is a straightforward but real per-app task, not a shared-code fix).
- **No user-facing notification-preferences UI**: the backend (`preferencesService.ts`,
  `GET|PUT /api/emails/preferences`, 7 categories) exists but no frontend page lets a user manage
  their own preferences yet, in any app.
- **`unexpected_egg_laying` email template exists but isn't wired to a trigger** — the natural trigger
  point (`Pairing.completionReason`/`workflowStatus`/`completedAt`) is identified but not implemented.
- **Visual design unification across admin/marketplace/lab is partially started, not finished** — see
  §6. The 2026-07-26 restyle covered 5 screens as a first pass.
- **Lab/admin mobile-responsive audit is incomplete** — a few confirmed desktop-first layout bugs were
  fixed reactively (see §7); other screens flagged by the same grep pattern
  (`TestCatalogPage.jsx`, `PricingLogicPage.jsx`, `AdminOversightPage.jsx`, `CompletedTestsPage.jsx`)
  were not confirmed broken and were left alone.
- **Lab mobile app is debug-signed only, Android-only, not device-tested** — no release keystore, no
  iOS, only static verification performed (manifest/bundle inspection, not an actual device run).
- **Genetics/Punnett-square outcome displays are raw percentages/lists** — flagged as a high-value,
  low-risk design opportunity (proportional bars, grouped by visual vs. het) without touching the
  underlying calculation.
- **Print-layout system is functionally solid but programmatic, not art-directed** — a good candidate
  for a dedicated print-design pass once the on-screen system is settled.

---

## 10. What we'd want back from a design/planning conversation

If you're asking ChatGPT to design or plan a new aspect of the app, it's useful to tell it explicitly
which of these you want:

- A concrete color/type/component direction expressed as values for the *existing* token roles in
  §6 (not a new token system) — this is how the 2026-07-26 Editorial preset was scoped and it worked
  well.
- Example screen mockups/proposals for specific named screens (be specific — "the Animals list/card
  view," "a Pairing detail with genetics-odds display," "the Lab Sample Intake screen" — rather than
  "improve the UI").
- Explicit call-outs anywhere a proposal would require new component *behavior*, not just styling
  (e.g. anything implying real-time push, new backend fields, or new routes) — that changes the scope
  from a design task to an engineering task, and should be flagged as such rather than assumed.
- Ask it to flag anything ambiguous or where it would want a product decision before committing to a
  direction, rather than guessing silently — this document intentionally doesn't resolve every open
  question (e.g. the 413 root cause, exact scope of the responsive audit).

---

## 11. Where to point ChatGPT for more depth on a specific area

- Visual tokens, exact hex/spacing values: `VISUAL_LANGUAGE.md` (repo root)
- Prior design-brief documents (superseded by this one but still valid detail): `docs/design/`
- Account/email architecture: `docs/architecture/account-lifecycle.md`,
  `docs/architecture/email-notifications.md`, `docs/architecture/email-operations-runbook.md`
- User-facing manual: `docs/manuals/Breeding-Planner-User-Manual.md`
- App navigation map (hash routes, tab structure per surface): `NAVIGATION_MAP.md` (repo root)
- Older engineering audit (stale paths, but useful for historical decisions/risks):
  `docs/handoff/decisions-and-risks.md`
