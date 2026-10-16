# Tier limits: animals and photos per animal

Owner's numbers, set on 16 Oct 2026:

| Tier | Animals | Photos per animal |
|---|---|---|
| Free | 10 | 3 |
| Hobby | 50 | 5 |
| Hobby Plus | 100 | 7 |
| Breeder | 250 | 9 |
| Professional Breeder | 500 | no tier limit |
| Enterprise | no limit | no tier limit |
| Lab / Testing Partner | (not a breeder tier) | photos off |

"No tier limit" on photos still stops at the technical cap, `PHOTO_MAX_PER_ANIMAL`
(default 60): an animal's photos travel in its record, its backups and its PDFs.

The numbers live in `breeding-app-backend/src/services/tierLimitPlan.ts` (for live
databases) and `prisma/seed.ts` (for fresh local ones). Change both together.

## What the limits do

- **Animals** (`animals.create`): unchanged mechanism. The app stops an add or
  import that would go over, and cloud sync refuses a save that would. Archived
  animals do not count.
- **Photos per animal** (`animals.photos`): new. The value is per animal, not per
  account. The app shows "3 of 5 photos" on the record, disables Take/Upload when
  the animal is full, and adds only what fits from a multi-select. The backend
  refuses an upload over the limit with `403 PHOTO_QUOTA`, `scope: "animal"`.
  Removing a photo frees its place at once.
- **Nothing is ever removed.** An account over a new limit keeps every animal and
  every photo. It cannot add more until it is under.
- **Photos taken before the limits** (the device's `addedAt` earlier than
  `PHOTO_LIMITS_FROM`, default 2026-10-17) skip the tier limit on upload, so the
  one-time move of on-device photos to cloud storage never leaves an old photo on
  one device only. The technical cap still applies to them. Known trade-off: the
  date comes from the device, so a hand-crafted API call could back-date a photo
  past the tier limit (never past 60).
- A photo the backend refuses stays on the device and in backup files, and the
  app offers it again on later syncs. The upload queue skips only that animal;
  the other animals' photos still go up.

## Applying the numbers to staging or production

The tier rows in a live database do not change by themselves: deploying the code
only changes how the limits are read. Run the script once per environment.

**Never run `prisma/seed.ts` against staging or production**: it also creates
demo accounts and resets every feature row of every tier.

```bash
cd breeding-app-backend
railway status                   # confirm project AND environment first
railway run npm run tiers:limits # dry run: prints every change, writes nothing
```

The dry run prints, per tier, each limit as `before -> after`, the tiers it could
not find, and how many active accounts are already over the new limits (counts
only; those accounts keep everything). Read it, then:

```bash
railway run npm run tiers:limits -- --apply
```

It writes only the `tier_features` rows for `animals.create` and
`animals.photos` on existing tiers, in one transaction, plus one
`admin_audit_log` entry (`tier_limits_applied`) holding before and after. It
also refreshes the feature catalogue names, so the admin shows "Photos per
animal". Running it again finds nothing to change.

Order: deploy first, then apply. Applied on the old code, `animals.photos` would
still be read as a total per account (3 photos for a whole Free account).

## Afterwards

- **Admin → Tiers** shows each tier's animals and photos per animal on its card,
  and Quick edit / Full editor have an "Animals and photos" panel. Changes there
  take effect at once; no script needed.
- **Admin → Users → a user** shows the account's animals (`12 of 50 · Hobby
  tier`) and photos per animal, and where they come from. A manual override on
  `animals.photos` gives one account a different number per animal.
- The breeder app reads the limits after sign-in. A device that was signed in
  before the change picks them up on its next sign-in or app reload.

## Rolling back

Re-run with the old numbers (edit `tierLimitPlan.ts` locally, dry run, apply), or
set them in Admin → Tiers. The audit log entry holds the values before the change.
