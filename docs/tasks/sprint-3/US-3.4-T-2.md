---
id: US-3.4-T-2
story: US-3.4
sprint: 3
assignee: Neko
estimate_hours: 3
---

# Store payments and add mark-paid and confirm RPCs

## Description
Serves User Story 3.4 (Mark paid and confirm). This task adds the database and client support for settling a finalized receipt: a `receipt_payments` table that records each person's payment state, a `mark_share_paid` RPC that lets a member mark their own share paid, and a `respond_to_payment` RPC that lets the uploader confirm a payment or say it wasn't received. It also adds `getPayments`, `markSharePaid`, and `respondToPayment` in `src/lib/payments.ts`, returning the `PaymentRecord` type from `src/lib/settlement.ts` (US-3.4-T-1). The receipt screen UI (`US-3.4-T-3`) is out of scope.

## Specs
- Migration `supabase/migrations/20261118_receipt_payments.sql` (mirrored in `supabase/setup.sql`, safe to run more than once):
  - Adds `public.receipt_payments` with `receipt_id` (references `receipts`, cascade delete), `payer_key text` (a member's user id, or `guest:<trimmed lowercase name>` for a guest, matching `guestClaimKey`), `state` (`'paid'`, `'confirmed'`, or `'not_received'`), `marked_paid_at` and `responded_at` (`timestamptz`, nullable), and `updated_at`, with primary key `(receipt_id, payer_key)`.
  - RLS lets members of the receipt's group select rows. Clients get no insert, update, or delete access; only the RPCs write.
  - Adds `public.mark_share_paid(p_receipt_id text) returns jsonb` (security definer). It locks the receipt row and returns `{ success: false, error, message }` with `error` one of `NOT_SIGNED_IN`, `NOT_FOUND` (missing, invalid id, or caller not in the group), `NOT_FINALIZED`, `IS_UPLOADER`, `NO_SHARE` (caller has no claim on the receipt), or `ALREADY_CONFIRMED`. Otherwise it sets the caller's row to `state = 'paid'`, `marked_paid_at = now()`, `responded_at = null` (marking again while already `paid` changes nothing) and returns `{ success: true, payer_key, state, marked_paid_at, responded_at }`.
  - Adds `public.respond_to_payment(p_receipt_id text, p_payer_key text, p_received boolean) returns jsonb` (security definer). It locks the receipt row and returns an error of `NOT_SIGNED_IN`, `NOT_FOUND`, `NOT_UPLOADER`, `NOT_FINALIZED`, `NO_SHARE` (the payer has no claim on the receipt or is the uploader), `ALREADY_CONFIRMED`, or `NOT_MARKED_PAID` (a member's share that isn't marked `paid`, or "not received" on a guest share that was never marked paid). Otherwise it sets the row to `'confirmed'` (`p_received` true) or `'not_received'` (false or null) with `responded_at = now()` and returns the row the same way as `mark_share_paid`. Guest shares can be confirmed without being marked paid first.
- `src/lib/payments.ts`, each function taking `options?: { client?: PaymentsClient | null }`:
  - `getPayments(receiptId)` selects the receipt's rows and returns `{ status: "ok", payments: PaymentRecord[] }`, skipping rows with an unknown state, or `{ status: "error", message }`.
  - `markSharePaid(receiptId)` and `respondToPayment(receiptId, payerKey, received)` call the RPCs and return `{ status: "ok", payment: PaymentRecord }` or `{ status: "error", error, message }`, using the RPC's error code, `NETWORK_ERROR` for request failures or an unrecognized response, and `NOT_SIGNED_IN` for `42501`.
  - Each returns `NOT_FOUND` without a request when `receiptId` (or `payerKey`) is blank, and an error when no client is configured.

## Requirements
- Keep the RPCs the only way to write payments; enforce every rule (finalized only, own share only, uploader only for responses, confirmed is final) on the server, not just in the client.
- Do not change how receipts, items, or claims behave.
- The client functions must take an injected client so unit tests run without network access, matching `src/lib/finalize-receipt.ts`.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. `markSharePaid` calls `mark_share_paid` with the receipt id and returns the caller's payment record with state `"paid"` when the RPC succeeds.
2. `respondToPayment` calls `respond_to_payment` with the receipt id, payer key, and received flag, and returns the updated record (`"confirmed"` or `"not_received"`).
3. Both functions pass through server errors such as `NOT_FINALIZED`, `NOT_UPLOADER`, and `ALREADY_CONFIRMED`, and handle blank ids, missing clients, `42501`, network errors, and malformed responses without throwing.
4. `getPayments` loads the receipt's payment rows as `PaymentRecord`s, ignoring rows with unknown states, and reports load errors.
5. The migration (and `setup.sql`) creates `receipt_payments` with member-only read access and no client writes, and defines both RPCs with the finalized, uploader, own-share, and already-confirmed checks.
