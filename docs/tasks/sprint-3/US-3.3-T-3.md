---
id: US-3.3-T-3
story: US-3.3
sprint: 3
assignee: Daniel Klos
estimate_hours: 4
---

# Add Finalize button and final split breakdown to the receipt screen

## Description
Serves User Story 3.3 (Finalize and split). This task wires finalizing into the receipt screen (`src/app/(app)/(home)/receipts/[id].tsx`): the uploader gets a Finalize button that stays disabled while items are unclaimed, and once a receipt is finalized every member sees what each person owes (items, tax, tip, and total) in a new `FinalSplitCard` component (`src/components/final-split-card.tsx`), with claiming locked. The split math (`US-3.3-T-1`) and the database/RPC support (`US-3.3-T-2`) are out of scope.

## Specs
- The receipt screen loads `status`, `created_by`, `tax_cents`, and `tip_cents` with the receipt.
- While the receipt is `submitted` and has items:
  - The uploader (`created_by` equals the signed-in user) sees a `"Finalize receipt"` button. While `findUnclaimedItems` reports unclaimed items, it is disabled and the screen shows `"1 item still needs a claim"` / `"N items still need a claim"`; otherwise it shows `"Every item is claimed."`
  - Other members see `"Waiting for <uploader name> to finalize."` instead of the button.
- Pressing the enabled button opens the in-app `ConfirmCardModal` (`src/components/confirm-card-modal.tsx`) titled `"Finalize receipt?"` with `"Cancel"` and an accent-colored `"Finalize"` button, instead of a browser or OS alert. Confirming calls `finalizeReceipt(receiptId)` from `src/lib/finalize-receipt.ts` and shows a spinner in the card until it finishes; cancelling closes the card and does nothing.
  - On `{ status: "ok" }` the screen switches to the finalized view and shows a `"Receipt finalized."` toast.
  - On `{ status: "unclaimed" }` it shows an error toast with the unclaimed count; on `{ status: "error" }` it shows the error message. On `ALREADY_FINALIZED` it reloads the receipt. The receipt otherwise stays as it was.
- When the receipt is `finalized` (just now or on load):
  - The header shows a `"Finalized"` badge.
  - `FinalSplitCard` shows one row per person from `computeFinalSplit` (`US-3.3-T-1`) with their name (`"You"`, member name, or `"<name> (Guest)"`), total, and an `Items · Tax · Tip` breakdown, plus a footer with the receipt's subtotal, tax, tip, and total. If the split's total differs from the receipt's `total_cents`, the card says so.
  - Item rows are disabled (no claim or unclaim requests) and the guest claim link card is hidden.
  - The bottom bar shows `"You owe $X.XX"` from the signed-in user's split total, or `"You don't owe anything on this receipt"` when they have no share.

## Requirements
- Keep `FinalSplitCard` presentational (no data loading) and outside `src/app/`.
- Reuse `computeFinalSplit` / `findUnclaimedItems` from `src/lib/finalize-split.ts`, `finalizeReceipt` from `src/lib/finalize-receipt.ts`, and `ConfirmCardModal` from `src/components/confirm-card-modal.tsx`; do not re-implement split math or finalize rules in the screen.
- Do not change claiming behavior on draft or submitted receipts.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` (both `test:unit` and `test:ui`) with zero errors.

## Acceptance criteria
1. On a submitted receipt with unclaimed items, the uploader sees a disabled `"Finalize receipt"` button and how many items still need a claim, and other members see the waiting message instead of the button.
2. When every item is claimed, the uploader can press `"Finalize receipt"`, which opens the in-app confirm card; `"Cancel"` closes it without finalizing, and `"Finalize"` calls `finalizeReceipt` with the receipt id.
3. After finalizing, the screen shows the `"Finalized"` badge and each person's items, tax, tip, and total, with tax and tip split by subtotal and the per-person totals adding up to the receipt total.
4. A receipt loaded as `finalized` shows the breakdown to every member, shows `"You owe $X.XX"` for the signed-in user, hides the guest link card, and pressing an item sends no claim request.
5. When finalizing fails (unclaimed items on the server, not the uploader, or a network error), the screen shows the error in a toast and the receipt stays unfinalized and claimable.
