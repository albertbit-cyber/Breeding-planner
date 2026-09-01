# Breeding Planner — Product & UI Design Brief

This document exists to brief a designer (or a design agency) who has not seen the product before.
It describes what the product is, who uses it, every surface it ships as, and the domain concepts
that shape the UI. For the existing visual system (colors, type, spacing, components already in
place), see [`VISUAL_LANGUAGE.md`](../../VISUAL_LANGUAGE.md) — that file is the source of truth for
tokens and should be read alongside this one, not duplicated by it.

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

It runs as a responsive web app, an Electron desktop app (Windows/macOS/Linux), and a Capacitor
mobile app (iOS/Android). The breeder app is **local-first**: it works fully offline with data in
local storage, and optionally syncs to a shared backend for multi-device use, the marketplace, and
lab testing (which cannot work offline).

---

## 2. The six surfaces (who sees what)

Think of this as one product family, not one screen. A designer should treat each as a distinct
audience with a distinct job, while sharing one visual language (see §6).

| Surface | Audience | Folder | Deployed as |
|---|---|---|---|
| **Public marketing site** | Prospective customers, logged-out visitors | `breeding-app-home` | Marketing website + login/register/pricing |
| **Breeder app** | Reptile breeders (the primary paying customer) | `breeding-app-breeder` (canonical), also `src` in repo root | Web, Electron desktop, Capacitor Android/iOS |
| **Marketplace** | Breeders browsing/selling animals (buyer + seller in one surface) | `breeding-app-marketplace` | Embedded in breeder app + standalone web |
| **Lab portal** | Lab technicians processing genetic test orders | `breeding-app-lab` | Web + Capacitor Android app for lab techs |
| **Admin portal** | Internal platform staff (support, moderation, billing ops) | `breeding-app-admin` | Web only, admin-role-gated |
| **Mobile shell** | Breeders in the field (phone-first subset of the breeder app) | `breeding-app-breeder/src/features/mobile` | Capacitor Android/iOS, also a web route |

All five app-facing surfaces (excluding public) are logically one product behind one login; a user's
`role` (`breeder` / `lab` / `admin`) determines which portals they can enter, and a breeder can also
be a marketplace seller.

---

## 3. Domain concepts a designer needs (glossary)

These recur across almost every screen and drive layout decisions (data density, chip/badge use,
color-coding, print-safe layouts):

- **Morph / het / genetics string** — a snake's visual appearance (morph, e.g. "Pastel Clown") plus
  invisible carried traits ("het", e.g. "Het Pied", or probabilistic "66% Het Pied"). Genetics are
  entered as free text and parsed/normalized (aliases, shorthand like `BEL` or `OD` expand to full
  gene names via user-managed alias tables). Expect genetics to render as **tag/chip lists**, often
  many per animal, so cards and table cells must handle wrap/overflow gracefully.
- **Punnett square / breeding odds** — given two parents' genetics, the app computes probability
  distributions of offspring outcomes (per-gene odds, combined visual odds, projected hets). This
  shows up as **percentage-labeled outcome grids/lists** in pairing details and the Breeding
  Advisor — needs to read clearly at a glance, not just as raw numbers.
  Grid Advisor.
- **Pairing → breeding cycle → clutch → incubation → hatchlings** — the breeding project lifecycle:
  a male+female pairing has scheduled appointments, then observed lock/ovulation/pre-lay-shed
  events, then a clutch (egg count, fertile eggs, slugs), then an incubation countdown, then
  hatchlings linked back to the parents. This is inherently a **timeline/stage-progress** UI
  problem (appointments calendar, stage badges, countdown/progress bars).
- **Spaces hierarchy** — Room → Heat Rack (with slots) / Terrarium → occupant. This is a **spatial /
  occupancy-grid** UI problem: designers should think rack-of-slots visualizations, occupied vs.
  empty states, and quick "where is this animal" lookups.
- **Shed testing / lab certificates** — a breeder orders a genetic test on an animal, ships a
  physical shed-skin sample with a **printed QR label**, a lab tech scans it, enters results, and a
  certificate (with a verification code) is generated and shown back to the breeder. This spans two
  very different UI modes: a breeder-facing lightweight order/status/certificate view, and a
  lab-facing operational queue (intake → result entry → completed) with **physical print layouts**
  (see below).
- **Physical print layouts (labels & PDFs)** — the app generates real printable artifacts:
  QR sample labels, shipping labels, clutch cards, animal PDFs, pairing/appointment sheets. These
  are millimeter-precise layouts (safe margins, QR min/max size, auto-shrinking font-to-fit) — a
  designer should treat these as a distinct print-design deliverable, separate from screen UI, with
  real physical constraints (label sizes as small as ~50×25mm, side-by-side vs. stacked variants).
- **Marketplace listing / store** — a listing has species, category, sex, birth date, weight,
  genetics, price/currency, availability, location, shipping/pickup flags, and photos. Sellers have
  a storefront with tabs for Available / Reserved / Sold / About / Reviews / Terms.
- **Groups & status tags** — animals are organized by free-form groups (e.g. "2026 Holdbacks") and
  user-defined status tags (Active, Holdback, Grow-out, Breeder, Quarantine, For sell, Sold) that
  double as the primary color-coded filter/badge vocabulary throughout the breeder app.
- **Reproductive intelligence** — per-female breeding-history analytics (lock dates, cycle
  intervals, predicted next-lock windows with confidence) surfaced as an "Overview / Cycles /
  Predictions" panel inside the animal editor.

---

## 4. Surface-by-surface feature inventory

### 4.1 Breeder app (the core product)

Top-level tabs: **Animals · Spaces · Breeding Planner · Breeding Advisor · Shed Test Terminal ·
Calendar · Settings.** (A **Family Tree** pedigree graph and **Reproductive Intelligence** panel are
also present, reachable from an animal record.)

- **Animals** — the primary database. Card view and list view; sub-filters for All/Males/Females/
  Groups; global search; status tags. Add-animal supports a "quick add" free-text parser (paste a
  loose description → structured fields) alongside manual entry. Card/list rows carry: photo, name,
  ID, sex, birth date, genetics (chips), weight, group, price (if for sale), status, and quick
  inline logging shortcuts for feed/weight/shed/cleaning/medication. Full editor per animal covers
  identity, genetics, weight, price, group, pairing links, full log history, photo gallery, PDF
  export, QR label, and "Order Genetic Test." Bulk **feed-prep** tool groups selected snakes into a
  defrost report by food type/size.
- **Spaces** — Rooms → Heat Racks (slot grid) / Terrariums. Occupancy-aware slot assignment
  (prevents double-placement). This is a layout/visual-hierarchy screen more than a data-table one.
- **Breeding Planner** — Pairings in Active / Completed / Incubator views. Pairing detail =
  appointments (auto-generated 5-month schedule), lifecycle milestones (ovulation, pre-lay shed,
  clutch date, egg counts), genetics-odds calculator output, clutch-card PDF export, pairing QR
  labels. Only animals tagged into a "Breeders" group are eligible to pair — this constraint should
  be visible/discoverable in the UI, not just enforced silently.
- **Breeding Advisor** — natural-language breeding-goal input (e.g. "I want to make clown desert
  ghost with pastel and possible het pied") → ranked pairing suggestions from the collection, each
  showing goal-success %, projected visuals/hets, and next-gen plan hints. This is the most
  "AI/recommendation-feed" like screen in the app.
- **Shed Test Terminal** — breeder-side view of lab order status, label PDFs, results, and
  certificates (read-mostly; the operational work happens in the Lab portal).
- **Calendar** — month view combining care events (feed/weight/shed/clean/med) and breeding events
  (appointments, clutch actions), with category toggles and per-sire filtering; exports to `.ics`
  and spreadsheet/appointment-sheet formats.
- **Settings** — breeder profile/branding (incl. logo, reused on PDFs/labels), ID-generation wizard
  (token-based ID templates with live preview), morph/gene alias managers (JSON import/export),
  animal/pairing exports (PDF/XLSX/CSV with field selection), **Appearance** (theme/palette/font/
  density presets — see §6), Backups (manual + scheduled auto-backup + a versioned backup vault),
  and Language (10 languages supported).

### 4.2 Marketplace

Public-ish browse/search of listings (species, category, price range, sort), a listing detail
modal, contact/inquiry form, and per-seller store panel (Available/Reserved/Sold/About/Reviews/
Terms tabs). Sellers get an in-page seller dashboard and store-settings form. Listing creation is a
multi-section form: basic info → animal details → genetics → pricing & availability → location &
logistics → photos.

### 4.3 Lab portal

An operational queue tool for lab staff, distinct in tone from the breeder app — more
dashboard/table/workflow-status oriented. Pages: Dashboard, All Shed Orders, Sample Intake (QR
camera scan), Result Entry, Completed Tests, Admin Oversight, Test Catalog, Pricing & Logic, Order
Details (6-step workflow progress). Ships as its own Capacitor Android app for lab techs, with a
persistent bottom tab bar (Dashboard/Orders/Scan/Results/More) and a global full-screen QR scanner
that routes directly to the correct next step (intake vs. result entry vs. read-only completed
view) based on the scanned order's status.

### 4.4 Admin portal

Internal back-office, dark-navy dashboard aesthetic today (see §6 for the inconsistency this
creates). Sidebar groups: Dashboard, Users (all/pending-verification/suspended, user detail),
Breeders (applications, verified breeders), Subscriptions (tier overview, tier editor), Reports
(open reports, marketplace disputes, message reports), Marketplace (listing moderation), Labs (lab
accounts), Messages (announcements), Settings (GDPR tools). Almost entirely tables, filters, and
detail/drill-in pages — a classic admin-CRUD information architecture.

### 4.5 Mobile shell (breeder, phone-first)

A deliberately reduced, phone-optimized subset of the breeder app for field use: `terminal` (QR
scan + recent animals + quick logging), `animals`, `breeding` (pairing stage progress), `tasks`,
`rack` (read view of synced spaces), and `more` (settings/sync/appearance). The animal profile has
its own tab set: Overview / Feed / Details / Logs / Photos / Breeding. Designed around one-handed,
scan-first workflows (barn/rack-side use), not full data entry.

### 4.6 Public marketing site

Standard marketing site: hero, feature grid (Animal management, Genetics calculator, Breeding
records, Shed testing & lab, Marketplace, AI tools), 3-step "how it works," pricing, login/register.
Uses its own distinct "editorial" visual style (near-black + gold accent, cream background —
deliberately different from the in-app product; see §6).

---

## 5. Users & roles

| Role | Sees | Primary jobs-to-be-done |
|---|---|---|
| `breeder` | Breeder app, marketplace, mobile | Record-keeping, planning breeding projects, ordering tests, selling animals |
| `lab` | Lab portal (+ lab mobile app) | Receive samples, enter results, manage test catalog/pricing |
| `admin` | Admin portal (+ everything else) | Platform operations: users, verification, billing tiers, moderation, GDPR |

Subscription tiers gate some breeder features (feature-access guards redirect to the pricing page).

---

## 6. Existing visual language — current state and the gap to close

The canonical design-token system (colors, type, spacing/density, radius, motion — all as CSS custom
properties, with 6 user-selectable presets including high-contrast and low-vision options) lives in
`breeding-app-breeder` and is documented in full in [`VISUAL_LANGUAGE.md`](../../VISUAL_LANGUAGE.md).
**Read that file for exact values** — summarized here only so this brief stands alone:

- Primary `#0ea5e9` / secondary `#2563eb` / accent `#f59e0b`, light neutral background, dark-navy
  text, fixed semantic colors for success/error/warning/danger/neutral.
- Font: Space Grotesk (with several accessibility/branding alternates); base 16px; 8px default
  corner radius; buttons/badges always pill-shaped regardless of radius preset.
- A **density** toggle (compact/comfortable/spacious) scales all padding/row-height together — this
  matters a lot given how data-dense the Animals/Spaces/Pairings tables are.
- End users can re-skin the breeder app via presets without touching components, because everything
  reads from the token variables rather than hardcoded hex.

**The gap:** only the breeder app actually implements this system today. The other four in-product
surfaces have each drifted into their own hardcoded palette:

- **Admin** — dark-navy sidebar (`#101828`), ad hoc status colors.
- **Marketplace** — an independent forest-green brand (`#12392b` / `#14533f` / `#e7f5ee`).
- **Lab** — no real theme file of its own; copy-pasted hex values from admin, so the two silently
  drift apart over time.
- **Public marketing site** — a third, intentionally distinct "editorial" identity (near-black
  `#1c1c1a` + gold `#c8a840` accent, cream `#faf8f3` background) — this one is a deliberate brand
  choice for marketing, not drift, and can stay differentiated from the in-product apps.

**Design mandate:** treat breeder's token system as the one true design system for all
**in-product** surfaces (breeder, marketplace, lab, admin, mobile). The public marketing site is the
one surface allowed a separate identity. Any new design work should assign hex values to the
existing *roles* (primary/secondary/accent/background/card/text/status) rather than inventing new
ones, so it can be wired into the shared CSS variables incrementally rather than requiring a
big-bang re-theme.

---

## 7. Platform & technical constraints that shape the UI

- **Local-first + optional sync**: the breeder app must work with zero backend connectivity (local
  storage only). Sync status, "shared backend unavailable," and offline/degraded states are real UI
  states to design for, not edge cases — shed testing, marketplace, and multi-device sync
  specifically require the backend and should visibly communicate when they're unavailable.
- **Three runtime shells**: the same web build runs inside a browser tab, an Electron desktop window
  (no browser chrome), and a Capacitor WebView (phone-sized viewport, camera access for QR
  scanning). Designs need to hold up across a wide viewport range without assuming a browser
  chrome or hover states are always available (touch-first on mobile).
  - Known live gap: several screens (e.g. lab's dashboard order table, the order-details 6-step
    progress bar) were originally desktop-only Tailwind layouts (`hidden lg:block`,
    `overflow-x-auto`, fixed `min-w-[...]`) that had to be retrofitted for phone width. A full
    responsive audit of dense tables/wide layouts across lab and admin is a known open item.
- **Print is a first-class output, not an afterthought**: QR sample labels, shipping labels, clutch
  cards, animal/pairing PDFs, and appointment sheets are real physical artifacts with millimeter
  layouts, safe margins, and auto-shrinking text-to-fit logic. Any label/PDF redesign needs print
  dimensions (label stock sizes), not just screen mockups.
- **10 languages** are supported app-wide — avoid fixed-width text containers, icon-only buttons
  without accessible labels, and layouts that break with longer translated strings.
- **Accessibility presets already exist** (high-contrast, "visually impaired" preset, reduced-motion
  toggle mapped to `prefers-reduced-motion`) — new components should be checked against these, not
  just the default preset.
- **Data density is real**: breeders can have large collections (tens to hundreds of animals), so
  list/table views, genetics-chip overflow, and search/filter affordances need to hold up at scale,
  not just in 5-row demo data.

---

## 8. Where design effort would matter most right now

1. **Unify the four in-product surfaces** (admin, marketplace, lab, mobile) onto the breeder app's
   existing token system — highest leverage, lowest risk, since the system already exists and just
   needs adoption.
2. **Mobile/responsive audit** of lab and admin, which were built desktop-first — dense tables and
   wide fixed-width elements are the recurring failure pattern found so far.
3. **Genetics/Punnett-square outcome displays** (pairing detail, Breeding Advisor) are information-
   dense probability data that currently reads as raw percentages/lists — an opportunity for a
   clearer visual treatment (e.g. proportional bars, grouped by visual vs. het) without changing the
   underlying calculation.
4. **Print-layout system** (labels, certificates, clutch cards) is functionally solid but was built
   programmatically rather than art-directed — a good candidate for a dedicated print-design pass
   once the on-screen system is settled.
