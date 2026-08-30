# Handing ProHerper Labs their own account

ProHerper is currently not a customer of the platform — it *is* part of the
platform. Their name, address, phone, bank details and logo were compiled into
the apps; their test list was the platform's test list; their prices were the
platform's prices. There is no ProHerper login because there was never anything
to log in to.

This turns that into a vendor account they own: they sign in, set their own
password, and change their own details, tests, prices and staff without asking
anyone.

---

## What changes for them

| Before | After |
|---|---|
| Details hardcoded in the apps | Theirs, editable in Laboratory Settings |
| The platform's ball-python test list | Their own 68-item catalogue across 10 species |
| The platform's prices | Their prices, which they change |
| No account | Owner account plus staff they invite themselves |
| Their logo on everyone's certificates | Their logo on their certificates only |
| No way to add a gene | Propose a gene; usable at once, shared once reviewed |

What does *not* change: their existing orders, results and certificates. The
migration attributes all of it to them.

---

## Two ways to do it

### Option A — provision, then hand over (recommended)

You create their account and fill it in, then give them the keys. They sign in
to a laboratory that already works.

**Why this one:** their catalogue is 68 items across 10 species. Asking Jurgen
to type that in before he can take a single order is a poor first impression,
and every item is a chance to introduce a typo into a price.

### Option B — invite, and let them build it

Send the invitation and let them add species, tests and prices themselves.

**When this is right:** if you would rather they own every value from the first
keystroke, or if their real prices have moved since the site was captured.

Both end in the same place. A is faster and safer; B is more hands-off. The
steps below are A, with the B variation noted at each point.

---

## Step 1 — Before you contact them

Run the deploy, including both provisioning scripts:

```powershell
cd breeding-app-backend
npx tsx prisma/provisioning/provisionProHerper.ts --apply         # identity
npx tsx prisma/provisioning/provisionProHerperCatalog.ts --apply   # 68 offerings
```

See `docs/architecture/lab-tenancy-deploy-runbook.md` for the full sequence.

*Option B: skip the catalogue script. Run the identity one anyway — nobody
should have to retype an address you already have.*

Then check it in the admin console under **Vendor Labs → ProHerper → View**:
members, orders, offerings, invitation history, audit trail.

## Step 2 — Decide who the owner is

The owner is one person, and it should be whoever actually runs the laboratory —
Jurgen, on current information. Everyone else they add themselves.

If their existing account is on a shared mailbox (`info@proherper.com`), consider
whether the owner should instead be a personal address, with the shared mailbox
added as a second member. Shared-mailbox ownership means password resets go to
whoever happens to read the inbox.

## Step 3 — Send the invitation

**Vendor Labs → Invite a laboratory**. Their email, laboratory name, contact,
country, and a reason for the audit log.

They receive a link, choose their own password, and land in a working laboratory.
**You never see or set their password** — which is the point, and worth saying to
them explicitly.

If they already have the seeded account, invite the owner's address anyway; the
acceptance attaches them to the existing organization rather than creating a
second one.

## Step 4 — Walk them through it once

Fifteen minutes on a call, or a screen recording. In this order, because each
step depends on the last:

1. **Laboratory Settings** — confirm the address and logo are theirs. Check the
   bank details on the certificate. *This is what appears on every document they
   issue.*
2. **Species you test** — ten are pre-set. Adding one here is what makes it
   available to tag on a test.
3. **Test Catalog** — 68 tests. Ask them to check the prices, not just glance:
   these came from their public page as captured, and pages go stale.
4. **Pricing & Logic** — the tier table (35/30/25 morph, 20 additional, 30/25/20
   sex). Panels and the green tree python test are priced individually and do not
   follow these tiers.
5. **Team** — invite their staff. Explain the roles: administrator changes tests
   and prices, member does the day-to-day work.
6. **My Account** — their own name, email and password, separate from the
   laboratory's.

## Step 5 — The three things they must decide

Do not let these slide; each one is wrong until they answer.

**The three unresolved panels.** Recessive, Spider complex and BEL complex price
correctly but do not list which tests they include, because their website does
not publish it. Flagged in the portal. Ask, then set the members.

**Two tests marked coming soon.** Black pastel and Cinnamon are published but not
orderable, per their site. Confirm that is still true.

**Whether the prices are current.** Captured 30 August 2026. If they have moved,
they change them — you should not.

## Step 6 — Go live

Once they confirm, **Laboratory Settings → List my laboratory in the breeder
directory**. Until that is on, breeders cannot find them; after it, they can.

Have them place one test order end to end — pick a laboratory, order a test,
receive it, enter a result, issue a certificate — before you announce anything.

---

## What they can do that you cannot

Worth being explicit with them, because it is the substance of the handover:

- change their name, address, contact details, logo and bank details
- add, reprice, retire and rename their tests
- change their tier pricing
- invite, re-role and remove their own staff
- hand ownership to someone else
- propose a new gene, and use it immediately

**You cannot do any of those.** The endpoints do not exist for an administrator,
so it is not a policy someone has to remember.

## What you can do that they cannot

- see everything: members, orders, results, tests, prices, invitations, audit
- suspend or reactivate their access, with a reason, reversibly
- approve or reject a gene they propose, before it reaches other breeders

## What neither of you can do

- change a result once submitted
- delete an order another laboratory owns
- see another laboratory's anything

---

## If it goes wrong

**They cannot sign in.** Check the invitation has not expired (14 days) in Vendor
Labs → pending invitations. Re-invite if so.

**The invitation link lands on the breeder sign-in page.** `LAB_PORTAL_URL` is
not set on the backend. The invitation is still valid; fix the variable and
resend.

**Their order queue is empty.** The migration could not attribute their orders —
check the deploy output for the unattributed-orders notice.

**A test does not appear to breeders.** Three switches, all of which must be on:
the test is active, it is breeder-visible, and its species is one the laboratory
serves. The catalogue shows all three.

**They want out.** Suspending is reversible and destroys nothing. Their data stays
whole, their documents stay valid, and reactivating restores everything.
