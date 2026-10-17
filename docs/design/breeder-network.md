# Breeder network: messages, transfers, joint projects

Status: built on `feature/breeder-network` (2026-10-17). Breeder app + backend. Owner decisions are
marked **(owner)**.

## What a breeder can do

- **Be found by an @handle, and only by it.** No browsing of accounts, no lookup by email; search
  needs two characters of a handle prefix. Other breeders see the handle and the breeder name
  (profile `breederName`, else the account name), never the email address.
- **Write to anyone with a handle (owner).** A first message from someone you have never talked to
  is a **message request**: you can read it, then accept (moves to the inbox), ignore (hidden, no
  more notifications) or block. Replying accepts it. Until it is accepted the sender can add at most
  5 messages to it.
- **Share a snake card or a marketplace link** in any conversation. A card carries name, ID, sex,
  genetics and a web photo, never notes, prices or logs. Only listings a stranger can open are offered.
- **Transfer an animal (owner: copy, not move).** The receiver gets a copy of the record once they
  accept; the sender keeps theirs. Every transfer needs a **reason**, written onto both cards.
  - **Sale / gift / trade (permanent):** the sender's animal moves to their archive (`Sold`, or
    `Archived` with reason given away / traded), the receiver as counterparty, the reason as the note.
  - **Loan (temporary):** the sender's animal stays in the collection as `On loan`; the receiver's copy
    is marked borrowed and cannot be passed on. Either side ends the loan: the borrower's copy goes to
    their archive, the owner's animal gets its old status back plus the weights, feeds, sheds and meds
    the borrower logged during the loan.
- **Run a joint project with one other breeder (owner).** One brings the male, the other the female.
  **Whoever keeps the female through her cycle incubates (owner)**, so the female's owner is the keeper.
  - On acceptance the keeper's account gets a read-only **partner record** of the male (status
    `Partner`, not counted toward the plan limit). The keeper pairs on an ordinary breeding card;
    nothing about breeding cards changed.
  - Both breeders follow the cycle in the project panel, read from the keeper's card (locks,
    ovulation, eggs laid, hatched).
  - **The split is negotiated (owner):** either side proposes terms (alternate picks, percentage,
    number of hatchlings, or own terms), the other accepts, rejects or counter-proposes.
  - The keeper sends the partner their hatchlings; each is a transfer of kind `split` the partner
    accepts. Closing the project writes both parents onto every hatchling in both accounts and moves
    the partner record to the keeper's archive.

## How it is built

Server-authoritative. None of this travels in the breeder snapshot: a conversation is not something
two offline devices should merge, and a transfer must be a live, confirmed server action. What lands
in a collection (a received copy, an archived original, a partner record, a project stamp on a
hatchling) is written as ordinary `Animal` rows and arrives with the next sync pull, which the app
triggers right after such an action. Server edits are stamped with `stampServerEdit`, under
`lockBreederAccount`, so a device that has not synced cannot set them back.

| Piece | Where |
|---|---|
| Schema (6 tables + `User.handle`) | `breeding-app-backend/prisma/schema.prisma`, migration `20261017120000_breeder_network` (additive) |
| Handles, people search | `services/networkIdentityService.ts` |
| Threads, requests, blocks, reports, badge | `services/networkThreadService.ts` |
| Transfers, loans | `services/animalTransferService.ts` (reuses the marketplace sale's allowlisted copy) |
| Joint projects, split, pedigree | `services/jointProjectService.ts` |
| API | `routes/networkRoutes.ts` under `/api/network`, breeder accounts only, rate-limited |
| Breeder UI | `breeding-app-breeder/src/features/network/` (Messages tab, record panel on the snake editor) |

Pedigree across accounts: a split hatchling received by the male's owner points its `sireId` at their
own male; the dam is named with her breeder in `externalParents`. Every project hatchling, in both
accounts, gets `ParentRelationship` rows to the real sire and dam (`Animal.id` in each owner's
account) and a `jointProject` block naming sire owner, dam owner and incubator. This is the first code
that writes `ParentRelationship`; the cross-breeder pedigree reader is separate work.

Blocks reuse `marketplace_user_blocks`, so one block covers messages, transfers, projects and the
marketplace. A report files a `Report` (type `network_message`) into the existing admin queue. The
account data export includes conversations, transfers and projects. Removing an account cascades.

## Known limits

- No push or realtime: the badge polls every 60 s, an open conversation every 10 s.
- Transferring a female out does not close her open breeding cards on the sender's side (the
  archive dialog does that when archiving by hand).
- Not gated by tier: every breeder account can use it.
- Help topics are English only (help is English-only on `main`).
- Translations are machine-made, not natively reviewed.
