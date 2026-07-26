# Breeding Project Completion

Breeding projects use three separate concepts:

- Workflow status: `active`, `completed`, or `archived`. Completed ends active monitoring but does not lock the project.
- Biological outcome: derived from the latest known reproductive data, such as ovulation, eggs laid, live birth, hatch, or the completion reason when no later event exists.
- Outcome confidence: `confirmed`, `likely`, or `unknown`.

## Completion Reasons

Implemented reason values:

- `eggs_laid`: Eggs laid
- `live_birth`: Live birth
- `no_ovulation_observed`: No ovulation observed
- `follicles_reabsorbed`: Follicles reabsorbed
- `ovulated_no_eggs`: Ovulated but no eggs produced
- `season_skipped`: Female skipped the season
- `season_ended`: Season ended without expected offspring
- `pairing_unsuccessful`: Pairing did not result in a reproductive outcome
- `health_reason`: Stopped for health or welfare reasons
- `breeding_stopped`: Breeding stopped manually
- `unknown_outcome`: Outcome unknown
- `other`: Other

`No ovulation observed` is intentionally not treated as proof that ovulation did not occur. Follicle reabsorption is separate and must be recorded explicitly.

## Late Events

Completed projects remain editable. Users can still record locks, ovulation, pre-lay shed, egg laying, slugs, fertile eggs, hatch, notes, and other lifecycle events.

When a completed project has a major reproductive event dated after `completedAt`, the app derives that a late outcome occurred. The original completion reason and confidence remain visible and are not overwritten.

Breeder-facing helper text:

> Completing a project ends active monitoring. You can still add ovulation, egg-laying, clutch, hatch, medical, and other events later.

## Reopening

Reopening changes workflow status back to `active`, sets `reopenedAt`, and preserves the previous completion reason, confidence, completion date, note, and status history. Reopening does not delete biological data.

## Analytics Rules

Workflow status is not a biological result. Final-outcome reporting should use the latest known biological outcome:

- A project completed as `no_ovulation_observed` that later records eggs counts as egg-producing in final-outcome reporting.
- The same project can also be counted as a late-outcome case.
- `unknown_outcome`, `health_reason`, and `breeding_stopped` are excluded from biological failure counts unless a report explicitly includes them.
- Slugs, fertile eggs, infertile eggs, and hatch remain distinct where current data supports them.

## Migration And Backfill

Migration `20260715180000_add_breeding_project_completion` adds nullable pairing columns for workflow status, completion reason, confidence, completion timestamps, actor IDs, notes, and reopen metadata.

Backfill rules:

- Preserve explicit completion metadata already present in `Pairing.payload`.
- If a legacy record has an unambiguous recorded clutch, backfill `eggs_laid` with `confirmed`.
- If a legacy record only has completed status and no unambiguous productive outcome, backfill `unknown_outcome` with `unknown`.
- Otherwise default missing workflow status to `active`.

The migration is forward-only and uses nullable columns so existing records remain readable during deployment.

## Limitations

The current project model is still the existing Pairing JSON payload plus mirrored backend columns. There is no separate completion-history table yet; meaningful status changes are preserved in the payload `statusHistory` array.
