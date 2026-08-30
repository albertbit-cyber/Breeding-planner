# Deploying lab vendor tenancy

Runbook for the `feature/lab-vendor-onboarding` branch. Two migrations ship with
it, one of which rewrites existing order data.

The one thing this branch is waiting on is **step 2** — it needs database access
that only you have.

---

## What ships

| Migration | What it does |
|---|---|
| `20260830120000_add_lab_vendor_tenancy` | Lab-owned tests and pricing, orders carrying their laboratory, per-lab identity. **Back-fills existing rows.** |
| `20260830140000_add_partner_applications` | A new empty table. No backfill, no risk. |

Only the first needs care.

---

## 1. Rehearse locally (already done, repeat if you change anything)

```powershell
cd breeding-app-backend
./scripts/verify-lab-tenancy-migration.ps1
```

Builds a throwaway database, applies every prior migration, seeds the state a
real deployment is in, applies the tenancy migration, and asserts the backfill.
Ends with `Migration verified` or throws.

This is what caught the defect where the order-line backfill referenced the
`UPDATE` target from inside a `JOIN ... ON` clause — PostgreSQL rejects that, and
the migration would have failed on deploy.

---

## 2. Rehearse against a copy of production — **required, blocks deploy**

Seeded data only exercises the single-laboratory branch. Your data will have
real volume and cases the seed does not: orders placed before laboratories
existed, hand-edited catalogue rows, order lines whose test was later removed.

```powershell
cd breeding-app-backend
./scripts/rehearse-migration-on-production-copy.ps1 -SourceUrl "postgresql://user:pass@host:5432/railway"
```

Get `SourceUrl` from Railway: **project → Postgres → Variables → `DATABASE_URL`**
(the public/proxy URL, not the internal one).

The script never writes to production. It dumps, restores into a local scratch
database, and migrates that.

### What to look for

The migration prints `NOTICE` lines. These are the whole point of the exercise:

```
NOTICE:  Attributed all existing orders to the single vendor lab org_xxx
```
Good. Every historical order now belongs to your existing laboratory.

```
NOTICE:  Found 0 vendor labs; existing orders left unattributed for manual assignment.
NOTICE:  Tenancy backfill left 14 order(s) and 31 order line(s) unattributed.
```
**Stop and decide.** Those orders are readable but invisible to every laboratory
queue. Either create the laboratory record first so there is exactly one to
attribute to, or plan a follow-up `UPDATE` that assigns them deliberately.

Anything that *errors* rather than notices means do not deploy. Send me the
output.

### Afterwards

The scratch database holds a copy of real customer data. Drop it:

```powershell
psql -h localhost -U postgres -c 'DROP DATABASE "prod_rehearsal";'
```

---

## 3. Set the new environment variable

`LAB_PORTAL_URL` — where invited laboratories land.

Without it, invitation links are built from `PUBLIC_APP_URL` and drop an invited
laboratory on the **breeder** sign-in page, where they cannot sign in. The
invitation is still valid; the link just goes to the wrong app.

```
LAB_PORTAL_URL=https://lab.serpentora.com
```

Set it on the backend service before the first invitation goes out.

---

## 4. Deploy

Migrations run on boot via `start:migrate`. Order does not matter between the
two; Prisma applies them in timestamp order.

---

## 5. Verify in production

1. **The existing laboratory still works.** Sign in, open the order queue, and
   confirm the historical orders are there. If the queue is empty, the backfill
   left them unattributed — check step 2's output.
2. **It has its tests.** Test Catalog should list what it was selling before;
   the migration copies the shared catalogue into its own offerings.
3. **It has its own prices.** Pricing & Logic should load rather than 404.
4. **The directory works.** From a breeder account, start an order — the
   laboratory should appear and be selectable.
5. **Fill in its identity.** Laboratory Settings starts blank for address and
   logo, because there was nowhere to migrate them from. Until they are filled
   in, shipping labels and certificates render with the name only. This is
   deliberate — the alternative was carrying over the hardcoded details of the
   one laboratory the feature was first built for, which every other vendor
   would then have inherited.

---

## Rolling back

The schema changes are additive apart from one column: `ShedTestOrderAnimalTest.testId`
becomes nullable and loses its foreign key. Nothing is dropped and no data is
deleted, so the previous application version keeps working against the migrated
database — the new columns are simply ignored.

That means **rolling back the application does not require rolling back the
database**, which is the safer direction. If you do need to reverse the schema,
restore from the pre-deploy backup rather than writing a down-migration; the
backfill is not losslessly reversible, since it cannot know which order lines
had a `testId` before.

---

## Still open after this deploys

- Browser end-to-end tests are updated but have not been run against a live
  environment.
- The breeder side is not yet organization-scoped (plan §3.2 step 2). Laboratories
  are tenants; breeder collections still belong to individuals.
