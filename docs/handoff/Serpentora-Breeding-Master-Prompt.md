# Serpentora: Female Breeding Cards, Multiple Sires, Follicle Tracking and Cycle History
Master implementation prompt SBR-MASTER-01 | Specification revision 1 | 11 October 2026

You are working inside the existing Serpentora project in VS Code. Implement the complete breeding upgrade described below in the actual application. This is an implementation task, not a request for another proposal, isolated demo, or mockup.

The agreed product decisions below are authoritative. Inspect the repository to discover the stack, schema, existing features and supported clients; no source audit has been performed by the author of this prompt. Do not assume particular frameworks, database providers, file paths, or that any feature already works.

## Mission and working rules

Replace the existing pairing-centred experience with female-centred breeding cards. Each card represents one female's breeding cycle, containing all candidate males, pairing sessions, observed locks, follicle examinations, reproductive milestones, clutch outcomes and a compact previous-cycle history.

Implement persistence, domain logic, migrations, APIs/services, UI, existing integrations, meaningful tests and user documentation. Continue through the stages without asking for approval for routine reversible implementation choices. If a genuine missing credential, destructive production operation or material unresolved business decision blocks something, identify the exact blocker, continue independent work, and report the remaining action honestly.

- Read applicable AGENTS.md, CLAUDE.md and repository instructions first.
- Inspect git status and preserve unrelated user changes. Use an isolated branch/worktree if appropriate to this repository. Do not reset or overwrite user work.
- Reuse existing architecture, components, design system, authorization, localization, date utilities, reminders, animal profiles, genetics and clutch systems.
- Match Serpentora's existing visual identity. Keep cards compact, readable, responsive and accessible, with progressive disclosure for detailed records.
- Implement on every existing client that exposes breeding features; explicitly report any platform unavailable for verification. Do not create new native applications just to satisfy this task.
- Do not expose credentials, cross collection/account boundaries, weaken tests, or pretend mocks prove real integrations.
- Do not deploy, push, spend money, send messages or modify production data merely because this prompt describes release work.
- No dummy production records, disconnected buttons, silently swallowed errors or unfinished required features represented as complete.
- Clinical interpretations and predictions must remain distinguishable from recorded observations. No automatic diagnosis, paternity assignment or universal follicle-size rule.

## Stage 0: Repository audit and execution tracker [SBR-00]

Discover and document:
1. Current breeding/pairing cards and routes, animal profiles, ownership model, season handling, date/time settings, pairing/lock storage, milestones, clutches, hatchlings and parentage.
2. Existing follicle, charting, reminder/calendar, notification, genetics, history, export, offline/sync and audit capabilities, where present.
3. Supported platforms and languages, migration framework, storage permissions, test commands and actual CI gates.
4. Baseline relevant checks and pre-existing failures, with source revision and environment.
5. Every consumer of old pairing IDs or a single-sire field.

Create or extend the repository's existing feature tracker. If absent, add a scoped breeding-upgrade plan under its normal documentation location. Use stable IDs SBR-00 through SBR-12 from this prompt. Track status, dependencies, acceptance criteria, implementation evidence, tests, blockers and next action. Do not label work verified simply because a file exists.

Build in dependency order: model and migration, domain rules, card and recording flows, history and overview, reminders and estimates, end-to-end verification. Deliver a working vertical slice early, then complete the remaining required scope.

## Stage 1: Female breeding-cycle model [SBR-01]

Accepted lifecycle:
- The first ACTUAL pairing of a female starts her cycle and creates the breeding card.
- A future planned appointment alone does not start a biological cycle or count as a completed pairing.
- Subsequent pairings, including different males, attach to that female's active cycle. Do not create another card per male or per appointment.
- Default to one active cycle per female and enforce this transactionally, including concurrent requests.
- The display name is the breeding season, such as 2026–27. Reuse the app's season convention. If none exists, implement an editable season label, defaulting conservatively from the start year; do not assume a universal September boundary.
- Stable internal IDs must not depend on the season label. Historical/imported cycles with the same label must remain distinct; disambiguate with start dates.
- Approximately 6–7 months to hatchlings is the breeder's rough expectation, not a timer that closes the cycle.
- Milestones: pairing and locks, ovulation, pre-lay shed, egg laying, hatching and recorded hatchlings.
- Complete the cycle when the clutch's hatching outcome is finished and recorded, not automatically on the first hatchling.
- Allow explicit closure without hatchlings: no clutch, cancelled cycle, failed clutch or another documented reason.
- Distinguish biological event dates from administrative closure dates. Store first hatch, final hatch and outcome-completion dates where known.
- Support corrections and deliberate reopening without losing records.
- Do not require a missing earlier milestone to enter a known later milestone. Mark chronology conflicts for correction without inventing dates.
- Follicle examinations may occur BEFORE the first pairing. Store them against the female independently, then associate relevant examinations with the cycle while preserving original dates. A scan must not force an early cycle start.

Keep female-level events recorded once regardless of how many males participate.

## Stage 2: Data relationships, integrity and migration [SBR-02]

Use equivalent structures suited to the existing project:
- Breeding cycle: owner/collection, female, season label, actual start, status, pause state, closure outcome and dates.
- Cycle male association: cycle, male, notes, planned/participated state as useful.
- Pairing session: cycle, male, actual introduction, optional removal/time, notes.
- Dated lock record: pairing session, male through that session, observation date, optional time, observed/not observed/unknown status as appropriate.
- Planned pairing/reminder: separate from actual sessions and observed locks.
- Follicle examination: female, optional cycle, date, method, result, quality, notes, attachments, next review.
- Follicle measurements: examination, value in mm, measurement type/axis, optional location, optional measured-structure identifier.
- Reproductive events: event type, date, precision/source, recorded versus suspected/estimated, notes and evidence.
- Existing clutch, egg and hatchling entities linked without creating a competing clutch database.
- Parentage evidence and per-offspring sire assignment using the existing lineage model where possible.
- Predictions derived separately from facts, with inputs and calculation version identifiable.

Separate reproductive stage from administrative active/paused/closed state. Preserve changes using existing audit conventions.

Integrity:
- Nullable means unknown, not zero.
- Dates with no time must remain date-only; never silently invent midnight precision.
- Validate positive measurements, nonnegative counts and cross-account relationships.
- Use transactions and idempotent mutations for cycle creation, observations, reminder generation and hatchling completion.
- Never assume the same follicle has been reidentified in a later scan; compare the explicitly labelled examination metric.
- Preserve historical references if an animal is archived. Do not cascade-delete breeding history when a male disappears from an active collection.

Migration:
- Map existing pairing records into cycles only when female identity AND explicit cycle/season evidence support the grouping.
- Do not merge years of history just because the female or male matches.
- Preserve all IDs through mappings/redirects as needed, dates, males, lock statuses, attachments, notes, clutch links and source records.
- Do not manufacture individual dated locks from a legacy aggregate count. Preserve the aggregate with its provenance and show its limitation.
- Do not convert unknown lock status to observed.
- Mark unresolved legacy groupings for an in-app review flow that preserves access to source data.
- Provide a dry-run/reconciliation report, rerun-safe migration, backup and recovery instructions appropriate to the existing database.
- Keep old data readable during rollout; defer destructive column/table removal.
- Test representative legacy single-male, multi-male, multi-season, missing-date, aggregate-lock and partial-cycle fixtures.
- Update all identified consumers, including existing notifications, routes, exports, lineage and genetics tools where applicable.

## Stage 3: Breeding card and multiple sires [SBR-03]

Replace visible Pairing Card terminology with Breeding Card wherever this concept changes. Keep pairing terminology for actual sessions.

Card layout:
1. Female identity, ID, genetics, season, current stage and latest follicle measurement WITH measurement date.
2. Compact counts and relevant milestone dates.
3. Male section with a Multiple sires checkbox.
4. Fast actions for pairing, observed lock, follicle examination and milestones.
5. Follicle chart and shared event timeline.
6. Clutch/hatchling outcome.
7. A small, collapsible Previous breeding cycles section inside the card.

One male is the default. Enabling Multiple sires allows more candidate males in the SAME cycle. Each male has an expandable history showing:
- Linked profile, name, ID and genetics.
- Number of actual pairing sessions and observed locks.
- Latest introduction and lock dates.
- Every introduction, removal, lock status, observation date and session note.

Changing the selected male for a new entry must not rewrite earlier sessions. Keep male labels visible to avoid misattribution.

Turning off Multiple sires must never erase associations or history. When multiple males already have recorded participation, keep that history visible and explain the retained multiple-sire state. An unused planned association can be removed safely; records with actual history require the normal correction/audit flow.

Provide loading, empty, error, save-in-progress and retry states. Failed saves must retain user input.

## Stage 4: Pairing sessions and lock counting [SBR-04]

Accepted counting rule:
- One dated entry with an observed lock counts as one lock.
- March 1 observed + April 1 observed = two locks.
- Reopening or repeatedly checking the SAME dated entry must not increment the count.
- Planned dates, introductions without an observed lock, not-observed entries and unknown statuses do not count.
- A session can span days and have dated lock observations.
- If introduction was March 1 but the lock was seen March 3, preserve both dates.
- Same-session/same-local-date repeated sightings belong to the existing dated record under this product rule; they are not additional lock counts.
- Do not silently merge observations across different males or sessions. Flag suspicious duplicates or impossible overlaps for review.
- Labels should make clear these are observed-lock records, not inferred distinct mating events.
- Corrections/deletions through the app update totals and history consistently.

Show session count and observed-lock count separately, overall and per male. Not observed means no lock was seen, not proof that mating did not happen.

## Stage 5: Quick entry and reminders [SBR-05]

Quick pairing entry:
- Female prefilled when opened from her card.
- Male prefilled from the relevant section/previous selection, clearly visible and changeable.
- Pairing date defaults to today and supports backdating.
- Lock observed: Yes / Not observed / Unknown, never silently default Yes.
- Reveal lock observation date when different from introduction.
- Next pairing proposed one CALENDAR month after a newly recorded observed lock; editable or skippable.
- Notes optional.
- More details contains introduction/removal times, removal date and attachments where supported.
- Season inherited from the card.
- Provide Save and next female in rack/batch workflows without carrying over measurements or locks.

Quick follicle entry:
- Examination date, method, result and largest measured diameter when applicable.
- Optional extra measurements, notes, images/video and next check.
- A result such as inconclusive or not visualized does not require a numeric diameter.
- External observation cannot produce a measured numeric follicle diameter. Palpation values must be explicitly estimates.

Scheduling:
- March 1 observed lock proposes April 1 as a PLANNED next pairing for that male and cycle.
- Use true calendar-month arithmetic with documented end-of-month clamping and tests, not 30 days.
- Respect local dates/timezones and daylight-saving changes.
- Create at most one relevant pending follow-up; retries or edits must not duplicate reminders.
- If an appropriate pending appointment already exists, reuse or offer to update it. Do not overwrite a manually adjusted date silently.
- Historical backfills must not issue a storm of past-due notifications; suppress historical automatic follow-ups or present one deliberate next-date choice.
- Provide reschedule, skip and cancel.
- Paused or closed cycles do not generate new pairing reminders. On recorded ovulation, suppress automatic further pairing proposals and review/cancel pending automatic pairing reminders, keeping history.
- Integrate existing reminder/calendar/notification infrastructure. Do not create an unrelated notification subsystem or send real messages during testing.
- Explain that reminders work only through channels the app actually supports.

## Stage 6: Follicle examinations and trends [SBR-06]

Fields:
- Date/time, method: ultrasound, palpation estimate, external observation.
- Result: follicles seen, not visualized, inconclusive, post-ovulation structures.
- Largest measured follicular diameter in mm when reliable.
- Optional additional measurements, with explicit measurement axis/type.
- Optional visible count, count certainty and partial/complete examination coverage.
- Notes on appearance, behaviour, feeding and other observations.
- Ultrasound images/videos using existing media facilities.
- Next review date.
- Advanced optional operator, equipment and image-quality fields.

Do not confuse follicles with post-ovulation eggs or place egg measurements on the follicle curve.

Keep:
- Not visualized distinct from confirmed absence and from numeric zero.
- Estimated visible count distinct from predicted clutch size and actual eggs.
- Largest diameter distinct from average diameter.
- Ultrasound measurements distinct from palpation estimates.
- Recorded observations distinct from suspected regression or other interpretations.
- Each historical measurement intact after corrections, according to audit conventions.

Calculate measured change and elapsed-day average change only between comparable records in the same developmental segment. No rate for a zero-day interval or incompatible methods/axes. A lower measurement can suggest review; never automatically diagnose regression or follicular stasis. Let users override an interpretation with a reason without changing the underlying scan.

No automatic image diagnosis or AI follicle measurement is required. Attachments are evidence for human review. If manual image measurement is added using an existing tool, require real calibration rather than assuming pixel-to-mm scale.

## Stage 7: Chart and shared timeline [SBR-07]

- Follicle graph: examination dates on X, millimetres on Y, actual data points visible.
- Default series is largest measured ultrasound follicular diameter.
- Separate or filter incompatible methods/metrics, with clear legends.
- Selecting a point opens its examination, measurements, evidence and notes.
- Shared timeline includes planned versus actual pairings, male labels, observed locks, scans, sheds, suspected/recorded ovulation, laying, hatch events and closure.
- Suspected events, estimates and actual observations must have different visual/text labels.
- Historical overlays optional, aligned explicitly to first actual pairing; pre-pairing scans have negative relative days.
- Do not extrapolate an exact ovulation date from a straight-line growth rate.
- Include an accessible tabular alternative to the graph.
- Readable mobile layout; identity and status must not rely on color alone.

## Stage 8: Historical summaries and the female's pace [SBR-08]

The previous-cycle section remains SMALL and collapsible inside the active card. Most recent cycles first. Each expands to complete records.

Show per cycle:
- Season, actual dates, status and outcome.
- Actual pairing-session total.
- Every male and his session count.
- Pairing dates and introduction/removal detail.
- Pairing frequency and intervals between introductions, overall and per male.
- Observed-lock total, per-male totals and observation dates.
- First/latest follicle measurements, trend and scan history.
- First pairing to recorded ovulation.
- Last actual pairing on/before ovulation to ovulation.
- First observed lock on/before ovulation to ovulation.
- Ovulation to pre-lay shed.
- Pre-lay shed to laying.
- First pairing to laying.
- Laying to first hatch and final hatch.
- First pairing to completed hatching outcome, separately labelled from administrative closure.
- Total eggs, fertile eggs, slugs, hatchlings and no-clutch outcomes.

Allow relevant timing to ovulation per male, without implying causation or paternity.

Calculation rules:
- Use actual introductions, not planned appointments, for pairing frequency.
- With fewer than two introductions, frequency/average interval is unavailable, not zero.
- Define the average interval as the mean of consecutive introduction-date gaps over the labelled set; same-day sessions remain visible and explained.
- Use date arithmetic for date-only milestones.
- Preserve exact versus estimated date precision. Exclude estimated/suspected milestone dates from the default typical-history statistic, or expose them only in an explicitly labelled separate view.
- Unknown data stays Not recorded and is excluded ONLY from calculations needing that datum.
- Invalid chronology does not become a negative biological interval; flag it and exclude the affected calculation.

Across-cycle female summary:
- Typical = median, accompanied by shortest–longest range and sample count FOR EACH metric.
- Include typical time to ovulation, ovulation-to-shed, shed-to-laying, first-pairing-to-laying, incubation and clutch size.
- Clutch-size statistics use actual laid clutches; no-clutch cycles remain visible and are not silently counted as zero eggs in that statistic.
- Show no-clutch outcomes separately.
- One usable prior cycle is labelled one prior cycle, not a reliable personal norm.
- No usable history produces an honest empty state.
- Compare current elapsed time or completed intervals with this female's history, labelled faster/slower or within her historical range where justified.
- Exclude the current incomplete cycle from its own baseline.
- Recompute summaries after relevant edits.

## Stage 9: Configurable review rules and predictions [SBR-09]

Implement now:
- Configurable species/collection review settings and individual overrides where consistent with the app.
- Breeder-selected follicle-size review ranges, scan reminders and pause controls.
- Entering a configured range triggers a pairing REVIEW, not an automatic fitness decision.
- No hard-coded 20 mm = pair, 30 mm = ovulation, or universal schedule.
- Single scan: measurement only. Multiple comparable scans: trend.
- Existing or new deterministic history-based date windows, updated by actual ovulation and pre-lay shed.
- Female history preferred when sufficient; relevant same-species collection history next, and documented species references only when available and supportable.
- Each forecast explains its source, usable sample count, anchor event and uncertainty.
- An empirical observed range is labelled historical range, not a statistical confidence interval.
- No invented confidence percentage. No date forecast when evidence is insufficient.
- Keep recorded milestones independent of forecasts. Recalculate after input changes and cease inappropriate projections after closure.

Document the transparent eligibility rule for history-based forecasting. A conservative minimum such as three usable comparable cycles may be used as an implementation choice, with fewer cycles shown descriptively. It is not a biological validation claim.

Advanced learned models, automated image analysis and population-wide follicle-to-ovulation modelling are explicitly deferred until suitable data and validation exist. Do not train a model on invented data or promise exact forecasts. Complete the reliable recording, trends and historical estimates now.

Keep ball-python settings separate from other species. Do not apply egg-laying milestones to live-bearing species. Reuse species workflows already present; unsupported species-specific forecasts should stay unavailable.

## Stage 10: Potential sires, genetics and outcomes [SBR-10]

- Males on a card are candidate sires until parentage is supported.
- A lock must never auto-select a father.
- Keep unknown/unresolved parentage and evidence-backed per-offspring sire assignments.
- Record assignment method/source, certainty and correction history using existing parentage conventions.
- Show genetic outcomes separately for each female–male combination through the existing genetics engine.
- Do not average these into equal paternity probabilities or invent a new genetics engine.
- Preserve existing family-tree and hatchling workflows and unresolved parentage on exports.
- Link eggs/hatchlings to the female's cycle and clutch.
- Do not close a cycle on partial hatching. Add an explicit Hatching complete / Record final outcome action if the current egg model cannot establish that all outcomes are resolved.
- Support losses/unhatched eggs without forcing them into hatchling counts.
- Completion and retries must not duplicate hatchlings.
- Changing hatch outcomes must update history and allow reopening deliberately.

## Stage 11: Collection overview and integration [SBR-11]

Provide Breeding -> Follicle tracking / overview using existing navigation conventions.

Each female/cycle row shows:
- Female, rack/location and season.
- Current stage and pause/closure state.
- Latest follicle metric, date, comparable change and last examination.
- Candidate male(s).
- Actual pairing sessions and observed-lock counts.
- Latest introduction and observed-lock dates.
- Next planned pairing or scan/review.

Provide useful existing-compatible search, filters and sort by rack, stage, male and next check. Show old measurements with their age; do not imply they describe today's size. Allow opening the breeding card and batch Save and next female.

All existing surfaces using breeding records must remain coherent: animal detail, male history, calendar/reminders, clutches, hatchlings, lineage, genetics, reports/import/export and supported mobile/web clients. Adapt only integrations that actually exist.

Authorization must cover records, nested associations, media, histories, summaries and forecasts. A collection-level statistical fallback may use only data the current user is allowed to access. Prevent N+1 queries and expensive full-history loads in the overview using established project techniques.

## Stage 12: Verification, documentation and completion [SBR-12]

Write meaningful behavioural tests using existing tooling. Cover at minimum:

A. First actual pairing creates one female cycle. Repeated requests/concurrent calls do not duplicate it. A planned appointment alone does not start one.
B. Another pairing and another male use that active card; histories remain separate and totals correct.
C. March 1 observed + April 1 observed produces exactly two locks. Repeated saves of the same dated observation do not add locks.
D. Planned, not-observed and unknown entries never count as locks. Corrected lock status recalculates totals.
E. Introduction and lock dates can differ. Same-session/same-date duplicate sightings are handled consistently.
F. March 1 proposes April 1. End-of-month/leap-year cases work. Backfill, retries, manual reschedules, pause, ovulation and closure do not create duplicate or inappropriate reminders.
G. Disabling multiple sires does not delete recorded male history.
H. Pre-pairing scans remain possible and link to the later cycle without moving cycle start.
I. Follicle entry supports no measurement, incomplete scans, attachments and optional measurements; external observations cannot become measured diameters.
J. 19 mm to 24 mm over 14 days shows +5 mm and approximately 0.36 mm/day. Zero-day/incompatible comparisons do not produce invalid rates.
K. Follicle count, egg count, post-ovulation dimensions and hatchling count are never conflated.
L. Actual and suspected/estimated milestones remain distinct. Missing milestones do not block known later events.
M. Historical calculations use only valid endpoints; show metric-specific sample counts, medians, ranges, no-history and one-cycle states. No-clutch cycles remain visible without corrupting laid-clutch size.
N. Per-male timelines and genetics results remain independent; unresolved paternity stays unresolved.
O. First hatchling keeps cycle open. Final recorded outcome completes it. No-clutch closure and reopening work, with no duplicated hatchlings.
P. Legacy migration is rerunnable and preserves counts/references; ambiguous grouping and aggregate legacy locks remain explicit.
Q. Cross-account reads/writes and media access are rejected. Invalid cross-collection relationships cannot be forged.
R. Keyboard and mobile flows, loading/empty/error/retry states and accessible chart/table use work.

Run an end-to-end scenario through the real application with isolated synthetic fixtures:
1. Record a pre-pairing scan.
2. Create the first actual pairing for a female and season.
3. Record a lock and inspect its planned follow-up.
4. Enable multiple sires, add another male and record his session/lock.
5. Add follow-up follicle scans and inspect chart/timeline.
6. Record ovulation, pre-lay shed and laying.
7. Record partial hatching, then complete outcomes.
8. Confirm previous-cycle summary, female statistics and candidate/assigned parentage.
9. Start her next actual cycle and inspect the embedded prior history.
10. Correct a historical event and verify recalculation.

Inspect and run appropriate existing type checks, lint, relevant unit/integration tests, end-to-end checks and production build gates. Do not claim an aggregate command includes end-to-end tests without checking. Test local migration and authorization paths with the real supported local database when available. Record limitations if unavailable.

Maintain user-facing help covering:
- What a breeding card and breeding season mean.
- Starting, pausing, closing and reopening cycles.
- Planned pairings versus actual sessions versus observed locks.
- Multiple males and unresolved paternity.
- Fast pairing/follicle entry and pre-pairing scans.
- History metrics, medians, sample sizes and missing data.
- Reminder behaviour and date editing.
- Recording complete clutch outcomes.
- Meaning and limitations of trends and forecasts.

Document migration operation, reconciliation, recovery and any necessary setup. Update the feature tracker with evidence at the final revision.

Final response must include:
1. Concise implemented behaviour.
2. Actual affected areas/files and migration changes.
3. Task-by-task completion against SBR-00..SBR-12.
4. Exact checks executed and results, including baseline failures.
5. Environments/platforms verified and those not verified.
6. Remaining blockers and precise owner steps, if any.
7. Explicit deferred scope: validated learned prediction models and automated ultrasound interpretation.
8. Whether the work is implemented locally, verified, integrated or released. Never imply deployment if none occurred.

Begin by inspecting the repository, briefly state what you found, then implement all authorized work through verification. Do not stop after a plan or scaffold.

