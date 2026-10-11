# Breeding cards: migration, reconciliation and recovery

Scope: the female breeding cards introduced by SBR-01..SBR-12 (`breeding_cycles`,
`follicle_examinations`) and the mapping of legacy `Pairing` records into them.

## What changes in the database

Migration `20261011120000_add_breeding_cycles_follicle_examinations` creates two tables and
their indexes. It is additive: nothing is dropped, no existing row is rewritten, and the legacy
`Pairing` table is untouched and still read by the app. The one constraint worth knowing is the
partial unique index `breeding_cycles_one_active_per_female` on `(ownerId, femaleAnimalAppId)
WHERE status = 'active' AND deletedAt IS NULL`. The sync service never lets a save hit it: a
second active card for the same female is paused and flagged for review instead.

Apply like every other migration:

```
cd breeding-app-backend
npm run prisma:migrate:deploy
```

`start:migrate` runs the same command before the server starts, so a deploy applies it. A failed
migration fails the deploy (see `project_staging_failed_migration` in the repo memory).

## Where the legacy mapping runs

The breeder app is local-first. The mapping from legacy pairing records to breeding cards runs
**in the app** on every device the moment it loads pairings (`planLegacyMigration`), with
deterministic card ids (`bc-legacy-<pairing id>`), so two devices produce the same card and the
cloud sync merges them rather than duplicating. Cards it creates carry
`payload.legacy.pairingIds`, `reviewNeeded` and `reviewReasons`; the card shows a "please review"
notice until the keeper marks it reviewed.

The server-side script exists for two reasons: a reconciliation report over an account's stored
pairings before anyone opens the app, and seeding cards for accounts that never open the new
build. It runs the identical planner code (imported from the breeder app) and is rerun-safe.

```
cd breeding-app-backend
npm run breeding:migrate-legacy                   # dry run: report only, writes nothing
npm run breeding:migrate-legacy -- --owner <id>   # one account
LEGACY_BREEDING_MIGRATION_CONFIRM=local npm run breeding:migrate-legacy -- --apply
```

`--apply` refuses to run unless `LEGACY_BREEDING_MIGRATION_CONFIRM` equals the environment the
`DATABASE_URL` points at (`local` for this machine; the host name otherwise). Pointing it at the
staging or production database is the owner's decision, made deliberately, with a backup first.

## Mapping rules (what the report means)

- One legacy pairing becomes one card unless the female AND an explicit season token
  (`seasonId`, `cycleYear`, `seasonName`, `seasonKey`) say two pairings share a season; then they
  become one multi-sire card and the report counts a `merged`.
- Same female, same start year, no explicit season: kept apart and flagged
  `overlaps_other_cycle_same_female` / `multiple_active_legacy_pairings` for review.
- A dated legacy lock (`lockDate`, `lockLoggedAt`, or the appointment date when the appointment
  was ticked as locked) becomes one dated lock record with status `observed` and provenance.
- An appointment ticked done but not locked becomes a session with **no** lock record (unknown).
  Unknown is never converted to observed.
- Aggregate counts (`lockCount`, dated-less `locks`/`lockLogs`) are kept as
  `legacy.aggregateLocks` and listed in the report. They are never expanded into dated locks and
  are not part of the observed-lock total.
- Future appointments become pending planned pairings. Milestones and clutch counts are copied;
  the "hatching complete" fact is left open because the legacy model never recorded it.
- Completed legacy pairings become closed cards; the legacy completion reason is kept in the
  closure note.

The report prints, per owner: legacy counts (pairings, dated locks, introductions, planned-only
appointments), planned counts (cards, locks, sessions, planned pairings), cards needing review
with their reasons, and aggregate lock counts. Dated locks and introductions must match before
and after; the tests in `legacyMigration.test.js` assert the same equality.

## Backup before --apply

```
pg_dump "$DATABASE_URL" --table=public.breeding_cycles --table=public.follicle_examinations --table=public."Pairing" -Fc -f breeding-before-migration.dump
```

## Recovery

- Cards written by one run share `payload.legacy.migratedAt` (printed as the run timestamp):
  `DELETE FROM breeding_cycles WHERE payload->'legacy'->>'migratedAt' = '<timestamp>';`
- Or restore the dump above with `pg_restore --data-only --table=breeding_cycles`.
- Rolling back the schema itself: `DROP TABLE follicle_examinations; DROP TABLE breeding_cycles;`
  and delete the migration row from `_prisma_migrations`. No other table references them.
- Nothing in the legacy `Pairing` table is modified by any of this, so the old UI keeps working
  during rollout and after a rollback.

## Reminders

Planned pairings create one email job each (`breeding_reminder:<card id>:planned_pairing:<entry id>`)
through the existing email queue, only for pending future dates on active cards, and cancel it when
the entry is done, skipped, cancelled or the card is paused or closed. Backfilled history never
queues past-due mail. The in-app Calendar shows the same entries without any queue.
