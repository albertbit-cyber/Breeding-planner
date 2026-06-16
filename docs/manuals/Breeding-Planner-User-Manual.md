# Breeding Planner User Manual

This manual covers the breeder-facing Breeding Planner app. It does **not** cover the separate lab portal.

## Who This Manual Is For

Use this guide if you work in the main breeder application and need help with:

- animal records
- groups and status tags
- spaces, rooms, racks, and terrariums
- breeding projects and clutch tracking
- breeder-side shed testing
- calendar and exports
- backups and settings

If you are looking for lab-staff workflows such as incoming orders, result entry, completed tests, or catalog administration, that is the lab portal and is intentionally excluded here.

## What The App Does

Breeding Planner is a breeder workspace for:

- storing snake records and genetics
- tracking weight, feeding, sheds, cleanings, and medication
- organizing animals into groups and breeder availability
- planning pairings and breeding cycles
- generating QR labels and printable PDFs
- managing rooms, racks, and terrariums
- running a breeding advisor against your breeder collection
- ordering shed tests and reviewing breeder-side results/certificates
- exporting calendars, animal lists, and pairing data

## Before You Start

### Sign-in

The app uses an authentication screen before entering the main planner. Breeder users normally sign in with a breeder account. Public registration is breeder-focused.

### Where Your Data Lives

The breeder planner is still primarily local-first.

That means:

- your animal, pairing, group, settings, and backup data are stored locally in the browser or desktop app environment
- breeder-side shed testing and shared authentication depend on the shared backend

For day-to-day use, this means you should treat backups as important, especially if you mainly work in the browser.

### Main Navigation

The breeder app has these top-level sections:

1. `Animals`
2. `Spaces`
3. `Breeding Planner`
4. `Breeding Advisor`
5. `Shed Test Terminal`
6. `Calendar`
7. `Settings`

The search bar in the header is global to the current screen and is especially useful in the `Animals` and `Breeding Planner` areas.

## Animals

The `Animals` section is the main database for your collection.

### Views Inside Animals

The `Animals` area has four subviews:

- `All`
- `Males`
- `Females`
- `Groups`

In `All`, `Males`, and `Females`, you can switch between:

- `Cards`
- `List`

List view also supports a direct CSV list export.

### Searching And Filtering Animals

In the main animal view you can filter by:

- global search from the app header
- sex tab (`All`, `Males`, `Females`)
- status tag
- group visibility
- assigned vs unassigned grouping visibility

Status tags are user-managed labels such as:

- `Active`
- `Holdback`
- `Grow-out`
- `Breeder`
- `Quarantine`
- `For sell`
- `Sold`

You can add and delete custom tags from the app.

### Adding A New Animal

Use `+ Add Animal` in the Animals section.

The add-animal form supports:

- `Quick Add / Free Text`
- manual field entry
- automatic ID generation
- group assignment
- status tag selection or creation

The quick-add text box is designed for pasted animal descriptions. It can parse mixed text such as:

- ID
- sex
- genetics
- weight
- birth date
- feeding notes

Manual fields include:

- `Name`
- `ID`
- `Sex`
- `Tag`
- `Genetics`
- `Weight (g)`
- `Price` when the animal is tagged for sale
- `Year`
- `Birth date`
- `Group`

### Genetics Entry

Genetics are entered as morphs and hets in one field. The app accepts:

- one trait per line
- comma-separated text
- slash-separated text
- percentages for possible het notation

Examples:

- `Clown`
- `Pastel`
- `Het Hypo`
- `66% Het Pied`

If you enter leucistic shorthand such as `BEL`, the app may ask you to choose the exact underlying gene combination so genetics stay accurate.

### Animal Cards

Card view gives a compact summary of each snake:

- photo
- name
- ID
- sex
- birth date
- genetics
- recent activity blocks
- group membership
- price when tagged for sale
- related pairings

Each card includes direct actions such as:

- `Edit`
- `Pair`
- `Delete`

### Quick Logging From Animal Cards

The activity blocks on a snake card also act as quick-entry tools.

You can quickly add:

- feed records
- weight records
- cleaning records
- shed records
- medication records

Feed quick-entry supports:

- prey type
- prey size
- weight in grams
- feed method
- notes
- refused feed

The app remembers the last feed defaults you used so repeated feeding logs are faster.

### List View

List view is better when you want to compare many animals at once.

It shows key columns such as:

- name
- ID
- sex
- genetics
- weight
- status
- groups
- pairings

From list view you can still:

- edit the animal
- pair the animal
- order a genetic test
- delete the animal
- open linked pairings

### Editing An Animal

Open a snake from either card or list view to edit its full record.

The editor includes:

- status tag
- name
- ID
- sex
- birth date
- genetics
- weight
- price
- group
- pairing overview
- logs
- photos

It also provides breeder actions such as:

- `Export PDF`
- `QR label`
- `Order Genetic Test`

#### ID Management

Inside the editor you can:

- generate an ID if none exists
- update or regenerate the current ID

If you change an animal ID and save, the app also updates related pairings that point to that animal.

#### Logs

The editor contains a full log manager for:

- feeds
- weights
- sheds
- cleanings
- meds

This is the most complete place to edit history, even if you often use the quicker card-level logging.

#### Photos

Each animal can store photos. You can:

- take a photo on supported devices
- upload files
- set or clear the displayed image
- view the photo gallery for that snake

### Groups

If you switch the animal subview to `Groups`, the app shows each group as a collection bucket.

You can:

- create a new group
- open animals inside a group
- delete a group that is no longer in use

Important:

- a group cannot be deleted if animals still use it
- use the animal editor to assign or change group membership

### QR Tools In Animals

The Animals section includes:

- `Export QR`
- `Scan QR`

Use these for label workflows and quick identification. QR label export is also available from the animal editor.

### Importing Animals

Use `Import Animals` to bring in records from pasted text or supported file formats.

The import workflow includes:

- paste/import source data
- parse preview
- genetics normalization
- preview review before final import

This is useful for migrating older lists or breeder records into the app.

## Spaces

The `Spaces` section is for physical housing layout.

It tracks:

- rooms
- heat racks
- terrariums
- snake placement

### Rooms

Start by creating rooms.

Each room shows:

- room name
- rack count
- terrarium count
- empty vs occupied summary

You can:

- create a room
- rename a room
- delete a room
- reorder rooms
- open a room for detailed management

### Heat Racks

Inside a room you can create heat racks and manage slots.

Typical rack actions include:

- create rack
- edit rack
- delete rack
- open rack view
- assign snakes to slots

The app is aware of already-occupied animals so you do not accidentally place the same snake into multiple rack slots without updating placement.

### Terrariums

You can also create terrariums inside a room.

Typical terrarium actions include:

- create terrarium
- edit terrarium
- delete terrarium
- open terrarium view
- update occupants

### Practical Use

Use `Spaces` when you want a physical layout view rather than a genetics or breeding view.

This is most useful for:

- locating animals quickly
- planning housing changes
- keeping rack occupancy organized

## Breeding Planner

The `Breeding Planner` section manages pairings and the breeding cycle.

### Views Inside Breeding Planner

There are three pairing views:

- `Active`
- `Completed`
- `Incubator`

There is also pairing search and optional completed-year filtering.

### Breeders Group Rule

Only animals in the `Breeders` group can be paired.

If you try to pair an animal that is not in `Breeders`, the app can prompt you to add it there first.

This matters in two places:

- manual pairing creation
- the Breeding Advisor

### Creating A Pairing

Click `New pairing`.

The pairing form lets you:

- search breeder males
- search breeder females
- choose the male and female
- set a start date
- add notes

The app builds a default pairing label from the selected male and female names.

### Pairing Record Contents

Each pairing can contain:

- label
- start date
- appointments
- pairing dates
- lock dates
- lifecycle milestones
- notes
- genetics odds
- hatchling links

### Appointments

Appointments are the repeating breeding touchpoints for a pairing.

You can:

- generate a 5-month appointment schedule
- add appointments manually
- mark appointments as done
- store actual pairing dates
- record locks and lock dates
- add notes per appointment

The app uses these appointments in the calendar.

### Lifecycle Tracking

The pairing lifecycle editor is where you track breeding progress such as:

- ovulation
- pre-lay shed
- clutch date
- fertile eggs
- slugs
- hatch date

This gives the app enough information to:

- calculate breeding cycle progress
- move projects into historical/completed states
- populate incubator and calendar data

### Clutch Cards

Once a clutch date exists, you can generate a clutch card PDF.

The clutch card can include:

- clutch number
- clutch date
- male and female names
- male and female genetics
- egg count
- pairing label

### Incubator View

The `Incubator` view summarizes egg boxes generated from clutch data.

It shows:

- clutch/box number
- year
- pairing label
- laid and due timing
- egg count
- remaining time or progress

Use this view after clutch information has been recorded.

### Completed Projects

Completed projects are listed separately from active ones. You can also filter them by year.

This is useful for:

- reviewing past seasons
- checking breeding history
- finding older clutch records

### Pairing Genetics Calculator

Each pairing can show breeding outcome odds when the app can compute them from the parents’ genetics.

This includes:

- per-gene outcome odds
- combined odds
- projected visuals
- projected hets
- holdback-oriented output

Use this to evaluate whether a pairing is worth continuing before moving to the Breeding Advisor.

### Pairing QR Labels

The pairing section includes `Pairing QR labels` so you can print pairing-specific labels.

## Breeding Advisor

The `Breeding Advisor` is a goal-based recommendation tool.

### What It Uses

The advisor only evaluates animals tagged in the `Breeders` group.

If the right animals are not in that group, the advisor may return no useful recommendations.

### How To Run It

1. Open `Breeding Advisor`
2. Enter your goal in natural language
3. Optionally refine goal traits
4. Run the advisor
5. Review ranked suggestions

Example goal text:

- `I want to make clown desert ghost with pastel and possible het pied`

### Goals

The advisor works from explicit goal traits.

Goals can include:

- required traits
- optional traits
- avoid traits
- recessive state preference
- minimum probability
- weighting

### Advisor Output

For each recommended pairing, the advisor can show:

- goal success chance
- projected visuals
- projected hets
- holdback-relevant traits
- next-generation plan hints
- demand and price guidance when available

### Actions You Can Take

On suggestions, you can typically:

- accept the pairing
- convert the suggestion into a breeding plan
- open a breeding plan / flowchart
- ignore the suggestion

### Exporting Advisor Results

The advisor also supports exporting pairings by male for review outside the app.

## Shed Test Terminal

This section is breeder-facing shed testing inside the main app. It is **not** the lab portal.

### What It Is For

Use it to:

- review breeder-side shed testing activity
- see pending/shared shed order behavior
- open label PDFs
- check order status
- view results and certificates once completed

### How Orders Are Created

The main breeder order entry point is usually:

1. open a snake
2. click `Order Genetic Test`
3. choose breeder-visible tests from the catalog
4. submit the order

The order form shows:

- snake summary
- current genetics snapshot
- breeder-visible test catalog
- optional notes

### Order History On A Snake

Inside the snake editor, the breeder shed testing panel shows:

- all orders for that snake
- order number
- order date
- requested tests
- status
- payment status
- linked result count
- label PDF actions
- certificate availability

### Certificates And Results

When an order is completed, the breeder-side order details can show:

- latest result
- findings summary
- certificate number
- certificate verification code
- certificate PDF view/download actions

### Shared Backend Note

Shed testing depends more heavily on the shared backend than the rest of the breeder app.

If the shared backend is unavailable:

- order submission may be blocked
- history may not load
- certificate retrieval may fail

## Calendar

The `Calendar` section combines animal care events and breeding events into one monthly view.

### Event Types

The calendar can show:

- feeds
- weights
- cleanings
- sheds
- meds
- breeding appointments
- clutch actions

### Navigation

You can:

- move to previous/next month
- change month directly
- change year

### Filters

The calendar has toggles for event categories so you can focus on the timeline you need.

You can also filter by male to isolate breeding projects tied to one sire.

### Breeding Reminders

The calendar builds pairing reminders from breeding appointments and surfaces near-term reminders for upcoming work.

### Exports

The calendar supports:

- `Export Google Calendar` (`.ics`)
- `Export Full Calendar`
- `Export appointment sheet`

Use:

- monthly export for a single current-view calendar file
- full calendar export for the full known event range
- appointment sheet for breeding appointment spreadsheets

### Google Calendar Sync

If Google Calendar integration is configured in the environment, the app can:

- connect to a Google account
- list calendars
- sync the current view
- sync a multi-month range

If those controls are unavailable, Google integration is probably not configured in the current deployment.

## Settings

The `Settings` section contains operational tools for the breeder app.

It is one of the most important sections in the application.

### 1. Info

Use `Info` to maintain breeder identity and branding.

Fields include:

- name
- business name
- email
- phone
- street
- postal code
- city
- country
- logo upload

This information is reused in breeder-facing outputs such as PDFs and labels.

### 2. ID Wizard

The `ID generator wizard` defines how automatic snake IDs are created.

You can configure:

- the ID template
- sequence padding
- uppercase behavior
- custom free-text token value

The wizard also includes a live preview so you can test example IDs before adopting a format.

Available token types include year, gene chunks, sex, sequence, and custom text.

Use this before importing or mass-adding animals if you want consistent IDs.

### 3. Morph Alias Manager

Use this when you want the app to understand combo names or shorthand morph references.

Examples:

- `Batman`
- `Pompeii`

Each alias maps an informal combo name to the underlying genes.

You can:

- add alias rows
- edit alias rows
- delete alias rows
- import alias JSON
- export alias JSON

### 4. Gene Alias Manager

Use this when you want parsing to normalize shorthand gene names.

Examples:

- `OD` to `Orange Dream`

You can:

- define canonical gene names
- define alternate aliases
- define shorthand values
- import/export JSON

This is especially useful when importing mixed breeder data from different naming styles.

### 5. Exports

The export tab supports both animal exports and pairing exports.

#### Animal Exports

You can export animals as:

- PDF
- Excel sheet (`.xlsx`)

You can also choose which fields are included.

#### Pairing Exports

You can export pairings as:

- PDF
- Excel sheet (`.xlsx`)
- CSV

The pairing export area also supports:

- export layout options
- pairing filters
- field selection
- optional inclusion of unpaired males in some layouts

### 6. Appearance

Use `Appearance` to control the look of the app.

This includes:

- theme mode
- color palette
- font choices
- preset appearance profiles
- saved custom presets

This is useful when you want a brighter/darker working environment or stronger contrast.

### 7. Backups

The backup area is critical for safe use of the breeder app.

#### Manual Backup

You can:

- download a full backup file
- save a backup directly into the in-app vault

#### Automatic Backups

You can schedule automatic backups while the planner is open:

- off
- nightly
- weekly
- monthly

You can also:

- run an automatic backup immediately
- download the latest auto snapshot

#### Backup Vault

The vault stores internal backups with IDs and metadata.

From the vault you can:

- download a saved backup
- restore a saved backup
- rename a saved backup
- delete a saved backup
- set retention limits

#### Restore

You can restore from:

- a Breeding Planner backup file
- legacy JSON

Important:

- restoring replaces the current app data
- create a fresh backup first if you are unsure

### 8. Language

Use `Language` to switch the app language through the built-in language selector.

## Recommended Daily Workflows

### Daily Collection Maintenance

1. Open `Animals`
2. Search the snake you want
3. Use quick logs or open the full editor
4. Record feed, weight, shed, cleaning, or meds
5. Return to the list and continue

### Adding New Animals

1. Open `Animals`
2. Click `+ Add Animal`
3. Paste quick text or enter data manually
4. Confirm genetics, group, and ID
5. Save

### Starting A New Breeding Project

1. Ensure both animals are in the `Breeders` group
2. Open `Breeding Planner`
3. Click `New pairing`
4. Choose breeder male and female
5. Set start date and notes
6. Generate appointments if needed

### Tracking A Clutch

1. Open the pairing
2. Record lifecycle events
3. Add clutch date and egg counts
4. Generate a clutch card PDF if needed
5. Use incubator view once eggs are in process

### Ordering A Genetic Test

1. Open a snake
2. Click `Order Genetic Test`
3. Select requested tests
4. Add optional notes
5. Submit
6. Revisit the snake’s shed testing panel for labels, status, and certificate

### Staying Safe With Data

1. Open `Settings`
2. Create a manual backup regularly
3. Set an automatic backup schedule
4. Use the backup vault for versioned recovery points

## Best Practices

- Put breeder animals in the `Breeders` group early so pairing and advisor tools work correctly.
- Keep birth dates as accurate as possible. They improve IDs, timelines, and historical clarity.
- Use tags consistently so filtering stays useful.
- Record care logs in the app as you go. The calendar becomes much more useful when logs are complete.
- Back up before major imports, cleanup work, or season resets.
- Use alias managers if your collection uses shorthand, combo nicknames, or inconsistent morph naming.

## Troubleshooting

### I Cannot Pair A Snake

Check whether the snake is in the `Breeders` group. The pairing workflow is restricted to breeder animals.

### The Advisor Shows No Useful Suggestions

Check:

- whether your target animals are in the `Breeders` group
- whether your goals are realistic for the genetics you actually have
- whether goal traits are written in a way the app can recognize

### Shed Testing Does Not Submit

This is usually a shared-backend issue rather than an animal-record issue. Check whether the app is connected and authenticated.

### My Calendar Looks Empty

Check:

- the current month/year
- event-type filters
- whether the pairing or care logs actually have dates recorded

### I Am Worried About Losing Data

Create a manual backup immediately from `Settings > Backups`, then use the vault and automatic backup schedule going forward.

## Scope Note

This manual intentionally stops at the breeder-facing app.

It includes the breeder-side shed testing features that appear in the main planner, but it does **not** document the separate lab portal used for:

- incoming orders
- result entry
- completed tests management
- lab catalog administration
- pricing administration
- admin oversight
