/* Copy for the v6 marketing site, lifted verbatim from `Serpentora Site v6.dc.html`.
 *
 * The wording is the design's, not ours to improve in passing: the handoff brief
 * is explicit that the copy — including where it admits a limitation — is part of
 * the brand. Change it deliberately or not at all. */

export const LOOK_KEY = 'serpentora.v6.look';

/** The ~15 ball python genes the calculator understands. */
export const GENES = [
  { name: 'Pied', type: 'rec' },
  { name: 'Clown', type: 'rec' },
  { name: 'Albino', type: 'rec' },
  { name: 'Desert Ghost', type: 'rec' },
  { name: 'Pastel', type: 'inc', superName: 'Super Pastel' },
  {
    name: 'Lesser',
    type: 'inc',
    superName: 'Blue Eyed Leucistic',
    complex: 'BEL complex — Lesser and Butter are the same complex',
  },
  { name: 'Enchi', type: 'inc', superName: 'Super Enchi' },
  { name: 'Banana', type: 'inc', superName: 'Super Banana' },
  { name: 'Yellow Belly', type: 'inc', superName: 'Ivory' },
  {
    name: 'Cinnamon',
    type: 'inc',
    superName: 'Super Cinnamon',
    warn: 'Super Cinnamon carries a kinking risk.',
  },
  {
    name: 'Spider',
    type: 'dom',
    superName: 'Super Spider',
    warn: 'Spider carries wobble; the super form is not viable.',
  },
];

/** Chip caption per gene type, indexed by copies (0, 1, 2). */
export const TAGS = {
  rec: ['', 'het', 'visual'],
  inc: ['', 'visual', 'super'],
  dom: ['', 'visual', 'super'],
};

export const SEASON = [
  {
    step: '01',
    title: 'Pairing & locks',
    body: 'Five-month appointment schedule generated on creation; locks recorded per appointment, with notes — on the same screen.',
    shot: 'Still · pairing schedule with lock log',
  },
  { step: '02', title: 'Ovulation', body: 'Milestone logged; pre-lay shed follows.', shot: 'Still · milestones' },
  { step: '03', title: 'Clutch', body: 'Fertile eggs and slugs counted on lay.', shot: 'Still · clutch card' },
  { step: '04', title: 'Incubator', body: 'Egg boxes with due dates and time remaining.', shot: 'Still · incubator' },
  { step: '05', title: 'Hatch', body: 'Hatchlings join the collection and the tree.', shot: 'Still · pedigree node' },
];

export const LAB_CHAIN = [
  {
    n: '01',
    title: 'Order from the animal',
    body: 'Pick a test inside the animal’s own record — 40+ morph tests plus sex determination.',
  },
  {
    n: '02',
    title: 'Print the sample label',
    body: 'A label PDF goes on the sample. Order and payment status stay live in the app.',
  },
  {
    n: '03',
    title: 'The lab enters the result',
    body: 'Partner labs work intake and result entry in their own portal.',
  },
  {
    n: '04',
    title: 'Certificate on the record',
    body: 'A numbered certificate with a verification code a buyer can check, attached to the animal.',
  },
];

export const SOURCE_RISK = [
  {
    source: 'Bred here',
    days: 'none',
    why: 'Hatched in your own collection — nothing to quarantine against',
  },
  { source: 'Known breeder', days: '90 days', why: 'A breeder whose room and practices you know' },
  { source: 'Shop', days: '120 days', why: 'Mixed stock and shared airspace, unknown sources upstream' },
  {
    source: 'Expo or show',
    days: '120 days',
    why: 'Shared tables and handling with dozens of other collections',
  },
  { source: 'Import', days: '180 days', why: 'Long transport, mixed shipments, high stress on arrival' },
  {
    source: 'Wild-caught',
    days: '180 days',
    why: 'Assume parasites — extended observation and repeat faecals',
  },
  { source: 'Unknown', days: '120 days', why: 'Treated as medium risk until you know more' },
];

export const Q_BOARD = [
  { count: '6', label: 'In quarantine' },
  { count: '2', label: 'Check due' },
  { count: '1', label: 'Awaiting results' },
  { count: '1', label: 'Flagged' },
];

export const WEEKLY_CHECK = [
  { label: 'Mites', answer: 'None seen' },
  { label: 'Breathing', answer: 'Normal' },
  { label: 'Stool', answer: 'Normal' },
  { label: 'Shed', answer: 'Not in shed' },
];

export const CHECK_MAP = [
  'Mites',
  'Eyes',
  'Breathing',
  'Body condition',
  'Vent',
  'Skin & scales',
  'Shed',
  'Stool & urates',
];

export const TIPS = [
  'Wipe the snake with a white paper towel — specks show against white that you will never see against a patterned snake.',
  'Look at the water bowl. Drowned mites float, and are often the first sign anyone sees.',
  'Hold the shed up and count the eye caps. If they are not in the shed, they are still on the snake.',
  'Weigh weekly and trust the trend — fifty grams lost over a month is invisible to the eye and obvious in a column of numbers.',
];

export const DIAGNOSTICS = [
  {
    group: 'BASELINE',
    tests: ['Faecal flotation', 'Direct faecal smear', 'Acid-fast stain', 'Veterinary examination'],
    limit: 'One clean faecal float proves very little — parasites shed intermittently.',
  },
  {
    group: 'MOLECULAR (PCR)',
    tests: [
      'Cryptosporidium',
      'Serpentovirus (nidovirus)',
      'Reptarenavirus (IBD)',
      'Adenovirus',
      'Ophidiomyces (SFD)',
    ],
    limit:
      'A negative cloacal swab for Cryptosporidium is weaker evidence than it looks, and a negative IBD PCR does not clear an animal.',
  },
  {
    group: 'ON SUSPICION',
    tests: ['Bacterial culture and sensitivity'],
    limit: 'Run when something specific points to it, on a vet’s call — not as routine screening.',
  },
];

export const Q_RECORD = [
  {
    name: 'Intake check',
    body: 'A six-point examination on arrival — mites, eyes, breathing, condition, vent, skin — plus intake weight as the baseline.',
  },
  { name: 'Observation', body: 'The full history of weekly checks, not just the latest.' },
  {
    name: 'Tests',
    body: 'Date, test, vet or laboratory, and result: awaiting, clear, positive or inconclusive.',
  },
  {
    name: 'Treatments',
    body: 'Date, what was given, dose and reason — with a prompt to restart the clock after a mite treatment.',
  },
  { name: 'Clock', body: 'Restart and extend are both recorded with your reason.' },
  {
    name: 'History',
    body: 'An audit trail of every transition, so the record explains itself months later.',
  },
];

export const GATES = [
  { mark: '✓', label: 'Planned duration served', reason: '120 of 120 days', color: 'var(--accent)' },
  {
    mark: '✓',
    label: 'At least one clear test on file',
    reason: 'Faecal float, 04 Jul',
    color: 'var(--accent)',
  },
  {
    mark: '○',
    label: 'A clear test in the last 30 days',
    reason: 'nothing clear in the last 30 days',
    color: 'var(--warn)',
  },
  { mark: '✓', label: 'Weight stable or gaining since intake', reason: '+180 g', color: 'var(--accent)' },
  { mark: '✓', label: 'Feeding in the last 30 days', reason: 'Fed 6 days ago', color: 'var(--accent)' },
  {
    mark: '○',
    label: 'No mites since the last treatment',
    reason: 'mites seen since the treatment on 12 Aug',
    color: 'var(--warn)',
  },
];

export const SETTINGS = [
  {
    n: '01',
    title: 'Breeder information',
    kicker: 'The details you enter once and never type again.',
    body: 'Your name, business name, logo, email, phone and postal address are stored as your breeder profile. From then on they carry through on their own: your logo and business name appear in the app header, on exported PDFs and on QR labels — and your details pre-fill every shed test order, shipping label and returned certificate.',
    angle: 'Set up your identity once. It follows every label, export and lab order you ever send.',
  },
  {
    n: '02',
    title: 'ID generator wizard',
    kicker: 'Your naming convention, automated.',
    body: 'Build your own ID format from tokens — birth year, genetics, hets, sex, initials, prefixes, free text and a running sequence — then the app generates matching IDs whenever you add an animal, produce a clutch or import a collection. A live preview renders a real example as you edit.',
    angle: 'Build your own ID format, and let the app apply it to every animal, hatchling and import.',
    showTokens: true,
  },
  {
    n: '03',
    title: 'Morph alias manager',
    kicker: 'Teach the app the names you actually use.',
    body: 'When your community settles on a name for a combo, add it once: the alias, the genes behind it, and an optional note. Type the combo name into an animal’s genetics field and the app resolves the underlying genes — consistently across the whole collection. Ships with 137 common combo aliases; imports and exports as JSON.',
    angle: 'Type “Batman”. The app knows what’s underneath it.',
  },
  {
    n: '04',
    title: 'Gene alias manager',
    kicker: 'One gene, many names — handled.',
    body: 'Record the canonical gene name alongside every alias and shorthand it travels under, so OD and Orange Dream are understood as the same gene wherever they appear. Parsing, search and pairing calculations all read from this list.',
    angle: 'Your gene vocabulary, standardised — so the app understands your shorthand as well as you do.',
  },
  {
    n: '05',
    title: 'Data exports',
    kicker: 'Get your collection out, in whatever form the moment needs.',
    body: 'Choose exactly which fields and which animals — all, by group, by tag, or hand-picked — then export as a PDF, a spreadsheet, an illustrated sales catalog or a plain-text list. Label configuration for thermal and sheet labels lives here too, for shipping labels and sample QR labels alike.',
    angle:
      'A PDF for your records, a spreadsheet for your numbers, a catalog for your buyers, a text list for your group chat.',
    showExports: true,
  },
  {
    n: '06',
    title: 'Appearance',
    kicker: 'The app should look the way you want it to look.',
    body: 'Light, dark, high-contrast or match-system theming; six typefaces; four text sizes and three line-spacing options; three layout densities; three border styles; and direct control over primary, secondary, accent, background, card and text colours. Animation and reduced-motion toggles, a visually-impaired preset, and your own combinations saved as named presets.',
    angle: 'From high-contrast accessibility to your own brand palette — the interface adapts to you.',
    showAppearance: true,
  },
  {
    n: '07',
    title: 'Backups',
    kicker: 'Your records, protected on every axis.',
    body: 'Download a complete manual backup of every animal, pairing, group and setting. Take nightly, weekly or monthly automatic snapshots while the planner is open. Keep them in a backup vault with identifiers you can rename, download, restore or delete under a retention limit you set. Restore from a Serpentora backup or a legacy JSON export; push to cloud sync on demand.',
    angle: 'Years of breeding records shouldn’t live in one place.',
  },
  {
    n: '08',
    title: 'My account',
    kicker: 'Everything about your account, in one place.',
    body: 'Review your login details, role and account ID; check your backend connection and sync readiness; see your tier and what it unlocks. Change your email or password, download a complete copy of your data by category, and — if you ever choose to — schedule account deletion, with the option to cancel before it takes effect.',
    angle: 'Full visibility and full control — including the right to take your data with you.',
  },
  {
    n: '09',
    title: 'Language',
    kicker: 'Ten languages, and counting.',
    body: 'The app is fully translated into ten languages, including right-to-left support. Your choice is remembered, and the interface switches instantly.',
    angle: 'Built for an international hobby. Ten languages today, more on the way.',
    showLanguages: true,
  },
];

export const ID_TOKENS = [
  { token: '[YR] / [YEAR]', produces: 'Two- or four-digit current year' },
  { token: '[YROB] / [YEAROB]', produces: 'Two- or four-digit birth year' },
  { token: '[GEN3]', produces: 'First three letters of each gene — Enchi Fire Clown to EncFirClo' },
  { token: '[HETS]', produces: 'Compact het markers — 50%Hclo' },
  { token: '[SEX]', produces: 'F or M' },
  { token: '[NAME] [NAMEU] [NAMEL]', produces: 'Name-derived fragments in the casing you choose' },
  { token: '[INITIALS] / [SLUG]', produces: 'Initials, or a slugified name' },
  { token: '[PREFIX] [PAREN] [TEXT]', produces: 'Prefixes, parenthetical codes and your own free text' },
  { token: '[SEQ]', produces: 'Running sequence number, with configurable zero-padding' },
  { token: '[DASH]', produces: 'Literal separator' },
];

export const ID_PREVIEW = '25-EncFirClo-50%Hclo-F-0142';

export const EXPORTS = [
  { name: 'PDF', body: 'Presentation-ready summaries for animals and breeding projects.' },
  { name: 'Spreadsheet', body: '.xlsx — opens directly in Excel, Numbers or Google Sheets.' },
  {
    name: 'Sales catalog',
    body: 'An automatically generated, illustrated PDF catalog of your available animals.',
  },
  {
    name: 'Text list',
    body: 'A clean plain-text list built for pasting straight into a message, forum post or classified ad.',
  },
];

export const LANGUAGES = [
  'English',
  'Español',
  'Français',
  'Italiano',
  'Deutsch',
  'Nederlands',
  'Polski',
  'Português',
  'Čeština',
  'עברית',
];

export const STEPS = [
  {
    n: '1',
    title: 'Create your account',
    body: 'Set up your keeper profile in under two minutes — no card, no trial clock.',
  },
  {
    n: '2',
    title: 'Add your collection',
    body: 'Log animals manually or in bulk. Record genetics, health history and photos.',
  },
  {
    n: '3',
    title: 'Plan, breed, hold back',
    body: 'Use the genetic calculator and Advisor, order lab tests, and track the season through to hatch.',
  },
];

export const AGAINST = [
  'A spreadsheet doesn’t know that Lesser and Butter are the same complex.',
  'It won’t warn you about a lethal super before you make the pairing.',
  'And it will never remind you a pairing is due.',
];

export const PLANS = [
  { name: 'Free', limit: '20', body: 'Get started at no cost, forever.', cta: 'Waitlist', popular: false },
  { name: 'Hobby', limit: '100', body: 'For the growing hobbyist.', cta: 'Waitlist', popular: false },
  {
    name: 'Hobby Plus',
    limit: '250',
    body: 'More room for a serious collection.',
    cta: 'Waitlist',
    popular: false,
  },
  {
    name: 'Breeder',
    limit: '500',
    body: 'For dedicated breeders running a full season.',
    cta: 'Waitlist',
    popular: true,
  },
  {
    name: 'Professional',
    limit: 'Unlimited',
    body: 'No limits. Full team access.',
    cta: 'Get in touch',
    popular: false,
  },
];

export const INVENTORY = [
  'Animal management & health logs',
  'Genetic calculator & morph prediction',
  'Breeding records & clutch management',
  'Shed testing & lab orders',
  'Breeding season calendar',
  'AI breeding advisor & tools',
  'QR labels & exports',
  'Telegram alerts & notifications',
  'Mobile app & desktop',
  'Spaces & rack management',
  'Family tree & passport',
  'Backups & restore points',
  'Quarantine clock, checks & clearance',
  'Custom ID generator',
  'Morph & gene alias libraries',
  'Ten languages, incl. right-to-left',
];

export const FEATURES = [
  {
    n: '01',
    title: 'Animals & collection',
    body: 'Weights, feeds, sheds, sexing, photos and IDs — one record per animal, from hatch to sale.',
  },
  {
    n: '02',
    title: 'Genetic calculator',
    body: '635 genes across 21 species, with per-gene odds, combined odds and the working shown.',
  },
  {
    n: '03',
    title: 'Pairings & clutches',
    body: 'Introductions, locks, ovulation, lay, incubation and hatch, on one season timeline.',
  },
  {
    n: '04',
    title: 'Pedigree & COI',
    body: 'Four generations, shared ancestors and inbreeding coefficient as a graph you can walk.',
  },
  {
    n: '05',
    title: 'Quarantine',
    body: 'Isolation clocks set by source risk, weekly checks and flags that reach a vet in time.',
  },
  {
    n: '06',
    title: 'Lab testing',
    body: 'Request, sample, lab, result — chain of custody attached to the animal permanently.',
  },
  {
    n: '07',
    title: 'QR rack scanning',
    body: 'Print labels, scan a tub on your phone, open the right animal without typing.',
  },
  {
    n: '08',
    title: 'Marketplace',
    body: 'List animals with pedigree and lab results already attached to the listing.',
  },
  {
    n: '09',
    title: 'Species library',
    body: 'Care, sexing and season rules per species, written for the animals you actually keep.',
  },
  {
    n: '10',
    title: 'ID generator',
    body: 'Build your own ID format from tokens; the app applies it to every animal and hatchling.',
  },
  {
    n: '11',
    title: 'Morph & gene aliases',
    body: 'Teach it the names your community uses; it resolves them to the underlying genes.',
  },
  {
    n: '12',
    title: 'Exports & labels',
    body: 'PDF, spreadsheet, sales catalog or plain text — plus thermal and sheet label layouts.',
  },
  {
    n: '13',
    title: 'Backups',
    body: 'Manual downloads, scheduled snapshots, a retention-limited vault and cloud sync.',
  },
  {
    n: '14',
    title: 'Appearance',
    body: 'Themes, typefaces, sizes, densities, borders and colours — saved as named presets.',
  },
  { n: '15', title: 'Ten languages', body: 'Fully translated, right-to-left included, switching instantly.' },
  {
    n: '16',
    title: 'Offline first',
    body: 'Everything works in the reptile room with no signal, and syncs when you are back.',
  },
];

export const SPECIES_CHIPS = [
  'Ball python',
  'Leopard gecko',
  'Crested gecko',
  'Boa constrictor',
  'Corn snake',
  'Bearded dragon',
];
