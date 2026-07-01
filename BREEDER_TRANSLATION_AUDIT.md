# User Interface Translation Audit

Date: 2026-06-30
Scope:

- `breeding-app-marketplace/src`
- `breeding-app-breeder/src`
- `breeding-app-lab/src`
- `breeding-app-admin/src`

This audit checks only user-interface text that can be shown to a user in the shipped apps: marketplace, breeder app, laboratory portal, and admin portal. It lists visible UI text that appears to be hardcoded instead of routed through `t(...)`, `i18n.t(...)`, or locale JSON files. It also lists locale files where keys exist but still have English text.

Out of scope:

- Backend services, API clients, data normalization, tests, and service-layer error strings unless they are directly surfaced as UI copy.
- Development-only tools and diagnostics, including shared backend diagnostics banners and destructive dev reset panels.
- Technical values and domain identifiers that should remain literal, such as `QR`, `PCR`, `BEL`, environment variable names, currency codes, IDs, gene names, and route names.

## Summary

- No missing locale keys were found compared with English JSON files.
- Many non-English locale keys still have the same English value.
- The biggest hardcoded areas are:
  - Main breeder app `App.jsx`
  - Marketplace pages in both breeder/admin shells and standalone marketplace app
  - Laboratory portal workflow pages
  - Admin portal
  - Breeding/reproductive panels
  - Lab result entry widgets
  - Family tree panels

## Hardcoded UI Text By Screen / File

### Main Breeder App

File: `breeding-app-breeder/src/App.jsx`

Setup / Add Animal / Forms:

- `5539` placeholder: `Optional: custom ID (e.g., 25Ath-2)`
- `5595` title: `Delete tag`
- `5640` title: `Delete tag`
- `5699` placeholder: `YYYY-MM-DD, YYYY-MM, or YYYY`
- `9035` alt: `logo`
- `9037` `Logo`
- `9085` alt: `logo`
- `9359` title: `Delete tag`

Breeding dashboard / clutch cards:

- `9711` `Clutches`
- `9715` `Egg boxes`
- `9719` `Total eggs`
- `9744` `Clutch ID`

Photo modal:

- `9939` `Cover`
- `9990` `No photos saved for this snake yet. Use the card buttons to add some.`

Leucistic selector modal:

- `10037` `Select Leucistic Type`
- `10043` `Blue Eyed Leucistic (BEL)`
- `10052` `Black Eyed Leucistic`
- `10065` `Leucistic Type`
- `10071` `Blue Eyed Leucistic`
- `10072` `Black Eyed Leucistic`
- `10079` `BEL Gene 1`
- `10091` `BEL Gene 2`
- `10110` `Black Eye Complex Gene`
- `10124` `Cancel`

Hatchling logging modal:

- `10230` `Hatching clutch`
- `10240` `Saved`
- `10242` `Close`
- `10258` `Hatchling ID`
- `10281` `Sex`
- `10287` `Female`
- `10288` `Male`
- `10289` `Unknown`
- `10293` `Weight (g)`
- `10300` placeholder: `e.g., 75`
- `10304` `Morph / het notes`
- `10309` placeholder: `e.g., Pastel Clown 66% Het Hypo`
- `10313` `Birth date`
- `10324` `No hatchlings to record.`

Create pairing modal:

- `10380` `Create pairing`
- `10381` `Close`
- `10396` `Male`
- `10458` `Female`
- `10529` `Starting date`
- `10535` `Notes`
- `10536` placeholder: `Ultrasound size, rotation plan, etc.`

Edit animal / marketplace publishing:

- `10756` placeholder: `YYYY-MM-DD, YYYY-MM, or YYYY`
- `10788` `For Sale`
- `10819` `Currency`
- `10832` `Description for buyers`
- `10838` placeholder: `Optional details...`
- `10846` `Published to Marketplace`

QR / PDF / egg box modals:

- `11396` `Align the QR inside the box`
- `12155` `Genetics: -`
- `12157` `Generating...`
- `12159` `Download`
- `12160` `Close`
- `12193` `Clutch ID`
- `12198` `Close`
- `12203` `Pairing`
- `12207` `Good eggs in this box`
- `12212` `Laid`
- `12216` `Due`
- `12221` `Remaining`
- `12228` `Bad eggs`
- `12243` `Egg box notes`
- `12248` placeholder: `Add incubation notes, egg condition, movement, or reminders.`
- `12253` `Cancel`

Animal detail / cycle history:

- `13861` title: `More actions`
- `13862` aria-label: `More actions`
- `14229` `Locks:`
- `14234` `Ovulation:`
- `14237` `Pre-Lay Shed:`
- `14240` `Eggs laid:`
- `14243` `Hatched:`
- `14246` `No cycle events recorded.`
- `14341` aria-label: `Weight trend chart`

Groups / setup / developer tools:

- `14690` placeholder: `Add new group`
- `14697` `Add`
- `16103` `Developer Tools`
- `16203` alt: `logo`
- `16297` placeholder: `BREED`
- `16359` placeholder: `Enchi, Fire, Clown`
- `16445` placeholder: `Pompeii`
- `16454` placeholder: `Black Pastel, Red Stripe, Spotnose, Yellow Belly, Clown`
- `16463` placeholder: `BEL complex combinations`
- `16539` placeholder: `Orange Dream`
- `16548` placeholder: `Orange Dream, OrangeDream`
- `16557` placeholder: `OD`

Backups / restore:

- `17140` `Manual backup`
- `17171` `Automatic backups`
- `17177` `Schedule`
- `17183` `Off`
- `17184` `Every night`
- `17185` `Every week`
- `17186` `Every month`
- `17224` `Backup vault`
- `17230` `Retention limit`
- `17319` `Create a manual or automatic backup to populate the vault.`
- `17326` `Restore from backup`
- `17396` `Return to Defaults`

Demo project:

- `17766` `Demo project`
- `17767` `Task timeline, feed reminders, QR workflows.`

Pairing / clutch editor:

- `17904` `Clutch ID`
- `18409` `Clutch ID`
- `18471` `Clutch ID`
- `18780` `No appointments yet.`
- `18801` `Hatchlings`
- `18857` `Genetics odds`
- `18885` `Combined genetics odds`

Cycle timer details:

- `19981` `Clear`
- `20016` `Clear`
- `20154` title: `Ovulation details`
- `20162` `Ovulation date`
- `20175` title: `Pre-Lay shed details`
- `20183` `Pre-Lay shed date`
- `20196` title: `Log eggs laid`
- `20252` title: `Hatch details`
- `20260` `Hatch date`
- `20264` `Number hatched`
- `20331` `Cycle timers`
- `20332` `Breeding cycle status`
- `20336` `This breeding cycle is over.`
- `20349` `Cycle timers`
- `20350` `Upcoming breeding milestones`
- `20371` `No active timers yet. Log ovulation, pre-lay, or clutch events to start tracking milestones.`
- `20386` `Close`

Quick log entries:

- `21068` `Delete`
- `21082` `Mouse`
- `21083` `Rat`
- `21084` `Chick`
- `21085` `Other`
- `21092` `pinky`
- `21093` `fuzzy`
- `21094` `medium`
- `21095` `adult`
- `21098` placeholder: `Size`
- `21102` placeholder: `g`
- `21108` `Live`
- `21109` `Freshly killed`
- `21110` `Frozen/thawed`
- `21111` `Other`
- `21114` placeholder: `Method details`
- `21119` placeholder: `Notes`
- `21129` `Delete`
- `21153` placeholder: `grams`
- `21155` placeholder: `Notes`
- `21157` `Delete`
- `21184` placeholder: `Notes`
- `21185` `Delete`
- `21212` placeholder: `Notes`
- `21213` `Delete`
- `21241` `Delete`

Misc:

- `22878` aria-label: `Scroll to top`

### Marketplace

File: `breeding-app-breeder/src/features/marketplace/MarketplacePage.jsx`

- `101` `Marketplace`
- `102` `Find your next project animal`
- `103` `Browse verified breeder listings, genetics, lineage, feeding records, and health information.`
- `107` placeholder: `Search genetics, breeder, morph, location`
- `110` `Browse animals`
- `111` `Sell an animal`
- `119` `Explore ball pythons`
- `135` `Advanced filters`
- `136` `Species`
- `137` `Category`
- `138` `Sex`
- `139` `Any`, `Male`, `Female`, `Unknown`
- `141` `Availability`
- `142` `Any`, `Available`, `Reserved`, `Sold`
- `145` `Min price`
- `146` `Max price`
- `148` `Location`
- `149` `Include genes`
- `150` `Exclude genes`
- `151` `Minimum weight`
- `152` `Shipping available`
- `153` `Local pickup`
- `154` `Verified breeders`
- `155` `Sort`
- `156` `Newest`, `Price low to high`, `Price high to low`, `Recently updated`
- `158` `Clear filters`
- `167` `No photo`
- `168` `Favorite`
- `176` `Sex`
- `177` `Weight`
- `178` `Location`
- `184` `Quick view`
- `195` `Close`
- `197` `No photo`
- `205` `Species`
- `206` `Genetics`
- `207` `Sex`
- `208` `Birth / year`
- `209` `Weight`
- `210` `Shipping`
- `213` `Genetics Panel`
- `217` `Breeding Planner Data`
- `221` `Seller Description`
- `226` `Trust`
- `230` `Contact seller`
- `231` `Make offer`
- `232` `Add to favorites`
- `233` `Open store`
- `234` `Report listing`
- `248` `Close`
- `262` `Terms`
- `274` `Seller Dashboard`
- `274` `Manage active listings, drafts, reservations, sold animals, messages, offers, and store settings.`
- `275` `Refresh`
- `286` `Edit listing`
- `311` `Listing Editor`
- `311` `Cancel`
- `313` `species`
- `317` `Description`
- `318` `Feeding notes`
- `319` `Temperament notes`
- `320` `Shipping available`
- `321` `Pickup available`
- `323` `Public data controls`
- `330` `Generate sales description`
- `331` `Save listing`
- `431` `Start`
- `432` `Pricing`
- `433` `Create marketplace listing`
- `442` `Animal listings`
- `443` `Apply filters`
- `457` `Store settings`
- `457` `Create public store profile, policies, and contact information.`
- `458` `Create / update store profile`
- `465` `Admin Marketplace Panel`
- `471` `Approve`
- `472` `Hide`
- `473` `Feature`
- `491` `Reserve from conversation`
- `492` `Mark sold`

### Reproductive Intelligence Panel

File: `breeding-app-breeder/src/features/animals/ReproductiveIntelligencePanel.jsx`

- `68` `Earliest`
- `72` `Average`
- `76` `Latest`
- `174` `Lock dates`
- `186` `No events recorded for this cycle.`
- `321` `Loading...`
- `327` `No reproductive data yet.`
- `337` `Profile`
- `354` `Current Cycle`
- `357` `Ovulation recorded:`
- `358` `Pre-lay shed:`
- `373` `Lifetime Averages`
- `381` `No cycles recorded yet`
- `394` `No cycles recorded yet.`
- `419` `From ovulation`
- `420` title: `Expected Pre-Lay Shed`
- `421` title: `Expected Egg Laying`
- `427` `From pre-lay shed`
- `428` title: `Expected Egg Laying`

### Standalone Marketplace App

File: `breeding-app-marketplace/src/features/marketplace/MarketplacePage.jsx`

Priority untranslated UI areas:

- Empty/filter state: `No listings found`, `Try adjusting your filters or clearing the search to see more animals.`, `Clear all filters`
- Hero/search: `Marketplace`, `Find your next project animal`, `Browse verified breeder listings, genetics, lineage, feeding records, and health information.`, placeholder `Search by gene, morph, breeder, location...`
- Browse/sell actions: `Browse animals`, `Sell an animal`, `Pricing`
- Filters: `Any`, `Male`, `Female`, `Unknown`, `Available`, `Reserved`, `Sold`, `Min price`, `Max price`, `Location`, `Include genes`, `Exclude genes`, `Min weight (g)`, sort options
- Listing cards/details: `No photo`, `New`, `Genetics on inquiry`, `Sex`, `Weight`, `Location`, `Shipping`, `Local pickup`, `Available`, `Not offered`
- Contact/offer modal: `Close`, `Cancel`, placeholder `Enter amount`
- Detail panels: `Genetics`, `Seller description`, `Temperament:`, `Breeding Planner data`, `Contact seller`, `Make offer`, `Open store`, `Report listing`
- Store/seller dashboard: `Seller Dashboard`, `Manage listings, reservations, sold animals, and store settings.`, `Refresh`, `Publish`, `Reserve`, `Mark sold`, `Edit`
- Listing editor: `Description & notes`, `Shared data`, `Choose what buyers can see on your listing.`, `Generate description`, `Save & publish`, `Save as draft`
- Store settings: `Store settings`, placeholder `My Breeder Store`, placeholder `Tell buyers about your breeding program...`
- Admin marketplace controls: `Admin Marketplace Panel`, `Approve`, `Hide`, `Feature`, `Reserve from conversation`, `Mark sold`

Files:

- `breeding-app-marketplace/src/features/subscriptions/FeatureAccessGuard.jsx`
- `breeding-app-marketplace/src/features/subscriptions/PricingPage.jsx`

Priority untranslated UI areas:

- Feature access lock: `Current plan`, `Required plan`, `Feature`, `Usage`, `Upgrade`, `Contact admin`, `Close`, `Checking feature access...`
- Pricing page: `Recommended`, `Contact us`, `Subscribe`, `Back`, `Breeding Planner Pricing`, `Choose the plan that matches your collection, lab, or breeding business.`

### Laboratory Portal

Files:

- `breeding-app-lab/src/features/lab/LabAppShell.jsx`
- `breeding-app-lab/src/features/lab/pages/AdminOversightPage.jsx`
- `breeding-app-lab/src/features/lab/pages/CompletedTestsPage.jsx`
- `breeding-app-lab/src/features/lab/pages/IncomingOrdersPage.jsx`
- `breeding-app-lab/src/features/lab/pages/LabDashboardPage.jsx`
- `breeding-app-lab/src/features/lab/pages/OrderDetailsPage.jsx`
- `breeding-app-lab/src/features/lab/pages/PricingLogicPage.jsx`
- `breeding-app-lab/src/features/lab/pages/ResultEntryPage.jsx`
- `breeding-app-lab/src/features/lab/pages/SampleIntakePage.jsx`
- `breeding-app-lab/src/features/lab/pages/TestCatalogPage.jsx`

Priority untranslated UI areas:

- Shell/navigation: `Dashboard`, `All Shed Orders`, `Sample Intake`, `Result Entry`, `Completed Tests`, `Admin Oversight`, `Test Catalog`, `Pricing & Logic`, `Order Details`, `Laboratory`, `Lab Workflow`, `Signed in as`, `Sign Out`
- Access/restriction states: `Lab Access Restricted`, `Admin Oversight Restricted`, `Test Catalog Restricted`, `Pricing & Logic Restricted`, `Lab Route Not Found`, `Back to Lab Dashboard`, `Return to Breeder App`
- Dashboard/orders: `ProHerper Lab Dashboard`, `All Shed Test Orders`, `Manage shed testing orders grouped by workflow status.`, `Search`, `Payment Status`, `Showing`, `Loading shed test orders...`
- Order tables: `Order`, `Snake`, `Lab`, `Status`, `Payment`, `Submitted`, `Requested Tests`, `Result Summary`, `Certificate`, `Action`
- Sample intake: `QR Token Lookup`, `or enter manually`, placeholder `Paste 64-char QR token, sample ID, or full QR payload JSON`, `Linked Order Context`, `Intake Decision`, `Sample Condition`, `Intake Notes`
- Order detail: `Order Details`, `Order Submission`, `Internal ID`, `Snake & Breeder`, `Payment Requested`, `Paid At`, `Payment Reference`, `Testing & Workflow`, `Transition Note (optional)`, `Enter Results`, `Results & Certificate`, `Status History`
- Result entry: `Order Selection`, `Select order for result entry...`, `Test Number`, `Method`, `Select result...`, `Per-gene notes (optional)`, `Result Summary`, `Internal Lab Notes`
- Pricing logic: `Pricing & Logic`, `Pricing Rules Summary`, `Currency:`, `Tier`, `Morph First Test`, `Additional Morph`, `Sex Only`, `Morph + Sex Add-on`, `Live Order Pricing Preview`, `Grand Total`, `Admin Extensibility Notes`
- Admin oversight: `Admin Shed Testing Oversight`, `All Test Orders`, `Admin Controls`, `Correction Reason`, `Correct Workflow Status`, `Genetics Update History`, `Certificate Records`, `Order Audit Trail`

Excluded from this lab portal audit:

- `LabDevToolsPanel` text in `LabAppShell.jsx` because it is dev-only.
- PDF generation helpers unless the generated PDFs are part of the localized user-facing deliverables.

### Admin Portal

File: `breeding-app-admin/src/admin/AdminApp.jsx`

Priority untranslated UI areas:

- Layout/navigation: `Protected admin workspace`, `Start`, `Breeder App`, `Dashboard`, `Users`, `Breeders`, `Subscriptions`, `Reports`, `Marketplace`, `Labs`, `Messages`, `Settings`
- Shared controls/modals: `Cancel`, placeholders `Required` / `Optional`, `Copied!`, `Copy ID`, pagination `Previous`, `Next`, `Page {{page}} of {{pageCount}}`
- Dashboard/users: `Summary of platform users, breeder verification, reports, and subscriptions.`, `All Users`, `Search, filter, and open user records for role, status, verification, subscription, reports, and audit review.`
- User filters/table: placeholder `Search name, email, breeder`, `All roles`, `All statuses`, `All verification`, `All subscriptions`, `All activity`, `User ID`, `Name`, `Email`, `Role`, `Status`, `Verified Status`, `Country`, `Joined Date`, `Last Login`, `Actions`
- Admin actions: `Admin Actions`, `Reason`, `Internal note (optional)`, `Marketplace Permissions`, `Active listing limit`, `Disabled reason`
- Subscriptions/tiers: `Subscription`, `Plan`, `Payment`, `Start date`, `Renewal date`, `Trial ends`, `Tier Overview`, `Create new tier`, `Recommended`, `Monthly`, `Yearly`, `Active users`, `Visibility`, `Main limits`, `Tier Editor`, `Save tier`
- Feature management: `Search features...`, `Enable group`, `Disable group`, `Limits & Feature Access`, `Use group buttons for fast enable/disable...`
- User detail: `Overview`, `Reports & Actions`, `Audit Log`, `Identity`, `Role & Permissions`, `Reports Connected to User`, `Activity Timeline`
- Verification/lab/GDPR/messages: `Lab Account Management`, `Approve`, `Suspend`, `Reject`, `Messages & Announcements`, `Audience`, `All users`, `Breeders only`, `Labs only`, `Notification title`, `Message body`, `GDPR Tools`, `Create new GDPR request`

File: `breeding-app-admin/src/features/marketplace/MarketplacePage.jsx`

- Same marketplace hardcoded UI pattern as the breeder-embedded marketplace page. This copy should either share translation keys with the standalone marketplace app or be replaced by a shared translated marketplace module.

### Lab Result Entry

File: `breeding-app-breeder/src/features/lab/components/InlineResultEntry.jsx`

- `190` `Loading ordered genes...`
- `212` `Test Number`
- `217` placeholder: `260424PH1061`
- `221` `Method`
- `226` placeholder: `PCR`
- `279` `Select result...`
- `287` placeholder: `Per-gene notes (optional)`
- `299` `Result Summary`
- `304` placeholder: `Short technical summary`
- `308` `Internal Lab Notes`
- `313` placeholder: `Internal-only comments`

### Lab Dashboard / Cart / QR

Files:

- `breeding-app-breeder/src/features/lab/components/dashboard/LabOrderQueueWidget.jsx`
- `breeding-app-breeder/src/features/lab/components/BatchOrderCart.jsx`
- `breeding-app-breeder/src/features/lab/components/LabQrScanner.jsx`
- `breeding-app-breeder/src/features/lab/components/OrderProgressBar.jsx`

Untranslated items:

- `LabOrderQueueWidget.jsx:71` `Order`
- `LabOrderQueueWidget.jsx:72` `Status`
- `LabOrderQueueWidget.jsx:73` `Payment`
- `LabOrderQueueWidget.jsx:74` `Date`
- `LabOrderQueueWidget.jsx:75` `Requested Tests`
- `LabOrderQueueWidget.jsx:76` `Action`
- `BatchOrderCart.jsx:144` aria-label: `Dismiss`
- `BatchOrderCart.jsx:190` aria-label: `Collapse`
- `LabQrScanner.jsx:139` `Camera active - point at QR code label`
- `OrderProgressBar.jsx:32` `Order Cancelled`

### Breeding Flowchart / Advisor Progress

Files:

- `breeding-app-breeder/src/components/breeding/BreedingPlanFlowchartCard.tsx`
- `breeding-app-breeder/src/components/breeding/BreedingAdvisorProgressModal.tsx`

Untranslated items:

- `BreedingPlanFlowchartCard.tsx:184` `Expected Genetics`
- `BreedingPlanFlowchartCard.tsx:208` `Probabilities`
- `BreedingPlanFlowchartCard.tsx:229` `Branch Inspection`
- `BreedingPlanFlowchartCard.tsx:230` `Matched Genes / Selected Holdbacks`
- `BreedingPlanFlowchartCard.tsx:243` `Selected Holdbacks`
- `BreedingPlanFlowchartCard.tsx:286` `No holdbacks were selected for this plan.`
- `BreedingPlanFlowchartCard.tsx:370` `Breeding Plan`
- `BreedingPlanFlowchartCard.tsx:427` `Building breeding flowchart...`
- `BreedingAdvisorProgressModal.tsx:45` aria-label: `Running`
- `BreedingAdvisorProgressModal.tsx:55` aria-label: `Completed`
- `BreedingAdvisorProgressModal.tsx:74` aria-label: `Failed`
- `BreedingAdvisorProgressModal.tsx:90` aria-label: `Pending`

### Family Tree

Files:

- `breeding-app-breeder/src/features/familyTree/FamilyTreePage.jsx`
- `breeding-app-breeder/src/features/familyTree/components/SelectedSnakePanel.jsx`
- `breeding-app-breeder/src/features/familyTree/components/PedigreePassportPanel.jsx`
- `breeding-app-breeder/src/features/familyTree/components/PlaceholderNode.jsx`
- `breeding-app-breeder/src/features/familyTree/components/StatsBar.jsx`

Untranslated items:

- `FamilyTreePage.jsx:543` `Family Tree`
- `FamilyTreePage.jsx:574` `Building pedigree graph...`
- `FamilyTreePage.jsx:587` `No animals found`
- `SelectedSnakePanel.jsx:72` `Select a snake to view details.`
- `SelectedSnakePanel.jsx:183` `Unconfirmed link`
- `SelectedSnakePanel.jsx:187` `Confirmed link`
- `PedigreePassportPanel.jsx:105` `Clutch ID`
- `PedigreePassportPanel.jsx:178` `Current owner`
- `PedigreePassportPanel.jsx:207` `Select a snake to view its passport.`
- `PedigreePassportPanel.jsx:223` `Clutch ID`
- `PlaceholderNode.jsx:24` `No record`
- `StatsBar.jsx:23` `(Mock data)`

## Locale JSON Status

Compared every locale namespace against English in all four app locale trees:

- `breeding-app-marketplace/src/locales`
- `breeding-app-breeder/src/locales`
- `breeding-app-lab/src/locales`
- `breeding-app-admin/src/locales`

- `advisor.json`
- `animals.json`
- `auth.json`
- `common.json`
- `electron.json`

No missing keys were found in any non-English locale in any of the four app locale trees.

However, many keys are present but still identical to English. Those should be treated as untranslated. Each app currently has the same locale-key shape and the same total of same-as-English values: `1357` values across all non-English locale files.

### Fully Or Mostly English Locales

These locales have large sections still identical to English:

- Czech `cs`
- Polish `pl`
- Portuguese `pt`
- Hebrew `he` for `animals`, `auth`, and `electron`

Counts by namespace:

- `advisor`: `cs=100`, `pl=100`, `pt=100` same as English.
- `animals`: `cs=26`, `he=26`, `pl=26`, `pt=26` same as English.
- `auth`: `cs=42`, `he=42`, `pl=42`, `pt=42` same as English.
- `electron`: `cs=10`, `he=10`, `pl=10`, `pt=10` same as English.

### Other Same-As-English Counts

`common.json` same-as-English values:

- `cs`: 67
- `de`: 89
- `es`: 69
- `fr`: 82
- `he`: 5
- `it`: 69
- `nl`: 84
- `pl`: 73
- `pt`: 70

`advisor.json` same-as-English values:

- `de`: 20
- `es`: 17
- `fr`: 15
- `he`: 1
- `it`: 15
- `nl`: 14

`animals.json` same-as-English values:

- `de`: 4
- `es`: 2
- `fr`: 6
- `it`: 3
- `nl`: 5

`auth.json` same-as-English values:

- `de`: 2
- `es`: 2
- `fr`: 2
- `it`: 3
- `nl`: 2

`electron.json` same-as-English values:

- `de`: 1
- `es`: 1
- `fr`: 1
- `it`: 1
- `nl`: 1

## Translation Implementation Plan

Goal: every shipped user interface in marketplace, breeder app, laboratory portal, and admin portal renders through locale files, with no hardcoded user-facing English except approved technical/domain literals.

### Phase 1: Lock Translation Scope And Key Rules

1. Treat these folders as the required UI translation surface:
   - `breeding-app-marketplace/src`
   - `breeding-app-breeder/src`
   - `breeding-app-lab/src`
   - `breeding-app-admin/src`
2. Exclude service-only code, tests, backend clients, shared config, dev-only tools, and diagnostics banners unless their strings render in production UI.
3. Keep these values literal unless surrounding labels need translation:
   - IDs, route paths, env names, currency codes, gene names, test method names, `QR`, `PCR`, `BEL`.
4. Use stable namespaced keys by feature, not by component line number:
   - `marketplace.*`
   - `lab.*`
   - `admin.*`
   - `familyTree.*`
   - `breeding.*`
   - `backup.*`
   - `common.*`
5. Prefer reusing existing `common.*`, `auth.*`, `animals.*`, and `lab.*` keys before adding new keys.

### Phase 2: Complete Existing Locale Values

1. Update same-as-English values in every app locale tree:
   - `breeding-app-marketplace/src/locales`
   - `breeding-app-breeder/src/locales`
   - `breeding-app-lab/src/locales`
   - `breeding-app-admin/src/locales`
2. Prioritize mostly-English locales first:
   - `cs`
   - `pl`
   - `pt`
   - `he` for `animals`, `auth`, and `electron`
3. Then complete remaining same-as-English values in:
   - `common.json`
   - `advisor.json`
   - `animals.json`
   - `auth.json`
   - `electron.json`
4. Keep the same JSON key shape across all four apps. If one app gets a new key, add that key to every language file in that app.
5. After each locale batch, run a key parity check against English and a same-as-English report.

### Phase 3: Replace Hardcoded Breeder App UI

Update `breeding-app-breeder/src/App.jsx` first because it has the largest current hardcoded surface.

Work in feature batches:

1. Setup/add animal/forms and edit animal/marketplace publishing.
2. Breeding dashboard, clutch cards, egg box, QR/PDF, and cycle timer UI.
3. Photo modal, leucistic selector modal, hatchling modal, and create pairing modal.
4. Backup/restore, demo project, groups/setup, quick log entries, and miscellaneous aria/title/alt text.
5. Family tree files:
   - `FamilyTreePage.jsx`
   - `SelectedSnakePanel.jsx`
   - `PedigreePassportPanel.jsx`
   - `PlaceholderNode.jsx`
   - `StatsBar.jsx`
6. Breeding advisor and flowchart files:
   - `BreedingPlanFlowchartCard.tsx`
   - `BreedingAdvisorProgressModal.tsx`
   - `ReproductiveIntelligencePanel.jsx`

For each batch:

1. Add English keys to `breeding-app-breeder/src/locales/en/*.json`.
2. Add translated values to all non-English locale files.
3. Replace JSX text, placeholders, titles, aria labels, alt text, toast copy, empty states, and button labels with `t(...)`.
4. Leave technical example placeholders literal only when they are data examples, not instructional copy.

### Phase 4: Replace Marketplace UI

Update both marketplace implementations and converge them on the same key names where possible:

- `breeding-app-marketplace/src/features/marketplace/MarketplacePage.jsx`
- `breeding-app-breeder/src/features/marketplace/MarketplacePage.jsx`
- `breeding-app-admin/src/features/marketplace/MarketplacePage.jsx`

Priority order:

1. Hero/search/filter copy.
2. Listing cards, listing details, and empty states.
3. Contact/offer/store modals.
4. Seller dashboard, listing editor, store settings, and admin marketplace panel.
5. Subscription/pricing UI:
   - `breeding-app-marketplace/src/features/subscriptions/FeatureAccessGuard.jsx`
   - `breeding-app-marketplace/src/features/subscriptions/PricingPage.jsx`

Preferred end state: extract or share marketplace translation keys so the same visible copy is not translated three different ways.

### Phase 5: Replace Laboratory Portal UI

Update production lab UI first and leave dev-only panels out:

- `breeding-app-lab/src/features/lab/LabAppShell.jsx`
- `breeding-app-lab/src/features/lab/pages/*.jsx`
- `breeding-app-lab/src/features/lab/components/*.jsx`
- `breeding-app-lab/src/features/lab/components/dashboard/*.jsx`

Priority order:

1. Shell navigation, access restrictions, and route fallback states.
2. Dashboard, incoming orders, completed tests, and admin oversight tables.
3. Sample intake and QR lookup.
4. Order details, workflow transitions, payment, certificate, and history panels.
5. Result entry labels, placeholders, summaries, notes, and status text.
6. Pricing logic and test catalog admin UI.
7. Shared lab widgets embedded in breeder UI, including order cart, QR scanner, progress bar, and inline result entry.

### Phase 6: Replace Admin Portal UI

Update `breeding-app-admin/src/admin/AdminApp.jsx` in sections because it is a large single-file UI.

Priority order:

1. Layout, navigation, dashboard, pagination, modals, and shared controls.
2. Users list, user filters, user details, role/permission panels, reports, and audit log.
3. Admin actions, marketplace permissions, verification, lab account management.
4. Subscriptions, tiers, feature overrides, usage, pricing, and limits.
5. Messages, announcements, GDPR tools, placeholders, empty states, confirmations, and toast messages.

Move repeated admin labels into `admin.*` keys and generic controls into `common.*`.

### Phase 7: Automation And Guardrails

1. Add or update a translation audit script that scans only production UI files for:
   - JSX text nodes
   - `placeholder`
   - `aria-label`
   - `title`
   - `alt`
   - obvious toast/error/empty-state strings
2. Exclude:
   - `*.test.*`
   - service folders
   - shared API/config folders
   - dev-only panels
   - diagnostics banners
3. Add a locale parity script that fails on:
   - missing keys compared with English
   - extra keys not present in English
   - invalid JSON
4. Add a same-as-English report that warns, not fails, so intentional literals can be reviewed.
5. Wire the scripts into each app package or root package scripts.

### Phase 8: Verification

Run after each major app batch:

1. Locale key parity check for all four apps.
2. Same-as-English report.
3. Typecheck/build for the changed app.
4. Smoke test the main routes in English plus at least one non-English language:
   - Marketplace browse/listing detail/seller dashboard.
   - Breeder dashboard, animal edit, pairing/clutch, lab order, family tree.
   - Lab dashboard, incoming order, sample intake, result entry, order detail.
   - Admin dashboard, users, subscription tiers, lab accounts, messages, GDPR.
5. Visual pass for layout overflow in longer languages such as German, French, Portuguese, and Dutch.
6. RTL pass for Hebrew where supported by the app shell.

### Definition Of Done

- All production user-facing UI strings in the four app folders are routed through i18n.
- All locale files have the same keys as English.
- Same-as-English values are either translated or documented as intentional literals.
- No diagnostics/dev-only strings are counted as translation debt.
- Builds pass for every changed app.
- The audit file is updated with completed sections removed or marked complete.

### Implementation Progress

Started: 2026-06-30

Completed initial foundation work:

- Added root app-locale verification scripts:
  - `npm run i18n:verify:apps`
  - `npm run i18n:report:apps`
- Converted standalone marketplace subscription access UI to i18n:
  - `breeding-app-marketplace/src/features/subscriptions/FeatureAccessGuard.jsx`
  - `breeding-app-marketplace/src/features/subscriptions/PricingPage.jsx`
- Added translated marketplace locale keys for `featureAccess.*`, `pricing.*`, `common.back`, and `common.unknown` across:
  - `en`, `es`, `fr`, `it`, `de`, `nl`, `pl`, `pt`, `cs`, `he`
- Verified:
  - `npm run i18n:verify:apps`
  - `npm run typecheck` in `breeding-app-marketplace`
  - `npm run build` in `breeding-app-marketplace`

Known follow-up from the new verifier:

- Existing locale files contain extra non-English keys that are not present in English. The verifier currently reports these as warnings so translation work can continue without blocking; they should be reconciled before turning extra-key warnings into failures.

## Notes

- Some candidate strings are technical values or brand-like values and may intentionally stay untranslated, for example `VITE_API_URL`, `PCR`, `QR`, `BEL`, currency codes, and example gene names.
- Some `placeholder` examples can stay in English if they are technical examples, but the surrounding label/help text should still be translated.
- `SuggestionsTab.tsx` uses `<Trans>` for some strings, so those were not listed as hardcoded UI even though the English fallback text appears in source.
