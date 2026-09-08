# Quarantine — Website Handoff

**Product:** Serpentora Breeder App
**Section:** Quarantine (top-level tab)
**Status:** Shipping. Under active development — further capability planned.
**Prepared:** 2026-09-04

---

## One-line positioning

> Quarantine is where a new animal earns its way into your collection — with the clock, the checks,
> the tests and the separation all tracked for you, and none of it left to memory.

Quarantine is the one part of keeping snakes where a lapse is invisible until it is expensive. Miss
a weekly check and nothing happens. Miss six and you find out about the mites when they are already
in the rack. Serpentora keeps the calendar, asks the questions, remembers the answers, and tells you
what each animal is waiting on.

**The design principle, and it is worth saying out loud on the site:** Quarantine is a record and a
prompt, never a rule. Nothing in this section blocks you from pairing, feeding, selling or moving an
animal. Every default is a suggestion you can overwrite. The app's job is to make sure you know.

---

## Website copy — section by section

### It starts when the animal does
*One checkbox at intake, and the record builds itself.*

When you add an animal, tick **"Newly acquired animal (bought, traded or imported)"**. That tags the
animal, opens a quarantine record dated today, and sets a suggested duration — no separate setup, no
second form. Tell it where the animal came from and who from, and the clock adjusts itself, because
risk is not uniform:

| Source | Suggested quarantine | Why |
| --- | --- | --- |
| Bred here | none | Hatched in your own collection — nothing to quarantine against |
| Known breeder | 90 days | A breeder whose room and practices you know |
| Shop | 120 days | Mixed stock and shared airspace, unknown sources upstream |
| Expo or show | 120 days | Shared tables and handling with dozens of other collections |
| Import | 180 days | Long transport, mixed shipments, high stress on arrival |
| Wild-caught | 180 days | Assume parasites — extended observation and repeat faecals |
| Unknown | 180 days | Provenance you cannot check — treated as the highest risk until you know more |

Every one of those numbers is a starting point you can change per animal.

Already have animals tagged *Quarantine* from before? They appear in the section immediately. The
tag is the single source of truth for who is in quarantine, so there is nothing to migrate and the
tag and the section can never disagree.

**Website angle:** *"Tick one box when the animal arrives. The clock, the checks and the paperwork
start on their own."*

---

### The board
*Four numbers that tell you what today looks like.*

The section opens on four counts — **in quarantine**, **check due**, **awaiting results**, and
**flagged** — followed by every animal, longest-running first, because the animal that has been shut
away the longest is the one most easily forgotten.

Each animal shows a day-of-plan progress bar, its source, any open findings, its weight change since
intake, and — most usefully — **one** next action. Not a list of four things, which prompts nothing,
but the single item that matters most: an outstanding test result outranks a due faecal, which
outranks a due weekly check. Filter by *in quarantine*, *cleared*, or *all*.

**Website angle:** *"Open the tab, see four numbers, and know exactly which animal needs you today."*

---

### The weekly check
*One tap when all is well. A record either way.*

Quarantine only works if the check actually gets done, so the check sheet is built to cost almost
nothing when there is nothing to report: **mites**, **breathing**, **stool** and **shed**, each
pre-selected to the "nothing to report" answer, plus an optional weight and note. Confirm and you
are done.

The app tracks the cadence for you — weekly observation checks, faecal testing from around week two
and roughly every four weeks after — and surfaces what is due rather than making you count days.

Findings behave sensibly. A flag raised on the 12th and followed by a clean check on the 19th closes
itself; you do not keep seeing it. And normal states are not treated as findings — an animal in shed
or an animal that simply has not passed anything is not an alarm, because a section that cries wolf
every week gets ignored.

**Website angle:** *"A weekly check that takes one tap when everything is fine — and builds a
complete record whether it is or not."*

---

### What to check, and how
*Guidance attached to the question, at the moment you are asked it.*

Asking a keeper "mites: none or seen?" is only useful if they know where mites hide. So every check
carries a **?** that opens full guidance: what you are looking for, how to look for it, what normal
looks like, and what is worth acting on.

It is anchored to **interactive anatomical diagrams** — the whole animal from above and the head in
profile — with numbered points you can tap to jump to the relevant check. Eight checks are covered
in depth: mites, eyes, breathing, body condition, vent, skin and scales, shed, and stool and urates.

The guidance is specific and practical rather than generic. Wipe the snake with a white paper towel,
because specks show against white that you will never see against a patterned snake. Look at the
water bowl — drowned mites float, and are often the first sign anyone sees. Hold the shed up and
count the eye caps; if they are not in the shed they are still on the snake. Weigh weekly and trust
the trend, because fifty grams lost over a month is invisible to the eye and obvious in a column of
numbers.

**Website angle:** *"Not just 'check for mites' — where they hide, what they look like, and the
paper-towel trick that actually finds them."*

---

### Tests and laboratories
*The vocabulary for a better conversation with your vet.*

A built-in reference to the health diagnostics that matter in quarantine — ten of them, grouped by
how routinely they are run:

- **Baseline** — faecal flotation, direct faecal smear, acid-fast stain, veterinary examination
- **Molecular (PCR)** — *Cryptosporidium*, serpentovirus (nidovirus), reptarenavirus (IBD),
  adenovirus, *Ophidiomyces* (SFD)
- **On suspicion** — bacterial culture and sensitivity

Each entry gives the method, which sample it needs, typical turnaround, when in a quarantine it is
usually run — and, crucially, **its limitation**. One clean faecal float proves very little because
parasites shed intermittently. A negative cloacal swab for *Cryptosporidium* is weaker evidence than
it looks. A negative IBD PCR does not clear an animal. That last field is the one that makes this
reference worth having: it tells you what a result does *not* mean.

Alongside it, six laboratories known to run reptile diagnostics across the US, Canada, Germany and
the wider EU/UK, with the tests each offers and whether they accept keeper submissions or require a
vet. Deliberately unpriced, deliberately not exhaustive, and explicitly not an endorsement.

**Website angle:** *"Know which test answers which question — and, just as importantly, what a
negative result still leaves open."*

---

### Real separation, actually checked
*The most common way quarantine quietly fails.*

Quarantine is only quarantine if the animal is somewhere else. The app already knows which rack
every animal sits in, so it checks: are your quarantined animals actually in the quarantine room, or
still in the middle of the collection?

When anything goes into quarantine, a **Quarantine** room appears in Spaces automatically. The
housing panel then reports how many of your quarantined animals are genuinely separated, and offers
a one-tap move into a free tub for any that are not. It never moves an animal on its own — a slot
assignment is your record of where a real animal physically is, and silently rewriting it would have
the app claiming a snake is in a room it is not in. So it reports, and the move is your deliberate
choice, changing both the record and, presumably, the tub.

The section also carries the reminder that costs nothing and matters most: **service quarantine
last, after the rest of the collection, and keep its tools, tongs and cleaning kit separate.**

**Website angle:** *"The app knows where every animal lives — so it can tell you when 'quarantined'
is only true on paper."*

---

### The full record
*Checks, tests, treatments and every change, kept.*

Beyond the weekly check, each animal carries a complete quarantine file:

- **Intake check** — a six-point examination on arrival (mites, eyes, breathing, condition, vent,
  skin), each marked OK or flagged, plus intake weight as the baseline for everything after
- **Observation checks** — the full history, not just the latest
- **Tests** — date, test, vet or laboratory, and result (awaiting, clear, positive, inconclusive)
- **Treatments** — date, what was given, dose and reason, with a prompt to restart the clock after a
  mite treatment, because you are now timing the treatment rather than the settling in
- **Restart clock** and **extend** — both recorded with your reason
- **History** — an audit trail of every transition, so the record explains itself months later

**Website angle:** *"Everything you observed, tested, treated and decided — in one file, per
animal, for as long as you keep it."*

---

### Clearance
*Six gates. It reports; it never blocks.*

When an animal is ready to join the collection, the clearance dialog checks the six conventional
gates:

1. Planned duration served
2. At least one clear test on file
3. A clear test in the last 30 days
4. Weight stable or gaining since intake
5. Feeding in the last 30 days
6. No mites since the last treatment

Each unmet item explains *why* — "23 days still to run", "nothing clear in the last 30 days", "mites
seen since the treatment on 12 Aug" — rather than showing a bare red cross.

And then it lets you clear anyway. You know things the app does not. What it does instead of
refusing is write the unmet items into that animal's permanent quarantine history, so the decision
is recorded rather than blocked.

**Website angle:** *"Six checks before an animal joins the collection — and if you clear it anyway,
the app records what you overrode instead of arguing with you."*

---

### It shows up where you already look
*Quarantine dates land in the calendar.*

Quarantine starts, due dates, test dates and clearances all appear as calendar events alongside your
feeds, sheds and appointments — so a quarantine ending in six weeks is visible when you are planning
six weeks out, not only when you open the quarantine tab. The whole record backs up and syncs with
the rest of your collection.

---

### The notice you cannot switch off
*Because the one thing this feature must never do is make you feel qualified.*

A short notice appears the first time you put an animal into quarantine, and again at an
unpredictable interval afterwards. It cannot be turned off — only spaced out — and it never settles
into a rhythm you can learn to click past. It says the thing that matters:

> Quarantine records what you see. It might not tell you what it means. One sign can have several
> very different causes, and the obvious answer might be the wrong one. If something concerning
> shows up, seek a veterinarian who specialises in reptiles rather than work it out yourself.

Alongside two practical points: line up a reptile vet *before* you need one, and plan at least one
faecal test as part of every quarantine — testing early is what makes the rest of it worth doing.

The same text stays available on demand from the tab, and a matching line sits under the drawings,
under the laboratory list and at the foot of the section. Findings are described as **flagged, not
diagnosed**.

**Website angle:** *"It will tell you what you are looking at. It will never pretend to tell you
what it means."*

---

## Suggested website section

> ### Quarantine, kept properly
>
> A new animal is the single biggest risk to a collection, and quarantine is the part of keeping
> snakes where a lapse stays invisible until it is expensive. Serpentora runs the clock for you —
> weighted by where the animal actually came from — prompts the weekly check, tracks the faecal
> schedule, and tells you which animal is waiting on what. It shows you where to look and what
> normal looks like, on real anatomical diagrams. It knows which tests answer which question and
> what a negative result still leaves open. It even checks that your quarantined animals are really
> housed apart, because that is the most common way quarantine quietly fails.
>
> And it never blocks you. It is a record and a prompt — six clearance gates before an animal joins
> the collection, and if you clear it anyway, the app records what you overrode rather than arguing.
>
> Records and prompts only, never veterinary advice. When something concerning turns up, that is a
> conversation for a vet who specialises in reptiles — and this section is designed to make that
> conversation a much better one.

---

## Development status — please include on the site

Serpentora is under **active development**. The Quarantine section described here is live and in
daily use, and it continues to grow: deeper integration with the laboratory ordering pipeline, a
wider diagnostics reference and richer trend analysis across a quarantine are all on the roadmap.
Suggested site wording:

> **Serpentora is in active development.** Everything described here is available today — and new
> capabilities ship regularly. Features are shaped directly by the breeders using them, so if
> there's something your operation needs, tell us.

---

## Notes for whoever builds the page

**Non-negotiable, please do not soften:**

- Never describe this section as diagnosing, screening or assessing health. The product deliberately
  does not, and every screen in it says so. Carry the disclaimer onto the website in the same words:
  *records and prompts only, not veterinary advice.*
- The laboratory list is **not an endorsement**, is deliberately unpriced, and most entries require
  submission through a veterinarian. Present it as a reference, never as a directory of services we
  offer or recommend.
- Do not blur this into the ProHerper shed-test ordering flow. Those are priced, orderable
  **genetic** tests wired to the lab pipeline. These are **health** diagnostics, ordered through a
  vet, information only. Confusing the two on the website would imply we sell something we do not.

**Positioning:**

- Lead with the *"it never blocks you"* framing. Competing tools that enforce rules get abandoned the
  first time the rule is wrong; this one is trusted precisely because it defers to the keeper. That
  is a genuine differentiator and it is also, straightforwardly, the truth.
- The strongest single detail for a landing page is the housing check — *"the app knows when
  'quarantined' is only true on paper."* No spreadsheet does that.
- Best screenshot candidates: the interactive **check map** with the numbered anatomical points (it
  is the most visually distinctive thing in the product), the **four-tile board**, and the
  **clearance dialog** with its explained gates.

**One accuracy caveat:**

- The Quarantine section is fully wired for translation but its strings are not yet translated —
  today it renders in English regardless of the chosen language. The rest of the app is genuinely
  available in ten languages. If a page covers both Settings and Quarantine, do not let the
  "ten languages" claim visually attach to this section until the translations land.
