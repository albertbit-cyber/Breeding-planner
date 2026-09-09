# Admin / laboratory / breeder separation

## What was wrong

Signing in to the admin console with breeder credentials succeeded. The console
shell rendered, every panel inside it was empty, and the whole thing looked like
a broken admin page.

No data leaked. `adminRoutes` was already gated by `requireRole("admin")`, so
every request the breeder session made came back 403 — the emptiness *was* the
security working. What was missing is that nothing stopped the session from
existing in the first place: `POST /auth/login` had no idea which app was
asking, and each app's `AuthGate` persisted any successful login regardless of
role. The hole ran in every direction — a laboratory account could open the
breeder app, a breeder could open the Laboratory portal.

## What replaced it

**Portals.** Every sign-in names the app it came from (`breeder`, `lab`,
`admin`, `marketplace`). A role that does not belong to that portal is refused
at login with a 403 — no token minted, no cookie set, no session row written —
and the attempt is recorded as an `auth.login.blocked_portal` security event.
The portal is carried in the token, re-checked on every refresh, and enforced on
the admin and lab-vendor route groups by `requirePortal`, so a token legitimately
held for one app cannot be replayed against another.

Staff (the owner and moderators) pass every portal by design. Everyone else is
confined to their own.

**Roles.** Three that matter:

| Role | Admin console | Other portals | Created by |
| --- | --- | --- | --- |
| `admin` (the owner) | full | yes | already exists; no API can mint another |
| `moderator` | read-only, plus escalations | yes | invited by the owner |
| `lab`, `breeder`, `buyer` | no | their own | vendor invite / public signup |

`support` was folded into `moderator`. It used to normalize to `admin`, which
silently gave every support account the full admin key.

**Read-only moderators.** The rule lives inside `requireRole`, not on the admin
router: a route is "admin power" when admin roles are the only thing it accepts,
and moderators get `GET` on those and nothing else. This matters because admin
power is not confined to `adminRoutes` — 17 more endpoints across
`subscriptionRoutes`, `marketplaceRoutes`, `labRoutes` and `orderRoutes` are
gated the same way, and a router-level guard would have left every one of them
writable. Two deliberate exceptions live in `adminModeratorRoutes`: raising an
escalation, and escalating a report. Both are inert — they put something in
front of the owner and change nothing else.

## Deploying it

The migration (`20260909120000_admin_separation`) contains **no enum DDL**, on
purpose. Postgres refuses to *use* an enum value added inside the same
transaction, and Prisma runs each migration in one — so adding a role and
assigning it in one file fails at deploy time. Both values already exist, so the
role change is a plain `UPDATE`, and the only DDL is a new table.

1. `npm run prisma:migrate:deploy` — as usual. The `UPDATE` is idempotent and
   the `CREATE TABLE` is `IF NOT EXISTS`, so a re-run is safe.
2. `npm run audit:staff` — read-only. Lists every account holding `admin`,
   `moderator` or `support`.
3. Look at that list. The code guarantees no *new* owner can be created; it
   cannot know how many already exist. If more than one account holds `admin`,
   demote the extras from the console's user list.

### Expected fallout

Staff who were signed in when this ships must sign in again. Their tokens carry
no `portal` claim, and a missing claim is read as the least privileged portal
rather than as a wildcard — which is the point: old tokens expire out of the
console instead of grandfathering into it.

## Adding a moderator

Team & Account → *Invite a moderator*. Owner only; the page is hidden from
moderators and the endpoint refuses them. Moderator is the only seat the form
offers, and `updateAdminUserRole` refuses to assign `admin` too, so promoting an
existing account is not a second way in. Laboratories are still onboarded from
Vendor Labs, which also creates the organization they belong to.
