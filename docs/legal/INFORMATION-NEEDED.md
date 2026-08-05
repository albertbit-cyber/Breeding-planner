# Information needed to finish the legal documents

**Status as of 2026-08-05.** Answers given so far are recorded below. You do not need to
edit this file — just say the answers in chat and I'll update it.

## Settled and already written into the documents

| Item | Answer | Where |
|---|---|---|
| Minimum age | 16 | Privacy §9, Terms §2 |
| Price-change notice | 30 days | Terms §8 |
| Liability floor | EUR 100 | Terms §12 |
| Crash reporting (Sentry) | Keep — stays declared as a processor and an EU transfer | Privacy §4, §5 |
| Push notifications | Undecided — token storage stays, stays disclosed | Privacy §2 |
| Real users yet? | No, testers only | — |
| Country / governing law | Germany | Terms §15 |
| Contact email | info@serpentora.com | Privacy §1, §7; Terms §16; Impressum |
| Website address | serpentora.com — confirmed | — |

That last one matters: the duty to publish an identifiable controller bites once you hold
other people's data. With no real users, the company decision below can be made calmly
before launch rather than under pressure.

## Still needed

One real decision (§1). Everything else is answered.

---

## 1. Who is behind Serpentora

Still open. Being in Germany raises the stakes on this, because the same details are
needed in **three** places, not one:

1. The Privacy Policy, so the GDPR controller is identifiable.
2. The Terms, naming who the contract is with.
3. The **Impressum** — a standalone legal notice that German law (§ 5 DDG) requires on any
   commercial website. It is now built at `/impressum` and linked in the footer, waiting
   only on these details.

The Impressum is the one to take seriously. Germany enforces it through competitor
*Abmahnungen* — formal cease-and-desist letters that carry the other side's legal costs —
rather than through regulators, so a missing or incomplete notice has a direct price
attached. There is an industry built on sending them.

Two practical notes before you decide:

- **The address is published.** It does not have to be your home. A *ladungsfähige
  Anschrift* from a business-address or registered-office service is normal, accepted, and
  cheap. Tell me if that's the plan.
- **Sole trader vs. company is a tax and liability question, not a legal-text question.**
  A *Steuerberater* is the right person to ask, and it is a short conversation. In outline:
  as an *Einzelunternehmer* your personal assets are exposed; a **UG (haftungsbeschränkt)**
  can be founded with minimal share capital and limits that; a **GmbH** needs €25,000.

```
Which are you going with? (Einzelunternehmer / UG / GmbH / still deciding)
ANSWER:

Name to publish (your full legal name, or the company's exact registered name)
ANSWER:

Address to publish
ANSWER:

Register court and number, if a company (e.g. Amtsgericht München HRB 123456)
ANSWER:

VAT ID (USt-IdNr.), if you have one
ANSWER:

Telephone number for the Impressum — or say "contact form" if you'd rather not publish one
ANSWER:
```

**If you are a company:**

```
Company's full legal name (exactly as registered, including any Ltd / GmbH / s.r.o. / OÜ suffix)
ANSWER:

Registered address (the official address on the register, not necessarily where you work)
ANSWER:

Company registration number
ANSWER:

Country of registration
ANSWER:
```

**If you are a sole trader or individual:**

You still have to publish a name and a contact address — being an individual doesn't
exempt you. Many people use a business postal address or a registered-office service
rather than their home address, and that is perfectly normal. Don't publish your home
address if you're uncomfortable with it; get a mail-forwarding address instead and tell
me you're doing that.

```
Your full legal name
ANSWER:

Contact address you're willing to publish
ANSWER:

Country you're based in
ANSWER:

VAT or tax number, if you have one and want it shown (optional)
ANSWER:
```

---

## 2. Anything you want to say differently

The documents are written in plain language rather than legalese, deliberately. If there's
anything you want worded differently, softer, or stronger, say so here. Also tell me if
"Serpentora" isn't the name you want used throughout.

```
ANSWER (leave blank if nothing):
```

---

## What happens next

1. I fill every blank in both documents and remove the yellow highlighting.
2. I re-check that nothing else in them has drifted from what the code does.
3. You publish, or send them to a lawyer first.

**On the lawyer:** I'd still recommend one before you take payment. Not because the
documents are weak — they now describe your software accurately, which is the part most
templates get wrong — but because a few things genuinely need a qualified opinion in your
specific country:

Now that Germany is confirmed, the list is more specific — a German lawyer should look at:

- **AGB-Kontrolle (§§ 305–310 BGB).** German law polices standard terms harder than most.
  The EUR 100 liability floor is the clause most at risk: caps that leave a breach of an
  essential contractual duty (*Kardinalpflicht*) effectively uncompensated are routinely
  struck down, and a struck-down clause leaves you with *unlimited* liability rather than
  a reduced one. Worth getting right.
- **Widerrufsrecht.** German consumers get 14 days to withdraw from a digital service, and
  there is a prescribed way to obtain a valid waiver if they want immediate access. Needed
  before you charge anyone, not before you launch free.
- **The Impressum.** Cheap to check, expensive to get wrong.
- **Whether the genetics-prediction disclaimer survives AGB review.** Commercially your most
  important clause, and disclaimers are exactly what § 307 BGB scrutinises.
- **Language.** The app ships German translations, so you are plainly addressing German
  users. Terms presented only in English to German consumers are on weaker ground. Ask
  whether a German version is needed — if so, I can produce one to translate.

A lawyer reviewing an accurate draft is a much smaller bill than one writing from scratch.
