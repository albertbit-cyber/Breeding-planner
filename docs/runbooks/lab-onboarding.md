# Onboarding a partner laboratory

From an empty platform to the laboratory's first result, with no database
access. You do steps 1 to 3 and 7. The laboratory does 4 to 6. Allow 30 minutes
for your part, spread over however long the lab takes to reply.

Sites involved:

| Who | Site |
|---|---|
| You (platform owner) | admin.serpentora.com |
| The laboratory | lab.serpentora.com |
| A breeder placing the test order | serpentora.com |

---

## 0. Before the first invitation (once)

**0.1 The fixes from "Lab onboarding, invite to first result" must be live.**
Before that commit, three things broke this path on the deployed system:

- every invitation link opened the plain sign-in screen, so the lab could not accept;
- accepting returned an error after the invitation had already been used up;
- the lab had no screen to set its own prices.

Check: open any invitation link (see step 2). You should get a page headed
**Set up your laboratory**. If you get **Laboratory Portal / Sign in** instead,
the fix is not deployed yet.

**0.2 Backend variables.** The live sites currently talk to the **staging**
Railway service, so set these there (and on production too, if it is in use by
then). In Railway → project → backend service → *Variables*:

```
LAB_PORTAL_URL=https://lab.serpentora.com
CORS_ORIGIN=<keep the existing origins>,https://lab.serpentora.com
```

- Without `LAB_PORTAL_URL`, the link in the invitation email points at the
  breeder app. The boot log says `[server] LAB_PORTAL_URL is not set` when that
  is happening.
- Without the lab origin in `CORS_ORIGIN`, every request the portal makes fails
  in the browser, starting with the invitation page. **Append** it. Don't
  replace the value.

**0.3 Email must actually send.** The invitation link exists only in the email.
The platform stores a fingerprint of it, not the link, so nobody (you included)
can look it up later. If mail is broken, the lab never gets in.

1. admin.serpentora.com → **Emails** (left menu).
2. In the mail diagnostics panel, type your own address and click **Send test**.
3. Wait for it to land in your inbox. If it doesn't arrive, follow
   `docs/runbooks/email-delivery.md` before going on. Don't send the real
   invitation until the test mail has arrived.

---

## 1. Invite the laboratory (you)

1. admin.serpentora.com → sign in → **Vendor Labs** (left menu, under *People*).
2. If the lab applied through the portal's "Apply to become a partner
   laboratory" form, it appears under **Applications**. Click **Invite** on
   that row and the form below is filled in for you. Otherwise click
   **Invite a laboratory**.
3. Fill in:
   - **Laboratory name**: their legal or trading name, as it should appear on
     certificates. They can change it later.
   - **Email**: the address of the person who will own the lab's account.
     It must not already have a Serpentora account in another organization;
     if it does, you get an error straight away and nothing is sent.
   - **Contact person**, **Location**: optional; prefilled into their settings.
   - **Reason (audit log)**: e.g. "Signed partner agreement 2026-10-XX".
4. Click **Send invitation**. You see "Invitation sent to …".
5. The invitation now appears under **Pending invitations**. It is valid for
   **14 days** and can be used **once**.

Nothing else exists yet: no organization or account is created until they accept.

## 2. Tell them it is coming (you)

Send them a short note from your own mail: the invitation comes from
Serpentora, subject **"Your laboratory is invited to Serpentora"**, and they
should check spam. The link looks like
`https://lab.serpentora.com/#/accept-invite?token=…`.

## 3. If something goes wrong with the invitation (you)

| What they report | What to do |
|---|---|
| No email arrived | Check **Emails** in the admin console for the send. Fix delivery (0.3), then send a new invitation (step 1 again, same address). The new one replaces the old; the old link stops working. |
| Typo in the lab name or address | Send a new invitation with the right details. Same effect as above. |
| "This invitation has expired" | 14 days passed. Send a new one. |
| "This invitation has already been used" | Someone already accepted it. They should sign in at lab.serpentora.com with the password chosen then. If they forgot it, they use **Forgot your password?** on the sign-in page. |
| "This invitation has been withdrawn" | You revoked it or replaced it. Send a new one if that was a mistake. |
| Link opens the breeder app | `LAB_PORTAL_URL` is missing (0.2). Fix it, then send a new invitation. |
| Wrong person invited | In **Pending invitations**, click **Withdraw** on that row, with a reason. |

## 4. The laboratory accepts (them)

1. Click the link in the email. The page says **Set up your laboratory** and
   names the lab and the invited address.
2. Enter **Your name**, choose a password (8+ characters), confirm it, and click
   **Accept invitation**.
3. They land on the lab **Dashboard**, already signed in, with their lab's name
   at the top left. Their address counts as verified because the invitation
   reached it.

What now exists: the lab's organization, their owner account, the lab's account
(already approved, because you invited it), and a price table of its own.

## 5. The laboratory sets itself up (them)

In this order. Each screen is in the left menu (on a phone, under **More**).

1. **Laboratory Settings**
   - Check the name, contact, address and country. These print on every label
     and certificate.
   - **Species you test**: search and add every species they handle.
     *Until at least one is added, breeders cannot find the laboratory.*
   - Optional: description for breeders, typical turnaround, certificate logo,
     IBAN / BIC / VAT for certificates.
   - Leave **List my laboratory in the breeder directory** ticked.
   - Click **Save settings**.
2. **Test Catalog** → **+ Add Test**, once per test. Or use
   **Import from spreadsheet** to load a whole price list at once.
   - Display name, internal code, gene target, and tick the species it covers.
   - Leave **Active** and **Visible to Breeders** ticked.
   - Leave **Price** empty to charge from the tier table in the next step, or
     enter a flat price for this test.
   - Click **Save**.
3. **Pricing**: the tier table, in their currency.
   - **The table starts as a copy of the platform template, or all zeros if
     there is none.** They must fill in their own numbers: first morph test,
     each additional morph test, and sex determination, for 1–9, 10–49 and 50+
     animals.
   - Click **Save prices**. "Prices saved" confirms it.
   - Under **What a breeder would pay**, tick a test and check the total. This
     preview comes from the same calculation a real order uses.
4. **Team** → **Invite a colleague**: email and role (**Administrator** may
   edit tests, prices and staff; **Member** works orders only), then
   **Send invitation**. Each colleague gets their own email and goes through
   step 4. Invitations to colleagues are valid for 7 days.

## 6. The first order (a breeder, then them)

1. A breeder account at serpentora.com → **Shed Test Terminal** → add an animal
   of a species the lab serves → under **Choose a laboratory**, pick the new
   lab → choose its test → submit. A friendly breeder, or your own breeder
   account, works for a trial order.
2. Lab portal → **Dashboard** / **All Shed Orders**: the order appears under
   *New Incoming Test Orders*, with the price from their own table.
3. When the sample arrives: **Sample Intake** (scan the label QR or enter the
   order) marks it received.
4. **Result Entry** → pick the order → set a status for every ordered test →
   submit. The order becomes *completed*, the breeder gets their certificate,
   and a "results ready" email goes out.

## 7. Check it from your side (you)

admin.serpentora.com → **Vendor Labs** → click the laboratory. You can see:
contact, order activity, members, tests offered, and invitation history.

You can **see** everything here, but the only thing you can **change** is
suspend / reactivate (with a reason). Tests, prices, staff and results belong
to the laboratory. There is no admin screen for them, by design.

---

## What was verified, and how

- `breeding-app-backend/src/tests/labOnboarding.test.ts` runs this entire path
  (steps 1 to 6) through the real API. It also covers expiry (14 days; an
  expired link creates nothing), single use, a re-invite replacing the old
  link, revocation, and refusing an address that already belongs to an
  organization.
- Steps 4 and 5 were clicked through in a browser against a local backend:
  invitation page, accept, dashboard, settings, catalogue, pricing.
- **Not verified:** a real email arriving from the deployed system, and DNS/CORS
  for lab.serpentora.com. Step 0 covers both. Do it before step 1.
