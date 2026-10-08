# Staff accounts

Who holds staff authority on a live database, how to check, and how to create
the owner account without a seed script.

## What was wrong

On 22 September 2026 the live database — the Railway environment named
`staging`, which every deployed site reads — held **four accounts whose
passwords are printed in this repository**, two of them holding the owner role
(`admin`). All four accepted a login against the live backend:

| Account | Role | Password | Printed in |
| --- | --- | --- | --- |
| `admin@breedingplanner.dev` | `admin` (owner) | `admin1234` | `prisma/seed.ts`, `seedAdminUser.ts`, `prisma/e2eReset.ts` |
| `admin@proherper.dev` | `admin` (owner) | `demo1234` | `seedBreeder.js`, `fixPasswords.js` |
| `lab@proherper.dev` | `lab` (lab_owner of ProHerper Lab) | `demo1234` | `prisma/seed.ts`, `prisma/e2eReset.ts`, `seedBreeder.js`, `fixPasswords.js` |
| `breeder@proherper.dev` | `breeder` | `demo1234` | `seedBreeder.js`, `fixPasswords.js` |

The repository is public, so this was not a theoretical exposure: anyone who had
read it could open the admin console of a database holding real breeders' data.

They got there because nothing stopped a seed script from being pointed at a
real environment. `seedBreeder.js` opened with the line
*"Run in Railway console: node seedBreeder.js"*, which is exactly how
`admin@proherper.dev` came to exist on the live database.

Two further rows hold `admin` and are **not** from this repository —
`admin@staging.com` and `morphshaman@gmail.com`. Neither address appears
anywhere in the codebase, so their passwords are not published. That makes four
owner rows on a database whose role model intends exactly one.

> **Status, 8 October 2026: re-audited, nothing has changed on the live
> database.** `railway run npm run audit:staff` against `staging` still lists
> the same four owner rows and the same four seeded addresses, all `active`.
> `lab@proherper.dev` last logged in on 5 October, so it is in day-to-day use
> as the test laboratory. The guard below closes the hole *against recurrence*;
> the rows themselves wait on the owner's per-account decision, and
> `npm run retire:seeded` (below) is the one command that carries it out.
> Re-run the audit before believing otherwise.

## What the seed scripts do now

Every script that writes a known account with a published password calls
`assertSeedAllowed()` from [`breeding-app-backend/scripts/seedGuard.js`](../../breeding-app-backend/scripts/seedGuard.js)
as the first statement of its `main()`. The guard fails closed:

```
NODE_ENV=development   an ordinary developer machine, or
ALLOW_SEED=1           an explicit "yes, seed this database"
```

Anything else — `production`, `test`, an unset `NODE_ENV`, a Railway shell —
refuses with a message naming the script and pointing here. "No opinion" means
"no", which is the point: seeding a non-development database is now always a
visible, typed act.

Guarded scripts:

- `prisma/seed.ts`
- `prisma/e2eReset.ts` (on top of its existing `E2E_RESET_CONFIRM=local` and
  local-host checks)
- `seedAdminUser.ts`
- `seedBreeder.js`
- `fixPasswords.js`

The one automated caller that legitimately seeds is `npm run e2e:reset:local`,
which sets `ALLOW_SEED=1` in `package.json` where it can be read. CI runs with
`NODE_ENV=test`, so without that explicit opt-in the end-to-end reset would be
refused. The unconfirmed `npm run e2e:reset` deliberately does **not** carry it.

`src/tests/seedGuard.test.ts` covers the guard's behaviour and asserts that all
five scripts still call it, so removing one fails the suite rather than quietly
reopening the hole.

`src/tests/retireSeededAccounts.test.ts` covers the retirement command: it must
refuse a non-seeded address, write nothing without `--confirm`, never hash the
published password again, and refuse to delete a row that owns anything.

> `prisma/seed.ts` additionally cannot run at all today: it imports
> `../../src/data/testCatalog`, a file deleted when the repository was
> consolidated (commit `b49b954`). That is a separate pre-existing fault. The
> guard is in place for whenever it is repaired.

## How to audit a live environment

Read-only. Run it through the Railway CLI so the environment's `DATABASE_URL` is
used and no credential is copied onto the machine:

```bash
cd breeding-app-backend
railway status                 # confirm project AND environment before anything
railway run npm run audit:staff
```

It lists:

- every account with a persisted role of `admin`, `moderator` or `support`;
- every account with the persisted role `lab`, together with its organization,
  its membership role (which is what makes it `lab_owner` rather than
  `lab_staff` — neither name is ever stored) and its order counts;
- any remaining account on an address a seed script creates, whatever role it
  holds, so `breeder@` and `buyer@` are not left out of a staff-shaped audit;
- a flag on every address a seed script writes, with the published password and
  the files it is printed in.

To point it at the other environment, switch with
`railway environment production` and re-run. Never assume which one is live:
`staging` is the environment every deployed site reads.

## How to neutralise a seeded account

For an address a seed script writes, there is one command. It only accepts the
addresses in `scripts/seededAccounts.ts`, it dry-runs unless told to apply, and
it refuses to delete anything that owns orders or holds a lab organization
together:

```bash
cd breeding-app-backend
railway status                                   # confirm the environment first
railway run npm run retire:seeded -- lab@proherper.dev admin@proherper.dev   # dry run, writes nothing
railway run npm run retire:seeded -- lab@proherper.dev admin@proherper.dev --confirm
railway run npm run retire:seeded -- admin@breedingplanner.dev --confirm --delete   # only if it owns nothing
```

`--confirm` without `--delete` **neutralises**: the password is replaced with a
random value nobody is told, `status` becomes `suspended` and `isActive` false
(so `loginUser` refuses it), `refreshToken` is cleared and every refresh session
revoked, `deletionRequestedAt` is stamped, and an `AdminAuditLog` row records
it with no actor (`adminUserId` null, because a script took the action). The
row, its organization and its history stay where they are, and the admin
console can set the status back to `active` later without the published
password coming back.

`--confirm --delete` removes the row, but is refused for an account that is a
member of any organization, placed any lab order, or belongs to an organization
that received one. The reasons are below. For a real person's account use the
console instead, so the action is attributed to whoever took it:

**Suspend** — `PATCH /api/admin/users/:id/status` with
`{"status":"suspended","reason":"..."}`. This sets `isActive: false` and clears
the refresh token, and `loginUser` refuses any account that is not active. The
row, its organization and its history stay exactly where they are.

**Then rotate the password**, so that re-activating the account later cannot
silently restore the published credential. There is no admin endpoint that sets
another user's password, so this is either the self-serve forgot-password flow
(which needs working email delivery) or a one-off script run through
`railway run`.

**Deleting** a row is heavier than it looks, and the direction matters:

- Lab orders a laboratory has *received* hang off its **organization**
  (`ShedTestOrder.labOrganizationId`, `onDelete: Restrict`), not off the user.
  Deleting the lab user therefore does **not** delete the lab's orders — but it
  does cascade away the membership, leaving the organization with no one able to
  act for it and its order queue unservable.
- Orders a user *placed* hang off the user (`ShedTestOrder.breederId`,
  `onDelete: Cascade`) and **would be deleted with it**.

So: suspend and rotate by default; delete only an account that owns nothing and
is the sole member of nothing.

## How to create the real owner account

**`POST /admin/users` cannot do it.** The endpoint accepts `role: "moderator"`
and nothing else (`adminService.createAdminUser`, "Team members can only be
created as moderators"), and `PATCH /users/:id/role` refuses the same way
("Moderators are the only staff role available") and additionally refuses to
change an existing owner's role at all. This is deliberate: with no API able to
mint one, the owner stays singular by construction rather than by policy. Any
note or ticket saying the owner can be created through `POST /admin/users` is
out of date.

The owner account must therefore be an **existing `admin` row**, brought onto
the right address and a fresh password.

**The address is decided: `info@serpentora.com`** (owner's decision,
22 September 2026). None of the steps below has been done yet.

1. **Make the mailbox real first.** `info@serpentora.com` has to be able to
   receive mail before it becomes the owner address, or the account can lock
   itself out: no admin endpoint sets another user's password, so the only way
   back in is the emailed reset link. Confirm delivery works
   ([`email-delivery.md`](./email-delivery.md)) before step 2, not after.
2. **Move one existing `admin` row onto it, with a fresh password.** Nothing in
   the API does this, so it is a one-off script against the live environment.
   Run it from `breeding-app-backend`, and read `railway status` first to be
   certain which environment is linked:

   ```bash
   railway status          # must name the environment you actually mean
   railway run npx tsx -e '
     const { PrismaClient } = require("@prisma/client");
     const bcrypt = require("bcryptjs");
     const prisma = new PrismaClient();
     (async () => {
       const password = require("crypto").randomBytes(24).toString("base64url");
       const user = await prisma.user.update({
         where: { email: "<the admin row you are keeping>" },
         data: {
           email: "info@serpentora.com",
           fullName: "Serpentora Owner",
           passwordHash: await bcrypt.hash(password, 12),
           role: "admin",
           status: "active",
           isActive: true,
           emailVerified: true,
           refreshToken: null,
         },
       });
       console.log("owner is now", user.email);
       console.log("one-time password:", password);
     })().finally(() => prisma.$disconnect());
   '
   ```

   Change that password from the account's own settings straight afterwards, so
   the one printed in a terminal stops being the live one. `refreshToken` is
   cleared so any session still open on the old address dies with the change.
3. **Retire the seeded rows** with `npm run retire:seeded -- <addresses> --confirm`,
   and suspend from the console any other `admin` row that is not a person you
   recognise, per the section above.
4. **Re-run `railway run npm run audit:staff`.** It should report exactly one
   owner and no seeded addresses.

Everyone else who needs the console is a **moderator**, and they *are* created
through the API:

```bash
curl -X POST https://breeding-planner-staging.up.railway.app/api/admin/users \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@example.com","fullName":"Their Name","role":"moderator","reason":"Add moderator","sendInvite":true}'
```

Moderators are read-only in the console plus escalations. See
[`admin-lab-separation.md`](./admin-lab-separation.md) for the role and portal
model.

## Why there is no dev-credential hint in the UI any more

The admin, breeder and marketplace `AuthGate` components each carried a
`import.meta.env.DEV`-gated panel printing `lab@proherper.dev / demo1234` and an
admin address with `admin1234`. The gate meant they did not ship to production,
but they were a standing instruction to keep those accounts alive and
identically-passworded on every database a developer touched — and the three
copies had drifted onto three different admin domains
(`breedingplanner.dev`, `Serpentora.dev`, `BreedingPlanner.dev`), none of which
matched what the seed scripts actually wrote.

They are gone. A development login belongs in documentation, not in the sign-in
form: run `npm run e2e:reset:local` against a local database and use the
accounts in `prisma/e2eReset.ts`.
