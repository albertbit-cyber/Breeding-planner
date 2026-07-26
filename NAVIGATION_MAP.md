# App Navigation Map

Date: 2026-07-01

This map covers the user-facing navigation in the Breeding Planner workspace: the current root app, breeder UI, marketplace, lab portal, mobile shell, and admin portal.

## App Ownership

| Surface | Canonical folder | Entry point | Route / URL owner |
| --- | --- | --- | --- |
| Root launcher and current combined app | `src` | `src/AuthShell.jsx` | Hash routes under the root Vite app |
| Breeder app, current | `src/App.jsx` | `#/breeder` | In-page React tab state |
| Marketplace, current inside root app | `src/features/marketplace` | `#/marketplace` | Root hash route plus marketplace modals |
| Pricing | `src/features/subscriptions` | `#/pricing` | Root hash route |
| Mobile shell | `src/features/mobile` | `#/mobile` | Root hash route plus in-page tab state |
| Lab portal, current inside root app | `src/features/lab` | `#/lab` | Lab hash routes |
| Admin portal, current inside root app | `src/admin` | `#/admin` | Admin hash routes |
| Extracted breeder app, older duplicate | `breeding-app-breeder` | separate Vite app | Duplicate app; not the canonical current root app |
| Extracted marketplace/lab/admin apps | `breeding-app-marketplace`, `breeding-app-lab`, `breeding-app-admin` | separate Vite apps | Standalone package copies |

All Vite configs currently request port `5173` with `strictPort: true`. If several apps are running at once, only one can own `5173`; use the logged local URL from the running dev server.

## Root Hash Router

Defined in `src/AuthShell.jsx`.

| Hash path | Destination |
| --- | --- |
| `#/` | Launch page |
| `#/breeder` and `#/breeder/*` | Current breeder app |
| `#/marketplace` and `#/marketplace/*` | Marketplace page |
| `#/pricing` and `#/pricing/*` | Pricing page |
| `#/mobile` and `#/mobile/*` | Mobile app |
| `#/lab` and `#/lab/*` | Lab portal |
| `#/admin` and `#/admin/*` | Admin portal |
| Any other hash path | Breeder app fallback |

The root shell wraps these routes with `AppearanceProvider`, `SharedBackendProvider`, `BatchOrderProvider`, `SharedBackendBanner`, and `AuthGate`.

## Launch Page

Defined in `src/features/launch/LaunchPage.jsx`.

The launch page is a workspace selector with direct buttons to:

| Button | Target |
| --- | --- |
| Breeder App | `#/breeder` |
| Marketplace | `#/marketplace` |
| Mobile App | `#/mobile` |
| Pricing | `#/pricing` |
| Admin Portal | `#/admin` |

## Breeder App

Defined in `src/App.jsx`. This surface is mostly tab-driven and does not expose individual URL routes for each screen.

### Primary Navigation

| Tab state | UI label | Purpose |
| --- | --- | --- |
| `animals` | Animals | Animal inventory, search, filters, cards/list, animal detail/edit flows |
| `spaces` | Spaces | Rooms, racks, terrariums, slot assignment, occupancy |
| `pairings` | Breeding Planner | Pairings, clutches, incubator, breeding-cycle tracking |
| `advisor` | Breeding Advisor | Suggested pairings and pairing export |
| `shedTerminal` | Shed Test Terminal | Breeder-side shed test workflow and lab order history |
| `calendar` | Calendar | Upcoming breeding events, pairings, and tasks |
| `setup` | Settings | Breeder profile, IDs, aliases, export, appearance, backups, language |

### Animals Subnavigation

| State | Label |
| --- | --- |
| `all` | All |
| `males` | Males |
| `females` | Females |
| `groups` | Groups |

Animals also has card/list display modes, scanner-related views, imports, exports, and modal edit/detail flows.

### Feed Preparation

| Entry | Location | Purpose |
| --- | --- | --- |
| Feed prep | Animals toolbar | Select snakes and generate a defrost report grouped by food type and size / weight class |
| Normal feeder | Snake edit modal | Stores each snake's usual food type, size / weight class, item weight, quantity, and notes |

The feed preparation report does not track freezer inventory. It only calculates how many feeder items to defrost from the selected snakes and their normal feeder profiles. Snakes missing feeder data are listed separately and excluded from grouped totals until completed.

### Pairings Subnavigation

| State | Label |
| --- | --- |
| `dashboard` | Dashboard |
| `active` | Active Projects |
| `completed` | Completed Projects |
| `incubator` | Incubator |

Pairing detail and breeding-cycle dialogs are in-page states, not hash routes.

### Settings Subnavigation

| State | Label |
| --- | --- |
| `info` | Breeder info |
| `id` | ID wizard |
| `aliases` | Morph alias manager |
| `geneAliases` | Gene alias manager |
| `export` | Exports |
| `appearance` | Appearance |
| `backup` | Backups |
| `language` | Language |
| `devTools` | Developer Tools, development only |

## Marketplace

Defined in `src/features/marketplace/MarketplacePage.jsx` and mirrored in `breeding-app-marketplace/src/features/marketplace/MarketplacePage.jsx`.

| Navigation / state | Destination |
| --- | --- |
| Home button | `#/` |
| Pricing button | `#/pricing` |
| Create listing | Listing editor modal, seller only |
| Filters toggle | Listing filter sidebar |
| Listing card | Listing detail modal |
| Contact / inquiry | Contact form modal |
| Open store | Store panel modal |
| Seller dashboard | In-page seller management section |
| Store settings | In-page store profile form |
| Admin marketplace panel | In-page moderation panel when opened from admin mode |

### Store Panel Tabs

| Tab | Purpose |
| --- | --- |
| Available | Available store listings |
| Reserved | Reserved store listings |
| Sold | Sold store listings |
| About | Store description |
| Reviews | Store rating / reviews |
| Terms | Store policies |

## Pricing

Defined in `src/features/subscriptions/PricingPage.jsx`.

| Action | Target |
| --- | --- |
| Back | `#/` |
| Contact us | `#/` |
| Subscribe | `#/breeder` |

Feature access guards can send users to `#/pricing` for upgrades.

## Mobile App

Defined in `src/features/mobile/MobileApp.jsx`.

| Main tab state | Purpose |
| --- | --- |
| `terminal` mode | QR scanner, recent animals, scanned animal card, quick care logs, photos, and pairing cycle logging |
| `animals` | Animal list, group-filtered animal list, search, or selected mobile animal profile |
| `breeding` | Pairing list with breeding cycle stage progress and editable pairing stage logs |
| `tasks` | Assigned care/work tasks |
| `rack` | Mobile spaces/rack view built from synced desktop rooms, heat racks, rack slots, and terrariums |
| `more` | Mobile settings, account actions, cloud sync, collection data summary, appearance, Breeding Advisor, and Shed Test Terminal |

The mobile animal profile has its own nested tabs:

| Profile tab | Purpose |
| --- | --- |
| `overview` | Key animal status cards |
| `feed` | Feed Cycle: feeder type, size, weight class, quantity, interval, latest accepted feed, and next feed date |
| `details` | Full desktop animal record summary: identity, genetics, location, groups, lineage, acquisition/sale, lab/marketplace, and notes |
| `logs` | Feed, weight, shed, cleaning, medication, water, health, note, and other synced log categories |
| `photos` | Camera capture, icon assignment, and photo deletion |
| `breeding` | Breeding pairings and cycle stage logging |

Mobile header actions:

| Action | Target |
| --- | --- |
| Start | `#/` |
| Scan QR | Mobile QR scanner overlay |
| Sync cloud database | Mobile settings cloud sync action, including queued mobile actions |
| Refresh from cloud | Mobile settings cloud pull/refresh |
| Switch mode | Full mode or Terminal mode selector |
| View plans from locked notice | `#/pricing` |
| Contact support from locked notice | `#/` |

## Lab Portal

Defined in `src/features/lab/LabAppShell.jsx` and mirrored in `breeding-app-lab/src/features/lab/LabAppShell.jsx`.

Default route: `#/lab/dashboard`.

| Hash path | Page | Access notes |
| --- | --- | --- |
| `#/lab` | Dashboard redirect | Alias for `#/lab/dashboard` |
| `#/lab/dashboard` | Lab dashboard | Lab-access users |
| `#/lab/shed-tests` | Incoming orders | Alias for `#/lab/incoming-orders` |
| `#/lab/incoming-orders` | All shed orders | Lab-access users |
| `#/admin/shed-tests` | Incoming orders | Legacy/admin alias |
| `#/lab/sample-intake` | Sample intake | Lab-access users |
| `#/lab/result-entry` | Result entry | Lab-access users |
| `#/lab/completed-tests` | Completed tests | Lab-access users |
| `#/lab/admin-oversight` | Admin oversight | Admin role only |
| `#/lab/test-catalog` | Test catalog | Lab staff or admin |
| `#/lab/pricing-logic` | Pricing and logic | Lab staff or admin |
| `#/lab/dev-tools` | Developer tools | Development only |
| `#/lab/orders/:orderId` | Order details | Lab-access users |
| Unknown `#/lab/*` | Lab route not found | Offers return to dashboard |

Primary lab sidebar items:

| Item | Target |
| --- | --- |
| Dashboard | `#/lab/dashboard` |
| All Shed Orders | `#/lab/incoming-orders` |
| Sample Intake | `#/lab/sample-intake` |
| Result Entry | `#/lab/result-entry` |
| Completed Tests | `#/lab/completed-tests` |
| Admin Oversight | `#/lab/admin-oversight` |
| Test Catalog | `#/lab/test-catalog` |
| Pricing & Logic | `#/lab/pricing-logic` |
| Order Details | Dynamic `#/lab/orders/:orderId` |

## Admin Portal

Defined in `src/admin/AdminApp.jsx` and mirrored in `breeding-app-admin/src/admin/AdminApp.jsx`.

Only users with role `admin` can access the admin portal.

| Hash path | Page |
| --- | --- |
| `#/admin` | Dashboard |
| `#/admin/users` | All users |
| `#/admin/users?verification=pending` | Pending verification filtered user list |
| `#/admin/users?status=suspended` | Suspended users filtered user list |
| `#/admin/users/:id` | User detail |
| `#/admin/verification?status=pending_review` | Breeder verification queue |
| `#/admin/users?role=breeder&verification=approved` | Verified breeders filtered user list |
| `#/admin/tiers` | Tier overview |
| `#/admin/tiers/new` | Tier editor for new tier |
| `#/admin/tiers/:id` | Tier editor |
| `#/admin/reports?status=open` | Open reports |
| `#/admin/reports?type=scam_suspicion` | Marketplace disputes |
| `#/admin/reports?type=abusive_message` | Message reports |
| `#/admin/marketplace` | Marketplace moderation panel |
| `#/admin/labs` | Lab accounts |
| `#/admin/notifications` | Messages and announcements |
| `#/admin/gdpr` | GDPR tools |
| `#/admin/settings` | Roles and permissions placeholder |

### Admin Sidebar Groups

| Group | Items |
| --- | --- |
| Dashboard | Dashboard |
| Users | All Users, Pending Verification, Suspended Users |
| Breeders | Applications, Verified Breeders |
| Subscriptions | Tier Overview, Create Tier, User Subscriptions |
| Reports | Open Reports, Marketplace Disputes, Message Reports |
| Marketplace | Listings |
| Labs | Lab Accounts |
| Messages | Announcements |
| Settings | GDPR Tools |

## Cross-App Flows

| Flow | Source | Destination |
| --- | --- | --- |
| Workspace selection | Launch page | Breeder, marketplace, mobile, pricing, admin |
| Upgrade gating | Feature access guard / mobile locked notice | Pricing |
| Subscribe / continue | Pricing | Breeder app |
| Breeder lab orders | Breeder shed terminal | Shared backend and lab portal order pages |
| Lab order drill-in | Lab dashboard, incoming, sample intake, result entry, completed tests | `#/lab/orders/:orderId` |
| Marketplace moderation | Admin portal | `#/admin/marketplace` marketplace admin mode |
| Store browsing | Marketplace listing card | Store panel modal |
| Seller workflow | Marketplace seller dashboard | Listing editor, store settings, sale/reservation state |

## Current Navigation Risks

1. There are duplicate app folders for breeder, marketplace, lab, and admin. The current combined root app in `src` should be treated as canonical unless a task explicitly targets an extracted package.
2. All standalone Vite apps request port `5173`, so parallel local runs can easily show the wrong app at an old localhost port.
3. The breeder app uses internal React state for most navigation, so browser refresh/deep linking only preserves the top-level `#/breeder` route, not the selected tab.
4. Several marketplace and breeder subviews are modals or in-page panels. They are user-facing navigation states but not addressable URLs.
5. Shared lab and marketplace features require `VITE_API_URL` and a running backend; otherwise guarded or shared-backend UI appears.
