---
id: US-3.3-T-2
story: US-3.3
sprint: 3
assignee: Daniel Klos
estimate_hours: 4
---

# Store tax and tip, add finalize_receipt RPC, and lock finalized receipts

## Description
Serves User Story 3.3 (Finalize and split). This task adds the database and client support for finalizing a receipt: submitted receipts now store their tax and tip, a `finalize_receipt` RPC lets only the uploader finalize a receipt once every item is claimed, and claims and items can no longer change after a receipt is finalized. It also adds `finalizeReceipt` in `src/lib/finalize-receipt.ts` and makes Home overview count finalized receipts. The split math (`US-3.3-T-1`) and the Finalize button and per-person breakdown on the receipt screen (`US-3.3-T-3`) are out of scope.

## Specs
- Migration `supabase/migrations/20261117_finalize_receipt.sql` (mirrored in `supabase/setup.sql`, safe to run more than once):
  - Adds `receipts.tax_cents` and `receipts.tip_cents` (`bigint not null default 0`, `>= 0`) and `receipts.finalized_at` (`timestamptz`, nullable).
  - Allows `receipts.status` to be `'draft'`, `'submitted'`, or `'finalized'`.
  - Adds `public.finalize_receipt(p_receipt_id text) returns jsonb` (security definer). It locks the receipt row and returns `{ success: false, error, message }` with `error` one of `NOT_SIGNED_IN`, `NOT_FOUND` (missing, invalid id, or caller not in the group), `NOT_UPLOADER`, `NOT_SUBMITTED`, `ALREADY_FINALIZED`, `NO_ITEMS`, or `UNCLAIMED_ITEMS` (with `unclaimed_count`); otherwise sets `status = 'finalized'` and `finalized_at = now()` and returns `{ success: true, receipt_id, finalized_at }`.
  - Adds a `before insert or delete` trigger on `item_claims` that locks the claim's receipt row and raises error `42501` ("This receipt is finalized, so claims can't change.") when the receipt is finalized. It covers member claims and guest claims (`claim_item_as_guest`) and skips cascaded deletes (e.g. deleting a group).
  - Updates RLS so `receipts` rows with `status = 'finalized'` cannot be updated by clients, clients cannot set `status = 'finalized'` directly, and `receipt_items` on a finalized receipt cannot be inserted, updated, or deleted.
- `saveReceipt` in `src/lib/receipts.ts` writes `tax_cents` and `tip_cents` from `computeTotals(draft)` on both insert and update.
- `finalizeReceipt(receiptId: string, options?: { client?: FinalizeClient | null }): Promise<FinalizeReceiptResult>` in `src/lib/finalize-receipt.ts` calls the RPC and returns:
  - `{ status: "ok", finalizedAt }` on success.
  - `{ status: "unclaimed", unclaimedCount }` for `UNCLAIMED_ITEMS`.
  - `{ status: "error", error, message }` for every other failure, using the RPC's `error` code, `NETWORK_ERROR` for request failures or an unrecognized response, and `NOT_SIGNED_IN` for `42501`.
  - Returns `NOT_FOUND` without calling the RPC when `receiptId` is blank, and `NETWORK_ERROR` when no client is configured.
- `src/lib/home-overview.ts` treats `finalized` receipts the same as `submitted` receipts for latest-receipt cards and balances.

## Requirements
- Keep the RPC as the only way to finalize a receipt; enforce every rule (uploader only, all items claimed, submitted only) on the server, not just in the client.
- Do not change how claims, items, or receipts behave for draft or submitted receipts.
- `finalizeReceipt` must take an injected client so unit tests run without network access, matching the pattern in `src/lib/groups.ts`.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. Submitting or updating a receipt with `saveReceipt` saves `tax_cents` and `tip_cents` alongside `total_cents`.
2. `finalizeReceipt` calls `finalize_receipt` with the receipt id and returns `{ status: "ok", finalizedAt }` when the RPC succeeds.
3. `finalizeReceipt` returns `{ status: "unclaimed", unclaimedCount }` when items are unclaimed, passes through server errors such as `NOT_UPLOADER` and `ALREADY_FINALIZED`, and handles blank ids, missing clients, `42501`, network errors, and malformed responses without throwing.
4. The migration defines `finalize_receipt` with the uploader, submitted-status, no-items, and unclaimed-items checks, a trigger that blocks claim changes on finalized receipts, and RLS that blocks client edits to finalized receipts and their items.
5. Home overview includes `finalized` receipts in latest-receipt cards and in "Owed to me" / "I owe" balances, while still ignoring drafts.
