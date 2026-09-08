# Settings — Website Handoff

**Product:** Serpentora Breeder App
**Section:** Settings (in-app: *Setup*)
**Status:** Shipping. Under active development — further capability planned.
**Prepared:** 2026-09-02

---

## One-line positioning

> Settings is where the app learns how *you* run your collection — your identity, your naming
> conventions, your morph vocabulary — and then applies it automatically everywhere else.

Most breeding software makes you re-enter the same details on every label, every order, every
export. Serpentora asks once. Everything downstream inherits it.

---

## Website copy — section by section

### Breeder Information
*The details you enter once and never type again.*

Your name, business name, logo, email, phone and full postal address are stored as your breeder
profile. From that moment on, they carry through the product on their own: your logo and business
name appear in the app header, on exported PDFs and on QR labels, and — critically — your name and
address are pre-filled into every Shed Test order you place with a partner laboratory, onto the
shipping label, and onto the returned certificate. No re-typing an address into a lab form at 11pm
the night before a shipment goes out.

**Website angle:** *"Set up your identity once. It follows every label, export and lab order you
ever send."*

---

### ID Generator Wizard
*Your naming convention, automated.*

Every breeder has a system for identifying animals — and no two systems are the same. Rather than
force a format on you, Serpentora lets you build your own from tokens, then generates matching IDs
automatically whenever you add an animal, produce a clutch, or import a collection.

Available building blocks include:

| Token | Produces |
| --- | --- |
| `[YR]` / `[YEAR]` | Two- or four-digit current year |
| `[YROB]` / `[YEAROB]` | Two- or four-digit **birth** year |
| `[GEN3]` | First three letters of each gene — *Enchi Fire Clown to EncFirClo* |
| `[HETS]` | Compact het markers — *50%Hclo* |
| `[SEX]` | F or M |
| `[NAME]`, `[NAMEU]`, `[NAMEL]`, `[INITIALS]`, `[SLUG]` | Name-derived fragments in the casing you choose |
| `[PREFIX]`, `[PAREN]`, `[TEXT]` | Prefixes, parenthetical codes and your own free text |
| `[SEQ]` | Running sequence number, with configurable zero-padding |
| `[DASH]` | Literal separator |

You also control sequence padding, uppercase enforcement, and your free-text snippet. A **live
preview** renders a real example ID from sample values as you edit, so you can see the result before
you commit to it. The sequence token is protected — if you leave it out, the app appends it for you
so two animals can never collide.

**Website angle:** *"Build your own ID format from the pieces that matter to you — birth year,
genetics, sex, sequence — and let the app apply it to every animal, every hatchling, every import."*

---

### Morph Alias Manager
*Teach the app the names you actually use.*

The hobby names combinations faster than any database can keep up. When you acquire a new combo, or
your community settles on a name for something, you add it here once: the alias, the genes behind
it, and an optional note. From then on you can type the combo name into an animal's genetics field
and the app resolves the underlying genes for you — correctly, and consistently across the whole
collection.

Aliases can be imported and exported as JSON, so a naming set can be shared, backed up or moved
between machines. The app ships with a starting library of 137 common combo aliases.

**Website angle:** *"Type 'Batman'. The app knows what's underneath it."*

---

### Gene Alias Manager
*One gene, many names — handled.*

Genes rarely have a single agreed name, and almost always have shorthand. The Gene Alias Manager is
where you record the canonical gene name alongside every alias and shorthand it travels under — so
that `OD` and `Orange Dream` are understood as the same gene wherever they appear. Parsing, search
and pairing calculations all read from this list. Like morph aliases, gene aliases import and export
as JSON.

**Website angle:** *"Your gene vocabulary, standardised — so the app understands your shorthand as
well as you do."*

---

### Data Exports
*Get your collection out, in whatever form the moment needs.*

Choose exactly which fields to include, choose which animals to include (all, by group, by tag, or
hand-picked), and then export in the format that suits:

- **PDF** — presentation-ready summaries for animals and breeding projects
- **Spreadsheet (.xlsx)** — opens directly in Excel, Numbers or Google Sheets for your own analysis
- **Sales catalog** — an automatically generated, illustrated PDF catalog of your available animals
- **Text list** — a clean, plain-text list built for pasting straight into a message, a group chat,
  a forum post or a classified ad; copy it to the clipboard or save it as a file

The same section also holds **label configuration** — thermal and sheet label presets, brand presets,
custom dimensions and a live preview — covering both shipping labels and the individual sample QR
labels used in the shed-testing workflow.

**Website angle:** *"One collection. A PDF for your records, a spreadsheet for your numbers, a
catalog for your buyers, and a text list for your group chat."*

---

### Appearance
*The app should look the way you want it to look.*

Full visual control: light, dark, high-contrast or match-system theming; six typefaces; four text
sizes and three line-spacing options; three layout densities; three border styles; and direct
control over the primary, secondary, accent, background, card and text colours. Animation and
reduced-motion toggles are included, along with a dedicated visually-impaired preset for higher
contrast and larger type. Save your own combinations as named presets and switch between them, with
a live preview of every change.

**Website angle:** *"From high-contrast accessibility to your own brand palette — the interface
adapts to you, not the other way round."*

---

### Backups
*Your records, protected on every axis.*

- **Manual backup** — download a complete backup file containing every animal, pairing, group, your
  breeder info and all your settings
- **Automatic backups** — nightly, weekly or monthly snapshots taken while the planner is open, with
  the last run and its contents shown at a glance
- **Backup vault** — stored backups with unique identifiers, which you can rename, download, restore
  or delete, with a configurable retention limit
- **Restore** — reinstate from a Serpentora backup file, or import a legacy JSON export
- **Cloud database sync** — push your collection to the cloud on demand, with connection,
  authentication and last-sync status shown plainly
- **Photo compression** — optional automatic shrinking of stored photos to keep your data light

**Website angle:** *"Automatic snapshots, a versioned vault, one-click restore and cloud sync. Years
of breeding records shouldn't live in one place."*

---

### My Account
*Everything about your account, in one place.*

Review your login details, name, role and account ID; check your backend connection and sync
readiness; see your subscription tier and exactly which features it unlocks, alongside the available
plans. Change your email or password, download a complete copy of your data by category, and — if
you ever choose to — schedule account deletion, with the option to cancel before it takes effect.

**Website angle:** *"Full visibility and full control — including the right to take your data with
you."*

---

### Language
*Ten languages, and counting.*

The app is fully translated into **English, Spanish, French, Italian, German, Dutch, Polish,
Portuguese, Czech and Hebrew** — including right-to-left support. Your choice is remembered, and the
interface switches instantly.

**Website angle:** *"Built for an international hobby. Ten languages today, more on the way."*

---

## Suggested website section

> ### Settings that do the work for you
>
> Serpentora's Settings section isn't a list of checkboxes — it's where the app learns your
> operation. Enter your breeder details once and they flow into every label, export and laboratory
> order. Design your own animal ID format from birth year, genetics, sex and sequence, and let the
> app apply it automatically to every animal you add, hatch or import. Teach it the combo names and
> gene shorthand you actually use, and it will understand them everywhere. Then export your
> collection as a PDF, a spreadsheet, a sales catalog or a ready-to-send text list; make the
> interface look exactly the way you want; and rest easy behind automatic backups, a versioned
> backup vault and cloud sync — in any of ten languages.

---

## Development status — please include on the site

Serpentora is under **active development**. The Settings section described here is live and in daily
use, and it is expanding: further export destinations, deeper cloud synchronisation, richer alias
tooling and additional languages are all on the roadmap, alongside major new modules elsewhere in
the product. Suggested site wording:

> **Serpentora is in active development.** Everything described here is available today — and new
> capabilities ship regularly. Features are shaped directly by the breeders using them, so if
> there's something your operation needs, tell us.

---

## Notes for whoever builds the page

- The in-app section is labelled **Setup** in the navigation; **Settings** is the better word for
  the website. Keep it consistent across marketing.
- Strongest screenshot candidates, in order: the **ID Generator Wizard** with its live preview
  (it shows the value instantly), the **Appearance** panel with its preview, and the **Data
  Exports** field picker.
- The through-line worth keeping in every headline: *enter it once, and the app applies it
  everywhere.* That is the real differentiator, not the feature count.
- Do not promise a Google Sheets integration. Exports are `.xlsx` files, which open in Google Sheets
  — phrase it as compatibility, not integration.
