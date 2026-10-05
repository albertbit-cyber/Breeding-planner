# Serpentora Help System Handoff

2026-10-05 · Albert

> Owner's note on the doc: "okay, put a pin on this plan. I will come back to it later to think about it."

> Repo copy of the Claude Doc "Serpentora Help System Handoff"
> (https://claude.ai/code/artifact/aafe369c-b05c-4d72-b00e-b59081c0ff93, doc rev 16), saved 2026-10-05.
> Converted from the doc verbatim; the one diagram is redrawn as text below. Serpentora-specific
> overrides and decisions live in docs/help-system-plan.md, not here.

## How to use this handoff

This is a specification for building a complete in-app help system in Serpentora: a ? button, a Help Mode that explains any control without using it, a searchable manual, and interactive guided tours that teach by having the person do the real thing. It is taken from a working implementation in another app (Pravāh), with that app's features removed; only the design, rules and mechanics remain.

**Reader:** Claude Code in VS Code, working inside the Serpentora codebase.

**Before writing any code, do this:**

1. Read Serpentora's stack: UI framework, state management, routing, how settings are persisted, how dialogs are rendered, how tests run.
2. List every screen and every interactive control. This list becomes the topic registry (section 4) and the tour targets (section 7).
3. List the 3 to 6 core jobs a new user must learn first. These become the essentials tour.
4. Note which actions are destructive or reach outside the app (delete, reset, sign out, payments, publishing, connecting accounts). Tours only explain these, never ask the person to do them.
5. Propose a short plan back to the user (files to add, stores, entry points, first tour outline) and wait for approval.

**Framework-neutral.** Code snippets use TypeScript-like pseudocode for shapes only. Translate them into Serpentora's idioms: components, stores, hooks, signals, view models, whatever the app already uses. Do not add a new state library or UI kit just for help.

**What to copy and what not to:** copy the architecture, the rules in section 2, the behaviour specs and the tests. Do not copy any wording or feature names from Pravāh; every example text in this doc is there to show format and tone only.

## Design principles

Every decision below follows from eight rules. When a case is not covered here, decide it by these.

1. **One source of truth.** Every explanation lives in one registry. The hover popover, the manual and the tours all read the same entries, so they can never disagree.
2. **Explaining never does.** In Help Mode, pressing a control explains it and nothing else. Nothing is created, saved, changed, sent or deleted. This is enforced once at the document level, not per button, so new controls are safe the moment they exist.
3. **Tours teach by doing, but never act for the person.** A tour step asks the person to press the real control and advances only when the app's own state shows it happened. The tour itself never creates, finishes, deletes or changes data. The single exception is a plainly labelled offer button (for example "Use an example item instead") that does one real, harmless thing only when pressed.
4. **Destructive or outward actions are only explained.** Delete, reset, sign out, import, connecting outside services, payments and publishing are described in tours, never requested as a "do" step.
5. **Stable identifiers, never visible words.** Controls are found by ids attached in code (`data-help`, `data-tour`), never by their label text, so copy changes and translations do not break help.
6. **Help Mode and tours are opposites and never run together.** Help Mode explains without doing; a tour has you do. Turning on Help Mode closes any running tour (its place is kept).
7. **Never trap anyone.** Exit is always visible. Escape leaves. A missing control is explained, with a "Take me there" button, instead of becoming a dead end. Nothing is dimmed or blocked during a tour, so the app stays usable.
8. **Plain and honest.** Short sentences, the words on the screen, no jargon, no promises the app does not keep. Tests check claims that matter (privacy, data handling).

## System overview

The system has three things people see (Help Mode, the manual, guided tours), fed by two definition sources (the topic registry and the tour definitions), and tied to the real UI only through stable ids on controls.

Diagram (redrawn from the doc): "One registry feeds Help Mode and the manual; tours use step definitions"

```
+------------------------------------------------------------------------------+
| Entry points: ? button and Help menu · help hint · tour invitation · tour links |
+------------------------------------------------------------------------------+
          |                          |                          |
          v                          v                          v
+---------------------+   +---------------------+   +--------------------------------+
| Help Mode           |   | Manual              |   | Guided tours                   |
| Guard stops every   |   | Contents by category|   | Ring and panel on real controls|
|   input             |   | Ranked local search |   | Do-steps wait for app state    |
| Popover explains    |   | Topic view with Back|   | Progress saved to settings     |
|   the control       |   |                     |   |                                |
| Status pill w/ Exit |   |                     |   |                                |
+---------------------+   +---------------------+   +--------------------------------+
          ^                          ^                          ^
          |                          |                          |
+------------------------------------------------+   +--------------------------------+
| Topic registry: the one source of truth        |   | Tour definitions               |
| id: title, short, detail, tips, related,       |   | Steps: info or do, target,     |
|     category, keywords                         |   |   done()                       |
+------------------------------------------------+   +--------------------------------+
                ^  (data-help ids)                               ^  (data-tour ids)
                :                                                :
+------------------------------------------------------------------------------+
|                 Serpentora's real controls carry the ids                       |
|     Tests fail if any id is unknown or any tour target does not exist          |
+------------------------------------------------------------------------------+
```

Help Mode and the manual read the same registry, so a control's popover and its manual page always match. Tours point at controls by the same ids and judge progress from app state. Help Mode and tours never run at the same time: turning Help Mode on pauses the tour.

## Help topics: data model and registry

A topic is one explanation of one control, screen or concept, keyed by a short kebab-case id. The registry is a typed map of id → topic, and the id type is derived from the map's keys so a typo in code fails to compile.

```
interface HelpTopic {
  id: string                 // 'export-button', kebab-case, stable forever
  title: string              // the control's name as the user sees it
  shortDescription: string   // 1-2 sentences: what it does. Shown first in the popover.
  detailedDescription: string// optional paragraph: how and why. Shown on "More".
  usageTips: string[]        // optional, 1-3 short tips incl. keyboard
  relatedTopics: string[]    // ids of related topics (validated)
  category: Category         // one of a fixed, ordered list = manual sections
  keywords: string[]         // synonyms people might search for
}
```

**Builder helper.** Topics are written with a compact helper so the registry stays readable:

```
t(category, title, short, { more?, tips?, see?, words? })
// 'export-button': t('Data', 'Export', 'Saves a copy of everything to a file.', { see: ['import'], words: ['backup'] })
```

**Rules**

- **Categories are a fixed ordered list** defined next to the type. Their order is the manual's section order. Start with "Getting Started" (what the app is for, the ? button, Help Mode, the manual, the main navigation, saving), then one category per screen or feature area in the order a new user meets them, then Account, Settings, Data & Privacy last.
- **Split by feature, merge once.** Large areas get their own topic file (`registry<Area>`), each exporting a plain object. The main registry spreads them into one map. Files never import each other.
- **Lookups:** `getTopic(id)`, `topicsByCategory()` (empty categories dropped), `searchTopics(query)` (section 6).
- **Attaching a topic to a control** is one helper that returns the attribute, so call sites stay short: `help('export-button')` → `{ 'data-help': 'export-button' }`. Put it on the control itself, or on the smallest wrapper that is the control (a card, a radio group).
- **Coverage target:** every interactive control and every screen header has a topic. Pravah ended with about 400 topics across 39 categories; Serpentora's count follows its own size.
- **Controls with no topic** still work in Help Mode: the popover shows the control's accessible name and offers the manual.

## Help Mode (the ? button)

Help Mode turns the whole app into an explorable diagram: while it is on, pressing any control opens a small explanation next to it, and the control does nothing.

### The ? button and Help menu

- A ? button sits in the top bar on every screen (`aria-label="Help & Manual"`, `aria-pressed` = Help Mode on). Every dialog also has its own ? in its header, so dialogs can be explored too.
- Pressing ? opens the **Help menu** (a small dialog) with:

  1. **Explore the app** (primary) — turns Help Mode on. Reads "Exit Help Mode" when it is already on.
  2. **Open manual** — opens the manual at its contents page.
  3. **Guided tours** — a list of every tour: title, one-line description, "done" mark if completed, and a Start / Again button. If a tour was left part-way, a **Resume: ⟨tour⟩** button sits at the top.
  4. One line that explains the difference: tours have you do the real thing; Help Mode only explains.
- Inside a dialog, its ? toggles Help Mode directly (on → exit, off → open the menu).

### While Help Mode is on

- A small status pill is pinned on screen: "**Help Mode** · click anything to see what it does. Nothing will be changed." with an **Exit** button.
- A class on the body (for example `help-mode`) lets CSS show a help cursor and a soft outline on hover over anything with `data-help`.
- Pressing a control opens the **popover** next to it:

  - title + short description;
  - buttons: **Got it** (focused, closes), **More / Less** (only when there is a detailed description, tips or related topics), **Open in manual**;
  - expanded: the detailed paragraph, tips as a list, and up to 4 "See also" chips that swap the popover to that topic in place.
  - no topic for this control: its accessible name as the title, "Help Mode is on, so nothing happened", and Open manual.
- **Placement:** below the control if it fits, else above; clamped 8px inside the viewport. If a dialog is open, render the popover inside that dialog (top-layer dialogs hide anything outside them).
- **Closing:** Got it, Escape (closes the popover first, then a second Escape is free for the app), any scroll outside the popover after a 500ms grace (the browser scrolls a pressed control into view just after opening), or a window resize.

### The guard: how "nothing happens" is enforced

One listener set, installed once for the app's lifetime on the document in the **capture phase**, does nothing unless Help Mode is on. When on, it intercepts events before any component sees them:

| Event | What the guard does |
|---|---|
| pointerdown, mousedown, mouseup, click, dblclick, auxclick on a control | `preventDefault` + `stopImmediatePropagation`; on `click`, explain the control |
| Enter or Space on a focused control | Stop it and explain the control (keyboard users get the same help) |
| Printable keys, app hotkeys, arrows/Backspace/Delete in fields, arrows in radio groups and selects | Stop it, nothing changes |
| submit, beforeinput, paste, cut, drop, dragstart | Stop it |
| Tab, Shift+Tab, Escape | Allowed, so people can move and leave |
| In-app navigation links (hash/route links) and disclosure toggles (`<summary>`) | Allowed (they only change what is shown) and also explained |
| Anything inside `[data-help-ui]` (the pill, popover, menu, manual, tour panel, ? buttons) | Allowed: help UI keeps working |
| Plain text or empty space | Ignored |

**Which control was meant:** the nearest ancestor with `data-help`; failing that, the nearest interactive element (button, link, input, select, textarea, label, summary, role=button/radio/checkbox, contenteditable). That way a click on an icon inside a button counts as the button.

The guard is a plain function `installHelpGuard(document, { isActive, onExplain }) → uninstall`, with no framework dependency, so it can be unit-tested with a fake DOM. If Serpentora is not a web DOM app (native mobile, for example), implement the same contract at the root view: one interception point that swallows input while help is active and reports the target's help id.

## The Help Manual

The manual is a wide dialog that shows the whole registry as a readable, searchable reference, with three views and no network calls.

**Views**

1. **Contents** (default): one section per category in registry order, each a list of topic titles as links with the short description beside them in muted text. Long groups of minor sub-controls (for example every field of an edit form) fold into a `<details>` under their section.
2. **Topic**: category eyebrow, title, short description, detailed description, "Tips" list, "Related" chips (all of them, not just 4), and an "All sections" link.
3. **Search results**: "N topics found" and the same list format. Empty result: "Nothing found for “X”. Try a simpler word."

**Navigation**

- `openManual(topicId | null)` opens it at a topic or at the contents. The popover's "Open in manual" passes the current topic.
- Every jump (title link, related chip) pushes onto an in-dialog history stack; **Back** pops it. Typing a query clears the topic view; clearing the query restores it.
- Search input at the top, labelled "Search the manual", with a placeholder that suggests a real query from Serpentora.

**Search algorithm (local, ranked, forgiving)**

- Split the query into lowercase alphanumeric words. Every word must match the **start** of some token in the topic (so "export" finds "exporting"); otherwise the topic is out.
- Hyphenated words are also indexed joined ("check-ins" also matches "checkins").
- Each word scores the best field it hits: title 10, keywords 8, short description 4, category 3, detailed description 2, tips 2. Sum per topic; sort by score, then title.
- Empty query returns nothing (the contents view shows instead).
- Use `keywords` for synonyms and the words people really type ("backup" on Export, "delete" on Remove).

**Static guide (optional).** Pravāh also ships a long-form markdown user guide in the repo. It is useful for the website and support, but the in-app manual is generated from the registry and is the one that must stay complete.

## Guided tours: model and engine

A tour is an ordered list of steps that point at real controls on real screens. Each step is either **info** (read, press Next) or **do** (the person performs the action; the tour advances only when a predicate over the app's own state turns true).

```
interface Tour { id: string; title: string; description: string; steps: TourStep[] }

interface TourStep {
  id: string                 // unique within the tour
  part: string               // small heading, e.g. '2 · Your first item'
  title: string
  text: string
  kind: 'info' | 'do'
  target?: string            // a data-help id, a data-tour id, or 'dialog'; omit for a note
  done?: (c: TourContext) => boolean   // required for 'do', forbidden for 'info'
  route?: string             // where the step lives, for "Take me there"
  missing?: string           // what to say when the target is not on screen
  offer?: { label: string; id: string } // a plainly labelled real action, run only on press
}

interface TourContext {
  data: AppData              // the app's persisted state
  route: string[]            // current route split into segments
  modal: string | null       // which dialog is open
  view: ViewState            // transient UI flags worth checking (panels open, etc.)
  base: Record<string, number> // counts captured when this step began
  has(target: string): boolean // is a control with this target on screen now?
}
```

**Completion predicates** read state, never the DOM event that caused it. Typical shapes:

- route reached: `c => c.route[0] === 'library'`
- dialog opened: `c => c.modal === 'new-item'` or `c => c.has('new-item-form')`
- something created: `c => c.data.items.length > c.base.items` (the baseline is captured at step start, so pre-existing items do not count)
- a status changed: `c => currentSession(c)?.state === 'paused'`

Predicates are wrapped in try/catch; a throw counts as false.

**The engine loop** (one per window or app instance):

1. Every 250ms, and on scroll/resize (via requestAnimationFrame), find the target and measure it, and re-evaluate `done` (the tick matters because "is it on screen yet" can change without any stored data changing).
2. When `done` first turns true for this step: arm once (a key of `tourId:index` stops re-renders from cancelling it), show "✓ Done.", then advance after 700ms (300ms with reduced motion). Re-check that the same step is still active before advancing.
3. On every step change, recapture `base` and reset the missing-target timer.

**Tour state** lives in two places:

| What | Where | Why |
|---|---|---|
| Active tour id, step index, baseline | In-memory store for this window only | Presentation state; never synced, so a tour in one window does not start in another |
| `invited`, `completed[]`, `paused {tour, index}` | Persisted user settings | So the invitation shows once, Help can show "done", and Resume works across restarts |

**Store actions:** `startTour(id, at = 0)` (exits Help Mode, closes the help menu and popover, clamps the index, captures the baseline, sets `invited` and clears `paused`), `nextStep`, `backStep` (never below 0), `skipStep` (= next), `exitTour` (saves `paused`), `finishTour` (adds to `completed`, clears `paused`; runs when next goes past the last step), `dismissInvitation`.

**Which tours to write**

- **One essentials tour** that walks the core loop of Serpentora end to end with the person's own real data, in numbered parts ("1 · Finding your way" … "N · Help"). Its last step points at the ? button and says tours and the manual live there.
- **One short tour per feature area or screen** (2 to 6 steps), started from that screen.
- When the person may have no data yet, offer a labelled example ("Use a clearly labelled example item instead") that creates one ordinary, obviously named item they can delete. That is the only real action a tour may take, and only on press.

## Tour UI: ring, panel, placement and dead ends

The tour draws two things over the live app and blocks nothing: a soft ring around the target control and a small floating panel beside it.

**Finding the target** (`findTarget(target)`, plain function):

- `'dialog'` → the open dialog's inner box.
- Otherwise query `[data-tour="X"], [data-help="X"]`, keep only visible elements (non-zero size, has client rects).
- Scope: if a dialog is open, only elements inside it; otherwise only elements outside any dialog. Take the first.
- On the first find for a step, scroll it into view (centred; instant with reduced motion) if it is off screen.

**The ring:** a non-interactive (`pointer-events: none`, `aria-hidden`) rounded outline 6px outside the target's box, gently pulsing unless reduced motion is on. No backdrop, no dimming.

**The panel** (`role="region"`, labelled by its heading, marked `data-help-ui`):

- Top row: the step's `part` as an eyebrow, "Step N of M" on the right; a thin progress bar (`role="progressbar"`).
- Heading (focusable, takes focus when the tour starts), then the step text.
- "✓ Done." status when a do-step completes.
- Missing message when the target cannot be found (below).
- Offer button + one muted line saying exactly what it creates and that it can be deleted.
- Actions: **Back** (from step 2), **Next / Finish** for info steps or **Skip this step** for do steps, **Take me there** (only when missing and the step has a route), **Exit guide** (always).
- A visually hidden `aria-live="polite"` line announcing "Step N of M: title. text".
- Rendered into the open dialog when there is one (top-layer), else the body.

**Placement** (`placePanel(targetBox, panelSize, viewport)`, plain function, tested):

1. Margin 12px from the viewport, gap 14px from the target, 8px halo around the ring.
2. Try below, above, right, left (centred on the target along the other axis, clamped). Take the first that fits on screen and does not overlap target + halo.
3. If none fits (huge control, narrow phone), take the first viewport corner that does not overlap, in order top-right, bottom-right, top-left, bottom-left.
4. No target → bottom-right corner.

Re-measure the panel after every render, but only store the size when it actually changed, so layout cannot loop.

**Missing targets: never a dead end**

- A do-step whose target has been absent for 1.4 seconds shows its `missing` text, or the default "I can't see that on this screen."
- If the step has a `route`, show **Take me there**, which navigates to it. The tour does not navigate by itself.
- Write `missing` text that tells the person how to get there: "Open a project first: this box is inside a project."

**Keyboard:** Escape inside the panel exits the tour (and stops propagation). A global shortcut (Alt+G in Pravāh) returns focus to the panel from anywhere in the app. Tab moves normally through the app, because the app stays usable.

## Onboarding entry points

The person meets help in five places, from most to least prominent. Each appears once or on demand, never as a repeated nag.

| Entry point | When it shows | What it does | Remembered as |
|---|---|---|---|
| Tour invitation card | A new user's first visit: no data yet, no dialog open, no tour running, not mid-task; after a 900ms delay | An inline card in the page (not a modal): "Let's get to know Serpentora." + one line on what the tour is + **Start guide** / **Not now** | `invited = true` on either answer, or when any tour starts |
| Help hint | Until dismissed, and hidden while Help Mode is on | A small note pointing at the ? button with a Dismiss button | `helpHintDismissed = true` on Dismiss, Explore or Open manual |
| ? button and Help menu | Always, on every screen and in every dialog | Explore (Help Mode), Open manual, tour list with Resume | — |
| "Take a short tour of this" links | On each screen a feature tour is about, in the screen header | A quiet text link that calls `startTour(id)` | — |
| Last step of the essentials tour | End of the essentials tour | Points at the ? and says the manual and every tour live there | `completed` gets the tour id |

The invitation sits in the normal page flow so it never covers anything, and it is marked `data-help-ui` so Help Mode leaves it usable.

**Links back from help:** a topic about a feature can mention its tour, and the Help menu lists every tour. Keep a Help topic for the ? button itself, Help Mode, the manual and the help hint, so Help Mode can explain its own controls.

## Writing guidelines

Help text is UI: write it with the same care as button labels, and say what the control does before why.

**Topics**

- **Title** = the control's visible name, exactly as on screen.
- **Short description**: one or two sentences, starting with a verb about the outcome: "Saves a copy of everything to a file." Not "This button allows you to…". Must make sense alone; it is all most people read.
- **Detailed description**: the how and why, edge cases, what happens next, what is safe. One short paragraph.
- **Tips**: 1 to 3 concrete actions, including the keyboard route where one exists.
- **Related**: 2 to 5 topics a curious person would open next.
- **Keywords**: the words people would search with that are not already in the title.
- Say what is safe: "Nothing is deleted until you confirm." Say what is not undoable.
- Never claim what the app does not do (storage, encryption, sync, sharing). These claims get tests (section 11).

**Tour steps**

- **Title**: the action or idea in 2 to 5 words ("Add a real item", "Pause").
- **Text**: one to three sentences. Do-steps name the exact control and the action: "Press Pause. Work time stops, and nothing is lost."
- Do-steps that create something ask for something real and small, with an example of the right size.
- When the person's own choice matters, say it is theirs: "This is your choice: nothing here finishes anything for you."
- For explained-only features, say so: "This tour never does it for you."
- `missing` says how to get to the control, not just that it is missing.

**Examples of tone** (from Pravāh, for format only)

| Kind | Example |
|---|---|
| Short description | "Moves between Home, Today, Projects and Settings. Nothing is lost when you switch screens." |
| Tip | "Keyboard: Tab to a control and press Enter or Space to hear about it. Escape closes an explanation." |
| Do-step | "Type something you actually want to do and press Add. Small is fine." |
| Missing | "Open a project first: this box is inside a project." |
| Offer | "Use a clearly labelled example task instead" + "It makes one ordinary task named ‘Example: …’, which you can delete any time." |

## Tests that keep help in sync

Help rots silently unless tests fail when the UI and the help drift apart; these are the checks that make the system trustworthy. Write them in Serpentora's test runner.

**Registry**

- Every required topic id exists (a hand-kept list of the features that must be documented).
- Ids are unique; every title is non-empty; every short description is longer than 10 characters; every category is in the list.
- Every `relatedTopics` id exists.
- Every required manual section (category) has at least one topic.
- **Source scan:** grep the UI source for `data-help="…"` and `help('…')`; every id found resolves to a topic, and the count is above a floor (so a broken regex cannot pass with zero matches).
- Search: a known query finds known topics; nonsense returns nothing; empty returns nothing; case and hyphens do not matter; a keyword synonym finds its topic.
- Honesty: the combined topic text contains the claims that must be there and none of the claims that must not (for example storage location, encryption, "never leaves your device").

**Guard** (fake DOM)

- Clicking a control reports its topic id; clicking text inside it counts as the control.
- Pointer presses never reach app handlers.
- Enter and Space explain instead of activating.
- Typing, arrows and hotkeys change nothing; forms cannot submit.
- Tab and Escape still work.
- Navigation links still navigate and are explained; disclosure toggles open and are explained.
- Help UI (`data-help-ui`) keeps working.
- With Help Mode off, nothing is intercepted; uninstall leaves no listeners.

**Tours**

- The essentials tour and each required feature tour exist; tour ids and step ids are unique; every tour has at least 2 steps; essentials parts run 1..N in order.
- **Targets are real:** keep an explicit `OWN_TARGETS` list of `data-tour` ids. Every listed id must appear in the source, and every `data-tour` in the source must be listed (catches both stale and unlisted targets). A target is valid if it is in that list or is a Help id that a real control carries. Include one test that an invented target is rejected, so the check is not an allow-anything.
- Every do-step has `done`; no info-step has one.
- Exactly the allowed offers exist, and each offer label contains the word "example". No step text promises automatic creation or deletion.
- Tours about destructive or outward features have no do-step whose title matches connect, sign out, delete, reset, import, pay, publish.
- Predicates: build fake contexts and assert each important `done` is false before and true after the real state change.
- Placement: the panel never overlaps the target + halo and always stays on screen, across a grid of target positions and viewport sizes, including a narrow phone and no target.
- Store: starting turns Help Mode off; exit saves the place and resume continues from it; Back never goes below 0; finishing marks completed and clears paused; unknown tour ids change nothing; answering the invitation is remembered.

## Accessibility, keyboard and mobile

Everything in help must work with a keyboard, a screen reader and a touch screen, because help is where people go when they are already stuck.

| Area | Requirement |
|---|---|
| Keyboard in Help Mode | Tab moves between controls; Enter or Space explains the focused one; Escape closes the popover. The popover's "Got it" takes focus when it opens. |
| Keyboard in tours | The panel heading takes focus when a tour starts; Escape in the panel exits; a global shortcut brings focus back to the panel; the app stays fully operable. |
| Screen readers | ? button has an `aria-label` and `aria-pressed`. The pill is `role="status"`. The popover is `role="dialog"` with `aria-label="Help"`. The tour panel is a labelled region with a polite live line announcing each step. The ring is `aria-hidden`. Progress uses `role="progressbar"` with values. |
| Reduced motion | No ring pulse, instant scroll-into-view, shorter auto-advance (300ms instead of 700ms). |
| Dialogs | Popover and tour panel render inside the open dialog so they are visible in the top layer and inside its focus trap. Every dialog has its own ?. |
| Touch / mobile | Tap = click, so the guard works unchanged. Hover outline is a bonus, not required. Placement falls back to corners on narrow screens. Panel width caps at the viewport minus margins. Buttons meet 44px touch targets. |
| Multiple windows | Tour state is per window; only `invited`, `completed` and `paused` are shared settings. |
| Native mobile (if Serpentora has one) | Same contracts: a root-level input interceptor for Help Mode; a target registry by test id or accessibility id instead of DOM attributes; a panel plus highlight drawn in an overlay window that does not block touches outside it. |

## Build order

Build in seven steps, each shippable on its own and each ending with green tests; do not start a step until the previous one passes.

1. **Registry and helper.** Topic type, ordered categories, `t()` builder, merged registry with derived id type, `getTopic`, `topicsByCategory`, `help(id)` attribute helper. Write the Getting Started topics.

   - Done when: registry tests pass; a typo in `help('…')` fails type-checking.
2. **Guard.** `installHelpGuard` as a plain function with the full event table.

   - Done when: all guard tests pass in a fake DOM.
3. **Help Mode UI.** Help store (mode, menu, manual, popover), ? button in the top bar and every dialog, Help menu, status pill, popover with More / See also / Open in manual, Escape and scroll handling, body class + CSS.

   - Done when: with Help Mode on, pressing every control on every screen shows an explanation and changes no data (check by hand on each screen).
4. **Manual.** Contents, topic view, history/Back, ranked local search.

   - Done when: search tests pass; every related chip opens a topic.
5. **Coverage pass.** Attach `help()` to every control and screen header; write the topics; add the source-scan and honesty tests.

   - Done when: the source scan finds no unknown id and no control on any screen shows the "no topic" fallback.
6. **Tour engine and UI.** Tour types, store with persisted `invited / completed / paused`, `findTarget`, `placePanel`, ring and panel, missing + Take me there, keyboard, live region, Help Mode closes tours.

   - Done when: placement and store tests pass; one two-step test tour runs end to end.
7. **Tours and onboarding.** Essentials tour with real do-steps and the example offer; one short tour per area; `data-tour` ids + `OWN_TARGETS`; invitation card; help hint; "Take a short tour" links on each screen; tour list in the Help menu.

   - Done when: every tour test passes, and a fresh account can complete the essentials tour without help and without any step getting stuck.

## Kickoff prompt for Claude Code

Paste this into Claude Code in VS Code with the Serpentora project open, and attach or paste this document with it.

```markdown
I want a complete in-app help system in Serpentora: a ? button, Help Mode
(press any control to learn what it does, without it doing anything), a
searchable manual, and interactive guided tours where the user does the real
thing step by step. The attached handoff is the full specification, taken
from another app; follow its principles, behaviour and tests, but use
Serpentora's own stack, screens and wording.

Before writing code:
1. Read the codebase: framework, state, routing, settings persistence,
   dialogs, test runner.
2. List every screen and interactive control, the core jobs a new user must
   learn, and every destructive or outward action.
3. Propose: the files you will add, the category list, the essentials tour
   outline (parts and steps, marking do vs info), the feature tours, and
   any place the spec does not fit Serpentora.
Wait for my approval, then build in the handoff's seven steps, running the
tests at the end of each step and telling me what passed.
```
