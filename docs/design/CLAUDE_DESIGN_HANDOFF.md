# Handoff to Claude Design — Breeding Planner

You're being brought in as a design collaborator on an existing, shipping product. You have no
prior context on it — everything you need to know to propose or create visual designs is in this
document. It is self-contained; you shouldn't need to read the codebase to act on it.

**What we want from you:** design direction and concrete visual proposals (mockups, component
styling, screen layouts) for the surfaces described below — not new product logic or copy rewrites.
Treat the feature descriptions as fixed requirements the visuals need to serve, not as things open
for renegotiation.

---

## 1. What the product is

**Breeding Planner** is a full-stack software suite for reptile breeders (primarily ball python
breeders — genetics coverage is built around morph/het terminology, though the data model is
generic). It replaces the spreadsheets, paper cards, and group chats breeders currently use to run
a collection, with one connected system covering:

- animal record-keeping (identity, genetics, health, weight, feeding, photos)
- physical housing management (rooms → racks → terrariums → slots)
- breeding project planning (pairings, incubation, clutches, hatchlings)
- a genetics engine that predicts morph/het outcomes from a pairing (Punnett-square math over a
  500+ gene database, including complex alleles)
- an accredited genetic-testing pipeline: breeders order shed-skin tests, a lab receives/processes
  physical samples via QR-coded labels, and results/certificates flow back and auto-update the
  animal's genetics
- a marketplace for breeders to list and sell animals, with per-seller storefronts
- a public marketing site, pricing/subscription tiers, and an admin back-office

It runs as a responsive web app, an Electron desktop app (Windows/macOS/Linux), and a Capacitor
mobile app (iOS/Android). The breeder app is **local-first**: fully functional offline with data in
local storage, optionally syncing to a shared backend for multi-device use, marketplace, and lab
testing.

---

## 2. The six surfaces (who sees what)

Treat this as one product family, not one screen — each surface is a distinct audience with a
distinct job, sharing one visual language (see §5).

| Surface | Audience | Deployed as |
|---|---|---|
| **Public marketing site** | Prospective customers, logged-out visitors | Marketing website + login/register/pricing |
| **Breeder app** | Reptile breeders (the primary paying customer) | Web, Electron desktop, Capacitor Android/iOS |
| **Marketplace** | Breeders browsing/selling animals (buyer + seller in one surface) | Embedded in breeder app + standalone web |
| **Lab portal** | Lab technicians processing genetic test orders | Web + Capacitor Android app for lab techs |
| **Admin portal** | Internal platform staff (support, moderation, billing ops) | Web only, admin-role-gated |
| **Mobile shell** | Breeders in the field (phone-first subset of the breeder app) | Capacitor Android/iOS, also a web route |

All surfaces except public are logically one product behind one login; a user's role (`breeder` /
`lab` / `admin`) determines which portals they can enter, and a breeder can also be a marketplace
seller.

---

## 3. Domain concepts that drive layout decisions

- **Morph / het / genetics string** — a snake's visual appearance (morph, e.g. "Pastel Clown") plus
  invisible carried traits ("het", e.g. "Het Pied," or probabilistic "66% Het Pied"). Renders as
  **tag/chip lists**, often many per animal — cards and table cells must handle wrap/overflow
  gracefully.
- **Punnett square / breeding odds** — given two parents' genetics, the app computes probability
  distributions of offspring outcomes (per-gene odds, combined visual odds, projected hets). Shows
  up as **percentage-labeled outcome grids/lists** in pairing details and the Breeding Advisor —
  currently reads as raw percentages/lists; a clearer visual treatment (proportional bars, grouped
  by visual vs. het) is one of the highest-value design opportunities here.
- **Pairing → breeding cycle → clutch → incubation → hatchlings** — the breeding project lifecycle:
  pairing → scheduled appointments → observed lock/ovulation/pre-lay-shed events → clutch (egg
  count, fertile eggs, slugs) → incubation countdown → hatchlings linked back to parents. A
  **timeline/stage-progress** UI problem (appointments calendar, stage badges, countdown/progress
  bars).
- **Spaces hierarchy** — Room → Heat Rack (with slots) / Terrarium → occupant. A **spatial /
  occupancy-grid** problem: rack-of-slots visualizations, occupied vs. empty states, quick "where
  is this animal" lookups.
- **Shed testing / lab certificates** — breeder orders a genetic test, ships a physical shed-skin
  sample with a **printed QR label**, a lab tech scans it, enters results, and a certificate (with a
  verification code) is generated. Two very different UI modes: a lightweight breeder-facing
  order/status/certificate view, and an operational lab queue (intake → result entry → completed)
  with physical print layouts.
- **Physical print layouts (labels & PDFs)** — real printable artifacts: QR sample labels, shipping
  labels, clutch cards, animal PDFs, pairing/appointment sheets. Millimeter-precise (safe margins,
  QR min/max size, auto-shrinking font-to-fit) — treat as a distinct print-design deliverable from
  screen UI, with real physical constraints (label sizes as small as ~50×25mm, side-by-side vs.
  stacked variants).
- **Marketplace listing / store** — species, category, sex, birth date, weight, genetics,
  price/currency, availability, location, shipping/pickup flags, photos. Sellers get a storefront
  with Available / Reserved / Sold / About / Reviews / Terms tabs.
- **Groups & status tags** — animals organized by free-form groups (e.g. "2026 Holdbacks") and
  user-defined status tags (Active, Holdback, Grow-out, Breeder, Quarantine, For sell, Sold) that
  double as the primary color-coded filter/badge vocabulary throughout the breeder app.
- **Reproductive intelligence** — per-female breeding-history analytics (lock dates, cycle
  intervals, predicted next-lock windows with confidence) as an "Overview / Cycles / Predictions"
  panel inside the animal editor.

---

## 4. Feature inventory per surface

### 4.1 Breeder app (the core product)
Top-level tabs: **Animals · Spaces · Breeding Planner · Breeding Advisor · Shed Test Terminal ·
Calendar · Settings** (plus a Family Tree pedigree graph and Reproductive Intelligence panel,
reachable from an animal record).

- **Animals** — primary database. Card view and list view; sub-filters (All/Males/Females/Groups);
  global search; status tags. "Quick add" free-text parser (paste a loose description → structured
  fields) alongside manual entry. Cards/rows carry photo, name, ID, sex, birth date, genetics
  (chips), weight, group, price, status, and inline log shortcuts (feed/weight/shed/cleaning/
  medication). Full editor per animal: identity, genetics, weight, price, group, pairing links, log
  history, photo gallery, PDF export, QR label, "Order Genetic Test." Bulk feed-prep tool groups
  selected snakes into a defrost report by food type/size.
- **Spaces** — Rooms → Heat Racks (slot grid) / Terrariums. Occupancy-aware slot assignment. A
  layout/visual-hierarchy screen more than a data-table one.
- **Breeding Planner** — Pairings in Active / Completed / Incubator views. Pairing detail =
  appointments (auto-generated 5-month schedule), lifecycle milestones, genetics-odds calculator
  output, clutch-card PDF export, pairing QR labels. Only animals tagged "Breeders" are eligible to
  pair — should be visible in the UI, not silently enforced.
- **Breeding Advisor** — natural-language breeding-goal input (e.g. "I want to make clown desert
  ghost with pastel and possible het pied") → ranked pairing suggestions, each showing goal-success
  %, projected visuals/hets, next-gen plan hints. The most "AI/recommendation-feed"-like screen.
- **Shed Test Terminal** — breeder-side view of lab order status, label PDFs, results, certificates
  (read-mostly).
- **Calendar** — month view combining care events and breeding events, category toggles,
  per-sire filtering; exports to .ics and spreadsheet formats.
- **Settings** — breeder profile/branding (logo reused on PDFs/labels), ID-generation wizard,
  morph/gene alias managers, animal/pairing exports (PDF/XLSX/CSV), **Appearance** (theme/palette/
  font/density presets — see §5), Backups, Language (10 languages).

### 4.2 Marketplace
Public browse/search of listings (species, category, price range, sort), listing detail modal,
contact/inquiry form, per-seller store panel. Seller dashboard + store-settings form. Listing
creation is a multi-section form: basic info → animal details → genetics → pricing & availability →
location & logistics → photos.

### 4.3 Lab portal
An operational queue tool for lab staff, distinct in tone from the breeder app — dashboard/table/
workflow-status oriented. Pages: Dashboard, All Shed Orders, Sample Intake (QR camera scan), Result
Entry, Completed Tests, Admin Oversight, Test Catalog, Pricing & Logic, Order Details (6-step
workflow progress). Ships as its own Capacitor Android app for lab techs, with a persistent bottom
tab bar (Dashboard/Orders/Scan/Results/More) and a global full-screen QR scanner that routes
directly to the correct next step based on the scanned order's status.

### 4.4 Admin portal
Internal back-office, dark-navy dashboard aesthetic today. Sidebar groups: Dashboard, Users
(all/pending-verification/suspended, user detail), Breeders (applications, verified breeders),
Subscriptions (tier overview/editor), Reports (open reports, marketplace disputes, message
reports), Marketplace (listing moderation), Labs (lab accounts), Messages (announcements), Settings
(GDPR tools). Almost entirely tables, filters, and detail/drill-in pages — classic admin-CRUD IA.

### 4.5 Mobile shell (breeder, phone-first)
A deliberately reduced, phone-optimized subset of the breeder app for field use: `terminal` (QR
scan + recent animals + quick logging), `animals`, `breeding` (pairing stage progress), `tasks`,
`rack` (read view of synced spaces), `more` (settings/sync/appearance). Animal profile has its own
tab set: Overview / Feed / Details / Logs / Photos / Breeding. Designed around one-handed,
scan-first workflows (barn/rack-side use), not full data entry.

### 4.6 Public marketing site
Standard marketing site: hero, feature grid (Animal management, Genetics calculator, Breeding
records, Shed testing & lab, Marketplace, AI tools), 3-step "how it works," pricing, login/register.
Uses its own distinct "editorial" visual style — deliberately different from the in-app product
(see §5).

---

## 5. Existing visual system — use this as the foundation, not a blank slate

The breeder app already has a real design-token system (CSS custom properties for color,
typography, spacing/density, radius, motion) with 6 user-selectable presets including
high-contrast and low-vision options. **This is the one true design system for all in-product
surfaces** (breeder, marketplace, lab, admin, mobile). Any new design work should assign values to
these existing *roles* rather than inventing new ones.

The public marketing site is the one surface allowed a separate, deliberately distinct identity.

### 5.1 Color roles (breeder app / in-product default)

| Role | Default value | Used for |
|---|---|---|
| Primary | `#0ea5e9` | Primary actions, links, active states, focus rings |
| Secondary | `#2563eb` | Secondary actions, border accents |
| Accent | `#f59e0b` | Highlights, callouts, "new"/attention markers |
| Background | `#f6f7f9` | App/page background |
| Card | `#ffffff` | Panels, cards, modals, table surfaces |
| Text | `#0f172a` | Primary text color |

Semantic status colors (fixed regardless of preset):

| State | Background | Border | Text |
|---|---|---|---|
| Success | `#f0fdf4` | `#bbf7d0` | `#166534` |
| Error | `#fff1f2` | `#fecaca` | `#9f1239` |
| Warning / recommended | `#dcfce7` | `#86efac` | `#166534` |
| Danger / inactive | `#fee2e2` | `#fca5a5` | `#991b1b` |
| Neutral / hidden | `#f3f4f6` | `#d1d5db` | `#6b7280` |

Other presets already in the system (for reference — a re-theme can adjust these, but should keep
the same *role* structure):

| Preset | primary | secondary | accent | background | text |
|---|---|---|---|---|---|
| Minimal | `#0f172a` | `#94a3b8` | `#f97316` | `#fbfbfb` | `#0f172a` |
| High contrast | `#ffb100` | `#ffd700` | `#ff4d4f` | `#000000` | `#ffffff` |
| Visually impaired | `#005fcc` | `#111827` | `#b45309` | `#ffffff` | `#000000` |
| Dark breeder | `#12b981` | `#0f172a` | `#ef4444` | `#05070d` | `#e2e8f0` |
| Soft pastel | `#f472b6` | `#a5b4fc` | `#34d399` | `#fef6fb` | `#2e1065` |

### 5.2 Typography
- Default font: **Space Grotesk**, fallback `'Segoe UI', system-ui, -apple-system, sans-serif`
- Monospace (IDs, codes, data cells): `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  monospace`
- Base size 16px (options: 14/16/18/20px); line-height 1.6 default (1.35 compact, 1.8 relaxed)
- Approved alternate fonts for accessibility/branding presets: Inter, Roboto, Open Sans, Cormorant
  Garamond (serif/editorial), IBM Plex Mono

### 5.3 Spacing & density
A single density toggle scales padding/row-height together:

| Density | button padding | card padding | table row height | list gap |
|---|---|---|---|---|
| Compact | 0.35/0.85rem | 0.75rem | 2.25rem | 0.4rem |
| Comfortable (default) | 0.55/1rem | 1.15rem | 2.65rem | 0.65rem |
| Spacious | 0.75/1.35rem | 1.5rem | 3.1rem | 0.9rem |

### 5.4 Corner radius
Sharp `2px` · Soft `8px` (default) · Rounded `16px`. **Buttons, badges, tags, and chips are always
fully pill-shaped (`999px`) regardless of the active radius preset** — a deliberate exception.

### 5.5 Motion
Standard transition `250ms` (0ms when reduced-motion). Buttons scale to `0.97` on `:active`; hover
uses either `opacity: 0.88` or a `translateY(-1px)` lift + shadow — pick one per component, don't
combine both.

### 5.6 Component patterns already established
- **Buttons**: solid fill in primary color, contrast text, disabled = `opacity: 0.6`; ghost/secondary
  variant is transparent with a 1px neutral border (`#d0d7e2` family).
- **Cards/panels**: white surface, 1px neutral border (`#dde3ea` family), 8–12px radius; hover-
  interactive cards add a soft shadow (`0 4px 16px rgba(15,23,42,0.08)`) rather than changing the
  border.
- **Badges/pills/tags**: light tint background + matching dark text from the same hue (never
  saturated background with white text for these).
- **Tables**: light gray header (`#f1f4f8` family), bold weight, muted header text (`#475467`
  family); 1px bottom-only row borders.
- **Overlays/modals**: backdrop `rgba(15,23,42,0.35–0.45)` with optional blur; modal surface uses
  card color, larger radius (16–32px for prominent dialogs), fade + upward-translate entrance
  (~0.35s ease).

### 5.7 Where each surface currently stands (the gap to close)
Only the breeder app implements the token system above. The other in-product surfaces have each
drifted into their own hardcoded palette — this is the single biggest opportunity for design
impact:

- **Admin** — dark-navy sidebar (`#101828`), ad hoc status colors.
- **Marketplace** — independent forest-green brand (`#12392b` / `#14533f` / `#e7f5ee`).
- **Lab** — no theme of its own; copy-pasted hex values from admin, silently drifting from it over
  time.
- **Public marketing site** — a third, *intentionally* distinct "editorial" identity: near-black
  `#1c1c1a` + gold `#c8a840` accent, cream `#faf8f3` background. This is a deliberate brand choice
  for marketing and should stay differentiated — don't unify this one with the rest.

---

## 6. Platform & technical constraints that shape any design

- **Local-first + optional sync**: the breeder app must work fully offline. Sync status,
  "shared backend unavailable," and offline/degraded states need real designed states, not
  afterthoughts — shed testing, marketplace, and multi-device sync specifically require the backend
  and should visibly communicate when it's unavailable.
- **Three runtime shells**: the same build runs in a browser tab, an Electron desktop window (no
  browser chrome), and a Capacitor WebView (phone-sized viewport, camera access for QR scanning).
  Designs must hold up across a wide viewport range without assuming hover states are always
  available (touch-first on mobile). Known live gap: several lab/admin screens were built
  desktop-first (wide fixed-width tables, `hidden lg:block` patterns) and need a genuine responsive
  pass, not just a squeeze.
- **Print is a first-class output**: QR sample labels, shipping labels, clutch cards, animal/pairing
  PDFs, appointment sheets are real physical artifacts with millimeter layouts, safe margins, and
  auto-shrinking text-to-fit. Any label/PDF redesign needs actual print dimensions (label stock
  sizes as small as ~50×25mm), not just screen mockups.
- **10 languages supported app-wide** — avoid fixed-width text containers, icon-only buttons without
  accessible labels, and layouts that break with longer translated strings.
- **Accessibility presets already exist** (high-contrast, "visually impaired," reduced-motion) — new
  components should be checked against these, not just the default look.
- **Data density is real**: collections range into the hundreds of animals — list/table views,
  genetics-chip overflow, and search/filter affordances need to hold up at scale, not just in 5-row
  demo data.

---

## 7. Where design effort would matter most right now

1. **Unify the four in-product surfaces** (admin, marketplace, lab, mobile) onto the breeder app's
   existing token system — highest leverage, lowest risk, since the system already exists and just
   needs consistent adoption. A proposed unified palette/component pass across these four is the
   single most valuable deliverable.
2. **Mobile/responsive redesign** of lab and admin screens that were built desktop-first — dense
   tables and wide fixed-width elements are the recurring failure pattern.
3. **Genetics/Punnett-square outcome displays** (pairing detail, Breeding Advisor) — currently raw
   percentages/lists; a clearer visual treatment (proportional bars, grouped by visual vs. het)
   would meaningfully improve the product's signature feature without touching any calculation
   logic.
4. **Print-layout art direction** (labels, certificates, clutch cards) — functionally solid but
   built programmatically rather than art-directed; a good candidate once the on-screen system is
   settled.

---

## 8. What we'd like back

Given the above, propose (in whatever order makes sense to you):
- a concrete color/type/component direction for the four in-product surfaces, expressed as values
  for the existing roles in §5.1–§5.6 (not a new token system)
- example screen mockups for 2–3 of the highest-impact screens (suggest: Animals list/card view,
  a Pairing detail with genetics-odds display, and one Lab portal screen)
- a lighter-touch pass on the Family Tree / Reproductive Intelligence panels and the Breeding
  Advisor recommendation feed, since these are the most visually distinctive, "showcase" screens
  in the product
- explicit call-outs anywhere a proposal would require new component behavior (not just styling),
  so engineering can scope it separately

Flag anything in this brief that's ambiguous or where you'd want a decision from the product owner
before committing to a direction, rather than guessing silently.
