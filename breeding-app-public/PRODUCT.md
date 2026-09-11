# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the scaling hobbyist.** A keeper with roughly 20–100 animals whose spreadsheet has started
to break down. They know their collection well but are losing track of pairing history, het
probabilities, feeding and shed records across too many tabs. They are preparing for a season and want
records and genetics under control before it starts. The landing page is written for this person
first.

**Secondary: the established breeder.** 200–500+ animals, breeding commercially, selling regularly.
They need pairing planning, verified genetics, and sales in one system rather than three. The page
does not lead with them, but it must prove enough depth that they can see the product would hold their
collection — the Breeder tier (500 animals) and Professional tier (unlimited, team access) exist for
them.

**Third-party operators: laboratories.** A separate lab portal exists for testing vendors who receive
samples and return certified results. Labs are users of the platform but are not an audience for this
marketing site.

## Product Purpose

Serpentora turns a breeding collection into a queryable record. It holds the animals, their genetics,
their health and feeding history, and the pairings between them, and then uses that record to do work
the keeper would otherwise do by hand or not at all: predicting morph outcomes, planning pairings,
ordering and absorbing genetic test results, and listing animals for sale.

Success is that a keeper stops maintaining a parallel spreadsheet, and that a genetic claim made about
an animal on the platform can be traced to either an observed trait or a lab result rather than to
memory.

## Positioning

The mechanism a neighbouring product could not truthfully copy is the **closed loop between lab
testing and the animal record**. Serpentora is not only a genetics calculator and not only a
record-keeper: a breeder can order a genetic test from within the app, a partner lab returns a
certified result, and the result is applied back to the animal automatically — promoting a suspected
het to a confirmed one, promoting a het to visual, or removing an uncertain het that tested negative —
with a change log recording why the genetics changed and a certificate backing it.

That converts genetics from something a breeder asserts into something the record can substantiate.
The competitive point is provenance, not prediction: prediction is table stakes, an audited chain from
sample to certificate to updated animal is not.

**The intended end point of that chain is the buyer, not the breeder.** When an animal is sold with a
lab certificate, the certificate carries a verification code, and the buyer is meant to be able to
enter that code on the public website and confirm the certificate is genuine. That is what makes the
claim worth something commercially: the trust transfers to a third party who has no account, at the
moment of sale, without taking the seller's word for anything.

**This last step is not built yet.** Codes are generated, stored, printed on the certificate PDF and
shown to the breeder, but there is no public verification page and no unauthenticated lookup — every
certificate route is behind `requireAuth` and a breeder/lab/admin role. Until a public lookup exists,
the verification code is a number on a document that nobody outside the platform can check, and the
site must not tell buyers they can verify anything.

## Operating Context

- The work is seasonal. Pairing, ovulation, laying, incubation and hatching follow a calendar, and the
  product's value peaks around season planning and clutch tracking.
- Records are captured in the animal room, often on a phone, often one-handed, sometimes with a QR
  label on an enclosure as the entry point.
- Genetics is discussed in the community's own vocabulary — morphs, hets, visuals, supers, complexes,
  "poss het" — and the product must speak it exactly. Getting a term wrong reads as not knowing the
  hobby.
- Collections arrive from elsewhere. New users typically have an existing spreadsheet or a MorphMarket
  CSV export, so import is a first-run concern, not an advanced feature.
- Sales happen in a market where MorphMarket is the incumbent listing venue and a reference point
  buyers already trust.

## Capabilities and Constraints

Confirmed and present in the codebase:

- **Animal records** — genetics, health logs, feeding, weight, photos, documents, QR labels, and rack
  and space management.
- **Genetics engine** — Punnett-square morph prediction, het probabilities, multi-generation pairings,
  and a gene database covering **21 species and 635 curated genes** (ball python alone: 233). Gene
  tables are generated from a curated source, not hand-edited.
- **Multi-species support is live** and broader than the current marketing copy implies: alongside ball
  pythons and other snakes, the database covers leopard, crested, gargoyle, chahoua, leachianus and
  African fat-tailed geckos, bearded dragons, and axolotls.
- **Breeding records** — pairings, ovulation, egg incubation, clutch management, hatchling tracking,
  and a family-tree/pedigree view.
- **Lab testing loop** — order genetic tests, track samples, receive certified results, and apply them
  back to the animal's genetics automatically with a change log and certificate.
- **Local-first operation.** The breeder app keeps working with no connection. This is real, it is
  differentiating, and per the site blueprint it is what the offline/reliability story should lead
  with.
- **Certificates** issued by partner labs carry a certificate number (`PH-GT-<stamp>-<suffix>`) and a
  24-character verification code derived deterministically from the order and result, so the same
  certificate always yields the same code. The code is rendered on the certificate PDF and shown in
  the breeder's order detail. **Buyer-facing verification of that code is not implemented** — see
  Positioning and Launch Preconditions.
- **Marketplace exists in code but is a direction, not a feature.** Stores, listings, inquiries,
  favourites, saved searches, reviews and sales are implemented, but the marketplace is spinning out
  as its own product. The blueprint is explicit: mention it as something coming, never in the feature
  list. The current HomePage feature card and PricingPage feature row both violate this.
- **MorphMarket integration is import-only.** It reads a MorphMarket CSV export into Serpentora and
  refuses to guess on any field it cannot place. There is no export path to MorphMarket.
- **Platforms** — browser, Windows desktop (Electron), and Capacitor mobile. Android is built and
  released (release APKs in `apk-backups/`). **iOS is contested:** the blueprint claims "Android and
  iOS builds from the same code", but the repository contains only a Capacitor iOS scaffold
  (`breeding-app-breeder/ios/App`) with no evidence of a shipped build. Resolve before claiming four
  platforms.
- **Ten UI languages**, with German legal requirements explicitly handled (the Impressum route is kept
  under its German name because that is the word a German visitor scans for).

Explicitly undecided or not yet true:

- **Pricing is planned, not live.** Payment processing is not running. The five published tiers (Free,
  Hobby €5, Hobby Plus €10, Breeder €20, Professional/contact) describe what is coming. The pricing
  page may describe plans but must not promise a purchase.
- **The only live action on the site is the waitlist.** Not "Start for free", not a trial, not an
  upgrade. The founding-member pricing lock is the stated incentive for joining now. The current
  HomePage ("Start for free", "Get started free", "14-day trial", "Start free trial") and the live
  `/register` route contradict this.
- **Multi-device cloud sync is a supporting line, not a headline.** Sync exists and is in daily use but
  has open reliability work. Lead with local-first and offline instead.

## Brand Commitments

- **The name is Serpentora.** This is settled. The legal pages, the Capacitor `appName`, the internal
  source comments, `info@serpentora.com` and the serpentora.com deploy target already use it. The
  marketing chrome (navbar wordmark, footer copyright, logo alt text, login copy) still says "Breeding
  Planner" and is stale — as are `app.breedingplanner.com` in the hero screenshot frame,
  `hello@breedingplanner.com` on the pricing page, and the `com.breedingplanner.mobile` Capacitor app
  id. These are corrections to make, not a naming question to reopen.
- **Logo:** `public/Logo.png`, used in the navbar and footer.
- **Voice, as established by the existing legal and product copy:** plain, specific, and unwilling to
  overclaim. The Terms page tells breeders that a prediction is a probability and must not be
  presented to a buyer as proof of an animal's genetics. That refusal to oversell is a brand
  commitment, and marketing copy must not contradict it.
- **Existing product tagline in use:** "the genetics-first platform for reptile breeders."

## Evidence on Hand

**Prior marketing work exists and is binding.** `docs/marketing/` holds three documents that predate
this record and were written from a codebase audit:

- `website-content-blueprint.html` — "Serpentora Site Blueprint": a functionality inventory, a ranked
  list of what the site must show, a homepage section plan, an objection map, an asset shot list, and
  a "Don't claim this yet" section. Treat it as the content authority for this site.
- `marketing-strategy.md` — includes §13.1 "Landing page anatomy (`breeding-app-public`)", plus the
  waitlist incentive, nurture and referral mechanics.
- `go-to-market-plan.md` — phased launch plan the strategy references.

Verified against the codebase:

- **635 curated genes across 21 species** — counted directly from
  `breeding-app-breeder/src/config/species/*.json`; matches the blueprint's headline number exactly.
  Ball python alone is 233. The current "500+ morph genetics" claim is true but understates it.
- **"Certified lab results auto-update genetics" — true.** Implemented in
  `breeding-app-breeder/src/services/lab/geneticsUpdateEngine.ts`, with a genetics change log and a
  certificate service. Certificates carry a number and a 24-character verification code — but see the
  unsupported list below for what may not yet be said about that code.
- **Android app — true.** Release APKs are archived in `apk-backups/`.
- **Local-first / offline operation — true**, and per the blueprint it is the reliability claim to
  lead with.
- **Ten languages — true.** **Four platforms — three verified** (browser, Windows desktop, Android).
- **Real product screenshot** — `breeding-app-public/public/screenshot.jpeg`, used in the hero.

Claims that are NOT supported and must not be repeated:

- **"Export directly to MorphMarket" — false.** The integration runs the other direction: it imports a
  MorphMarket CSV into Serpentora. The current Marketplace feature card states this backwards.
- **"iOS" — unverified.** Only a Capacitor scaffold exists in the repo. The blueprint asserts iOS
  builds; the code does not corroborate it. Do not claim iOS until resolved.
- **"7 plans, from free to enterprise" — false.** Five plans exist in `PricingPage.jsx`.
- **Marketplace as a shipped feature — not to be claimed.** It is spinning out as its own product.
- **"Buyers can verify the certificate online" — not yet true.** The verification code is issued and
  printed, but no public lookup exists: all certificate routes require an authenticated
  breeder/lab/admin role, and the public site has no verification page. Say that certificates are
  issued by the testing lab and carry a verification code; do not say a buyer can check one.
- **Paid subscriptions, trials, or "upgrade" as an active state — not yet true.**

Absences future work must not fabricate: there are no testimonials, no named customers, no user
counts, no uptime or accuracy benchmarks, no press, and no case studies anywhere in the repository. If
the page needs social proof, it must be supplied by the user, not invented.

## Launch Preconditions

Recorded from the blueprint's "Don't claim this yet" section because they gate what this site may say
and when it may point at a signup:

1. **Finish the rename before anything public.** Parts of the product still say "Breeding Planner". A
   visitor arriving from a Serpentora ad who sees the old name loses trust in a market that already
   distrusts new tools.
2. **`/terms` and `/privacy` must resolve on the public domain before any campaign points at a signup
   form.** The app links to both and the links are currently broken in production — the page
   components exist in this repo, so this is a deployment/routing gap, not a missing-content gap.
3. **Do not split the domain before redirecting account emails.** Verification, password-reset and
   email-change links are matched on exact paths; moving the app to a subdomain without redirecting
   those three paths from the apex breaks every email already sitting in someone's inbox.
4. **No purchase promise until payment processing is live.**
5. **Do not promise buyer-side certificate verification until the public lookup ships.** It needs an
   unauthenticated endpoint that resolves a verification code, and a public page to enter it on.
   Because the code is derived deterministically from the order and result, that lookup can confirm a
   certificate without exposing the breeder's wider records — the design already supports it, only the
   public surface is missing.

## Product Principles

1. **A genetic claim must be traceable.** Every trait shown on an animal is either observed, predicted
   with a stated probability, or confirmed by a lab result — and the interface should never blur the
   three. This is the product's core promise and its main defence against becoming a prettier
   spreadsheet.
2. **Never guess on the user's behalf.** The import adapter's rule — surface anything it cannot place
   as a note rather than inventing a value — is the whole product's rule. Silent inference on someone's
   breeding records destroys the record's authority.
3. **Speak the hobby's language exactly.** Morph, het, visual, super, complex, poss het. Correct
   terminology is a credibility gate with this audience; approximation reads as an outsider.
4. **Meet the keeper in the animal room.** The primary capture context is a phone, in front of an
   enclosure, mid-task. Anything that only works comfortably at a desk is a secondary path.
5. **Claim only what the record can support.** The product tells breeders not to present a prediction
   as proof; its own marketing is held to the same standard.

## Accessibility & Inclusion

- The suite ships accessibility-driven appearance presets, including a high-contrast preset and a
  "visually impaired" preset (`#005fcc` on white), plus adjustable base font size, line height and
  layout density. The marketing site should not undercut that posture.
- Reduced motion is a first-class setting: the suite maps both `prefers-reduced-motion` and its own
  in-app toggle to `data-motion-preference="reduced"`, collapsing all transition durations to zero.
- The product is localised into ten languages, and German legal-notice conventions are deliberately
  preserved. No specific external conformance standard (WCAG level) has been established as a
  requirement; that remains undecided.
