# Deploying lab vendor tenancy

Runbook for the `feature/lab-vendor-onboarding` branch. Three migrations ship
with it, one of which rewrites existing order data.

The one thing this branch is waiting on is **step 2** — it needs database access
that only you have.

---

## What ships

| Migration | What it does |
|---|---|
| `20260830120000_add_lab_vendor_tenancy` | Lab-owned tests and pricing, orders carrying their laboratory, per-lab identity. **Back-fills existing rows.** |
| `20260830140000_add_partner_applications` | A new empty table. No backfill, no risk. |
| `20260830160000_add_lab_payment_details` | Three nullable columns on `LabAccount` (`iban`, `bic`, `vat_number`), so each laboratory carries its own certificate payment details instead of the hardcoded ones. No backfill, no risk. |
| `20260831090000_species_vocabulary` | Remaps species onto the platform taxonomy and makes an offering multi-species. **Rewrites existing rows.** |
| `20260831100000_add_lab_gene_submissions` | New empty table for lab-contributed genes. No backfill, no risk. |
| `20260830180000_extend_lab_offerings` | Widens a test offering: kind (morph/sex/panel), flat vs tier pricing, per-test tier overrides, add-on price, species, aliases, availability, panel scope and membership. Additive and defaulted, so existing offerings keep behaving identically. |
| `20260904090000_add_pending_shed_tests` | New empty table for the breeder's saved shed queue. No backfill, no risk. |
| `20260904120000_scope_order_number_to_lab` | Replaces the global unique index on `orderNumber` with one scoped to the laboratory. **Changes a constraint, changes no data** — see below. |

The first and the species remap both rewrite existing rows; the rest are additive.

`20260904120000_scope_order_number_to_lab` is the one to understand before
deploying, because it fixes a defect that only appears with more than one
laboratory. Order numbers have always been generated per laboratory — a shared
sequence would let each vendor read the others' order volume out of the gaps in
its own numbering — but the unique index was global. The first laboratory to
number an order `09AA00001` took that value away from every other laboratory, so
the *second* laboratory to receive an order in a given month failed with a
unique-constraint error and the breeder saw "Internal server error".

The migration only narrows the constraint. Numbers that were unique globally
remain unique per laboratory, so there is nothing to back-fill and nothing that
can fail on existing rows.

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

## 3. Set the two environment variables

The Lab Portal is served from **labpoints.serpentora.com**. The backend needs to
know that twice, for two unrelated reasons.

```
LAB_PORTAL_URL=https://labpoints.serpentora.com
CORS_ORIGIN=<existing origins>,https://labpoints.serpentora.com
```

`LAB_PORTAL_URL` — where invited laboratories land.

Without it, invitation links are built from `PUBLIC_APP_URL` and drop an invited
laboratory on the **breeder** sign-in page, where they cannot sign in. The
invitation is still valid; the link just goes to the wrong app. The backend now
logs `[server] LAB_PORTAL_URL is not set` at startup when that fallback is in
play, so check the boot log rather than trusting silence to mean it is set.

`CORS_ORIGIN` — whether the portal may call the API at all.

`CORS_ORIGIN` is a comma-separated allowlist (`src/app.ts`), and an origin absent
from it gets no CORS headers back. The portal talks to the same backend as the
breeder app, so a missing entry does not degrade gracefully: every request from
labpoints.serpentora.com fails in the browser, starting with the sign-in an
invited laboratory lands on. Append the new origin rather than replacing the
value — the breeder and admin origins live in the same variable.

Set both on the backend service before the first invitation goes out.

Netlify also needs a site for `breeding-app-lab`, with DNS for the subdomain to
match. `breeding-app-lab/netlify.toml` carries only the build command and publish
dir, so the site, its branch and its `VITE_API_URL` are all set in the Netlify UI.

---

## 4. Deploy

Migrations run on boot via `start:migrate`. Prisma applies them in timestamp
order.

### Then provision ProHerper

Two scripts, both idempotent and both with a dry run. Run them in this order:

```powershell
cd breeding-app-backend
npx tsx prisma/provisioning/provisionProHerper.ts            # identity - dry run
npx tsx prisma/provisioning/provisionProHerper.ts --apply

npx tsx prisma/provisioning/provisionProHerperCatalog.ts     # catalogue - dry run
npx tsx prisma/provisioning/provisionProHerperCatalog.ts --apply
```

The first restores their name, contact, address, phone, email, bank details and
logo — everything that used to be hardcoded. It only fills blanks, so anything
the laboratory has since set for itself wins.

The second replaces the platform's generic ball-python seed with ProHerper's own
published catalogue: 60 morph tests across four species, three sex determination
tests and five panels, at their real prices. It reports anything already on
their list that the catalogue does not mention, and never deletes.

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
5. **Check the catalogue.** Test Catalog should show 68 rows: 60 morph tests
   tagged by species, 3 sex determination tests, and 5 panels. Two ball python
   tests (Black pastel, Cinnamon) show as *coming soon* and cannot be ordered.
6. **Check the species.** Test Catalog shows each test tagged by species, and
   Laboratory Settings lists the ten ProHerper serves. A breeder ordering for a
   corn snake should now see ProHerper; one ordering for a leopard gecko should
   not.
7. **Confirm the three unresolved panels with ProHerper.** Recessive, Spider
   complex and BEL complex price correctly but do not yet list which tests they
   include, because ProHerper does not publish that. They are marked as
   unresolved in the portal; ask, then set the members in Test Catalog.
8. **Have Jurgen check the prices** before breeders can order. The tier table is
   set from their published list (35/30/25 morph, 20 additional, 30/25/20 sex),
   but confirming it is theirs to do, not ours to assume.

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

## Handing the laboratory over

Provisioning gives ProHerper a working laboratory; it does not make it theirs.
`docs/handoff/PROHERPER_HANDOVER.md` covers the rest — who the owner should be,
what to walk them through, the three things they must decide, and what each of
you can and cannot do afterwards.

---

## Still open after this deploys

- The breeder side is not yet organization-scoped (plan §3.2 step 2). Laboratories
  are tenants; breeder collections still belong to individuals.
- There is no payment processing anywhere. The payment status a laboratory sets is
  bookkeeping it ticks by hand, and the invoice email says so rather than offering
  a button that does not exist. Worth confirming that is the intent.
- The breeder app logs a React "Maximum update depth exceeded" warning on load.
  It predates this branch and is not in the lab flow, but it is real and worth
  its own investigation.

Browser end-to-end tests **have** now been run against a live stack — 27 in the
Lab Portal, 11 in the breeder app, all green. What they caught is in the commit
"Run the browser tests against a live stack, and repair what that found".
