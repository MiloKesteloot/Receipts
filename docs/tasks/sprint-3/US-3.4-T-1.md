---
id: US-3.4-T-1
story: US-3.4
sprint: 3
assignee: Neko
estimate_hours: 3
---

# Build settlement status calculator for finalized receipts

## Description
Serves User Story 3.4 (Mark paid and confirm). This task implements the pure module `src/lib/settlement.ts` that takes a finalized receipt's split (from `computeFinalSplit`, US 3.3) and the payment records for that receipt and works out, for each person, whether their share is unpaid, marked paid, confirmed by the uploader, or reported as not received, which actions the signed-in user can take on each share, and whether the whole receipt is settled. Storing payments (the database table and RPCs) and the receipt screen UI belong to later tasks in this story and are out of scope.

## Specs
- Types in `src/lib/settlement.ts`:
  - `PaymentState = "paid" | "confirmed" | "not_received"` (what is stored for a share).
  - `PaymentRecord = { payerKey: string; state: PaymentState; markedPaidAt: string | null; respondedAt: string | null }`, where `payerKey` is a member's user id or `guestClaimKey(name)` for a guest, the same keys `PersonShare.userId` uses.
  - `ShareStatus = "uploader" | "nothing_owed" | "unpaid" | "paid" | "not_received" | "confirmed"`.
  - `SettlementPerson = { userId: string; guestName?: string; owesCents: number; status: ShareStatus }`.
  - `Settlement = { people: SettlementPerson[]; settled: boolean; outstandingCount: number; outstandingCents: number }`.
- `computeSettlement(split: FinalSplit, payments: PaymentRecord[], uploaderId: string): Settlement`:
  - Returns one `SettlementPerson` per person in `split.people`, in the same order, with `owesCents` equal to their `totalCents` and `guestName` copied over.
  - The uploader's own share has status `"uploader"` (they paid the bill, so they owe no one). A share of `0` cents has status `"nothing_owed"`.
  - Every other share takes its status from the payment record with the same `payerKey` (`"paid"`, `"confirmed"`, or `"not_received"`), or `"unpaid"` when there is none. Payment records for keys not in the split are ignored; if a key appears more than once, the last record wins.
  - `outstandingCount` / `outstandingCents` count the shares whose status is `"unpaid"`, `"paid"`, or `"not_received"`.
  - `settled` is `true` exactly when `outstandingCount` is `0` (including a receipt where only the uploader has a share).
- `shareActions(person: SettlementPerson, viewer: { userId: string | undefined; isUploader: boolean }): { markPaid: boolean; confirm: boolean; notReceived: boolean }`:
  - `markPaid` is `true` only when the viewer is that person (and not the uploader) and the status is `"unpaid"` or `"not_received"`.
  - For the uploader viewing someone else's share: `confirm` and `notReceived` are `true` when the status is `"paid"`. For a guest share (guests can't mark paid in the app), `confirm` is also `true` when the status is `"unpaid"` or `"not_received"`, and `notReceived` stays `false`.
  - All actions are `false` for `"uploader"`, `"nothing_owed"`, and `"confirmed"` shares, and for viewers who are neither the person nor the uploader.

## Requirements
- Keep the module pure: no Supabase imports or network access.
- Reuse `FinalSplit` / `PersonShare` from `src/lib/finalize-split.ts` and `isGuestClaimKey` from `src/lib/claims.ts` instead of redefining them.
- All amounts are integers in cents.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. `computeSettlement` gives each person in the split a status: `"uploader"` for the uploader, `"nothing_owed"` for a $0 share, the stored payment state when there is a record, and `"unpaid"` otherwise, keeping the split's order and amounts.
2. `settled` is `false` while any share is unpaid, marked paid, or not received, and becomes `true` once every share other than the uploader's (and $0 shares) is confirmed, with `outstandingCount` and `outstandingCents` matching the remaining shares.
3. Payment records for people not in the split are ignored, duplicate records resolve to the last one, and guest shares are matched by their guest claim key.
4. `shareActions` lets a member mark only their own unpaid or not-received share as paid, and never lets the uploader mark their own share.
5. `shareActions` lets the uploader confirm or reject a share marked paid, confirm a guest share directly, and offers no actions on confirmed shares or to other members.
