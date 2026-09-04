# Shed Testing — status across all four apps

Updated 2026-09-04, against `feature/lab-vendor-onboarding`.

The chain now works end to end, verified by running it rather than by reading it:
27 Lab Portal browser tests and 11 breeder browser tests against a live backend
and database, plus 472 backend tests. All green.

**One thing stands between this and production, and it is yours: rehearsing the
migration against a copy of the live database.**

---

## 1. The map

| Piece | Where | What it is |
|---|---|---|
| **Breeder app** | `breeding-app-breeder` | Orders tests. Shed Test Terminal, per-animal test picker, batch cart, labels, results, certificate. |
| **Lab Portal** | `breeding-app-lab` → labpoints.serpentora.com | A vendor laboratory runs itself: queue, intake, result entry, own catalogue, own prices, own team. |
| **Admin Portal** | `breeding-app-admin` | Oversight. Invites labs, reviews applications, approves lab-contributed genes. One write: on/off. |
| **Backend** | `breeding-app-backend` | One API, one Postgres. All three apps talk to it and nothing else. |

Each laboratory is an `Organization` with its own offerings, pricing, team,
identity and bank details. Orders carry `labOrganizationId` and every lab-side
read filters on it. Admins can look and cannot touch, structurally: the endpoints
to edit a laboratory do not exist.

---

## 2. What changed on 2026-09-04

### Results now reach the animal
The genetics update ran in the breeder's browser, when they happened to open the
order — a result nobody opened never reached the animal — and it only ever
updated the order's first animal. It now runs on the backend, in the same
transaction that stores the result, for every animal on the order.

Both clients were also computing it independently, from different gene tables, so
one finding could land twice under two names for the same gene. Both client copies
are gone.

Removals survive the cloud sync now. The genetics arrays merge as a union of both
sides, so a phone still holding "66% poss het Clown" would put it back days after
the laboratory disproved it. The stored confirmation carries its decisions, and
the merge replays them.

### The loop is no longer silent
Five events reach someone, in the app and by email: samples received, testing
started, an order cancelled by the laboratory, an invoice raised, and a laboratory
applying to join (which goes to every administrator). Results have their own
message carrying the findings. Before this, invitations were the only mail in the
entire subsystem.

### A defect that would have appeared on the day a second laboratory went live
Order numbers are generated per laboratory on purpose, but the unique index was
global. The first laboratory to number an order `09AA00001` took that value from
every other laboratory, so the **second laboratory to receive an order in a given
month failed outright** and the breeder saw "Internal server error". With one
vendor it was invisible. The constraint is now per laboratory, and order creation
retries a lost race.

### Three things only visible by opening the portals
- The breeder's Shed Test Terminal asked for the catalogue and prices without
  naming a laboratory, fell back to a vendor-only endpoint, got 403, and rendered
  a bare "Forbidden" — no queue and no orders, though that request had succeeded.
- The Lab Portal never showed a laboratory its own name: the chrome read
  "Laboratory / Laboratory", hardcoded, for every vendor.
- The sample id stored against a result was built from the order's cuid; the id
  printed on the tube comes from the order number. Both were internally
  consistent, so nothing looked wrong until someone needed to trace a tube.

### The fixtures were reproducing dead ends
Seeded users were never email-verified, so the seeded breeder hit a bare 403 at
the one step the fixtures exist to exercise. The seeded laboratory served no
species, so a breeder's species-filtered directory showed "no laboratories are
accepting orders right now". Both laboratories were also called "Seed Genetics
Lab".

### The Lab Portal's dead copy of the breeder app is gone
An IndexedDB store, seven handlers, seven components and five services, none
reachable — including six methods that threw a message about a limitation that no
longer exists. The demo credentials are untouched.

---

## 3. What is left

### 3.1 Rehearse the migration against a copy of production — **blocks the deploy**
`docs/architecture/lab-tenancy-deploy-runbook.md` step 2. Needs the Railway
`DATABASE_URL`, which only you have. Seeded data only exercises the
single-laboratory branch; live data has orders placed before laboratories existed.
If the run reports orders left unattributed, they become invisible to every lab
queue — a decision to make before deploying, not after.

### 3.2 Two environment variables and a Netlify site
`LAB_PORTAL_URL` must point at labpoints.serpentora.com, or every invitation link
drops an invited laboratory on the *breeder* sign-in page. `CORS_ORIGIN` needs the
new origin appended, not substituted. Plus a Netlify site and DNS for the
subdomain.

### 3.3 Decide that there is no payment processing
No gateway of any kind. The payment status a laboratory sets is bookkeeping it
ticks by hand, and the invoice email now says so rather than offering a button
that does not exist. That may well be right — worth deciding rather than
discovering.

### 3.4 With ProHerper
Three panels (Recessive, Spider complex, BEL complex) price correctly but do not
list which tests they include, because ProHerper does not publish that. And Jurgen
should confirm the tier prices before breeders order against them.

### 3.5 Deliberate deferrals
The breeder side is not organization-scoped. Laboratories are tenants; breeder
collections still belong to individuals. It touches 125 ownership checks on the
cloud-sync path, that path has an open data-loss investigation, and the change is
behaviourally invisible today.

### 3.6 One thing found and not fixed
The breeder app logs a React "Maximum update depth exceeded" warning on load. It
predates this branch and is not in the lab flow, but it is a real render loop and
deserves its own investigation.

---

## 4. Running it yourself

The demo credentials are unchanged and deliberately kept:

| Portal | Email | Password |
|---|---|---|
| Lab Portal | `lab@proherper.dev` | `demo1234` |
| Breeder app | `breeder@proherper.dev` | `breeder1234` |
| Admin Portal | `admin@breedingplanner.dev` | `admin1234` |

```powershell
cd breeding-app-backend; npm run e2e:reset:local; npm run dev
cd breeding-app-lab;     npm run dev -- --port 4173
cd breeding-app-breeder; npm run dev
```

To re-run the whole thing end to end:

```powershell
cd breeding-app-lab;     npm run test:e2e:reset   # 27 tests
cd breeding-app-breeder; npm run test:e2e:reset   # 11 tests
cd breeding-app-backend; npx vitest run           # 472 tests
```
