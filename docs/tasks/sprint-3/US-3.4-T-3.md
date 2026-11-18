---
id: US-3.4-T-3
story: US-3.4
sprint: 3
assignee: Neko
estimate_hours: 4
---

# Add Mark as paid, Confirm, and Settled status to the receipt screen

## Description
Serves User Story 3.4 (Mark paid and confirm). This task wires payments into the receipt screen (`src/app/(app)/(home)/receipts/[id].tsx`) for finalized receipts: a new `PaymentsCard` component (`src/components/payments-card.tsx`) lists where each person's share stands, a member can tap Mark as paid on their own share, the uploader can tap Confirm or Not received on a share marked paid (or Confirm a guest's share directly), and the receipt shows Settled once every share is confirmed. Payment loading and actions live in a `usePayments` hook (`src/lib/use-payments.ts`). The settlement math (`US-3.4-T-1`) and the database/RPC support (`US-3.4-T-2`) are out of scope.

## Specs
- `usePayments(receiptId: string | undefined, enabled: boolean)` in `src/lib/use-payments.ts` loads the receipt's payments with `getPayments` while `enabled` (the receipt is finalized) and returns `{ payments, loading, error, busyKey, reload, markPaid, respond }`:
  - `markPaid()` calls `markSharePaid(receiptId)`; `respond(payerKey, received)` calls `respondToPayment(receiptId, payerKey, received)`. Both return the action result, set `busyKey` to the share being changed until the request finishes, and on success replace that payer's record in `payments`. On `ALREADY_CONFIRMED` they reload the payments.
  - A load failure sets `error` and leaves `payments` empty, so every share shows as unpaid.
- `PaymentsCard` (presentational) takes the `Settlement` from `computeSettlement`, the viewer, a `nameFor` function, `busyKey`, and `onMarkPaid` / `onConfirm(payerKey)` / `onNotReceived(payerKey)` callbacks:
  - Title `"Payments"`, and `"Everyone has paid. This receipt is settled."` when settled, otherwise `"1 share left to settle ($X.XX)"` / `"N shares left to settle ($X.XX)"`.
  - One row per person with their name, amount, and status: `"Paid the bill"` (uploader), `"Nothing to pay"`, `"Not paid yet"`, `"Marked paid, waiting for confirmation"`, `"Not received"`, or `"Confirmed"`.
  - Buttons from `shareActions`: `"Mark as paid"`, `"Confirm"`, and `"Not received"`. While a row's action is in flight, its buttons are disabled and show a spinner.
- On a finalized receipt the screen shows `PaymentsCard` below the final split:
  - `"Mark as paid"` opens `ConfirmCardModal` titled `"Mark as paid?"` (confirm label `"Mark as paid"`); confirming calls `markSharePaid` and shows a `"Marked as paid."` toast.
  - `"Confirm"` opens `ConfirmCardModal` titled `"Confirm payment?"` (confirm label `"Confirm"`); confirming calls `respondToPayment(receiptId, payerKey, true)` and shows `"Payment confirmed."`, or `"Receipt settled!"` when that was the last outstanding share.
  - `"Not received"` calls `respondToPayment(receiptId, payerKey, false)` straight away and shows `"Marked as not received."`.
  - Failed actions show the error message in an error toast and leave the share as it was.
  - The header badge reads `"Settled"` instead of `"Finalized"` once settled.
  - The bottom bar shows, for a member, `"You owe $X.XX"` (unpaid), `"You marked $X.XX as paid"`, `"<uploader> didn't receive your $X.XX"`, or `"Your $X.XX payment was confirmed"`; for the uploader, `"You're owed $X.XX"` while shares are outstanding or `"Everyone has paid you back"` once settled. A member with no share still sees `"You don't owe anything on this receipt"`.
  - Pulling down on a finalized receipt reloads the payments.

## Requirements
- Keep `PaymentsCard` presentational (no data loading) and outside `src/app/`.
- Reuse `computeSettlement` / `shareActions` from `src/lib/settlement.ts`, the payment functions from `src/lib/payments.ts`, and `ConfirmCardModal`; do not re-implement settlement rules in the screen.
- Do not change how submitted or draft receipts behave, or how finalizing works.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` (both `test:unit` and `test:ui`) with zero errors.

## Acceptance criteria
1. On a finalized receipt, a member with an unpaid share sees `"Mark as paid"` on their row; confirming in the in-app card calls `markSharePaid` with the receipt id and their row then shows `"Marked paid, waiting for confirmation"`, while `"Cancel"` does nothing.
2. The uploader sees `"Confirm"` and `"Not received"` on a share marked paid; `"Confirm"` (after the confirm card) calls `respondToPayment(id, payerKey, true)` and `"Not received"` calls `respondToPayment(id, payerKey, false)`, and the row updates to `"Confirmed"` or `"Not received"`.
3. A member whose payment was reported not received can tap `"Mark as paid"` again, and other members see no payment buttons on shares that aren't theirs.
4. Once every share other than the uploader's is confirmed, the header shows `"Settled"`, the card says the receipt is settled, and no payment buttons are shown.
5. A failed payment action shows the error in a toast and the share keeps its previous status, and a receipt whose payments fail to load still shows every share as unpaid.
