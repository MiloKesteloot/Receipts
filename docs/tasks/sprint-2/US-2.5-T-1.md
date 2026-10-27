---
id: US-2.5-T-1
story: US-2.5
sprint: 2
assignee: Kellar McLaughlin
estimate_hours: 3.5
---

# Create and share guest claim tokens for receipts

## Description
Serves US-2.5 (Create a receipt claiming link for guests). This task covers generating unique guest claim tokens, persisting token state in mock storage and database schema, and providing receipt screen sharing controls ("Share Claim Link" via native share sheet and "Copy Link" fallback with toast notification). Anonymous claiming interaction in the browser (`US-2.5-T-2`) and authenticated group member claiming are out of scope.

## Specs
- Database migration `supabase/migrations/20261027_guest_claim_tokens.sql` adds `receipt_guest_tokens`, `receipt_items`, and `item_claims` tables with RLS and public RPC `get_receipt_by_guest_token(p_token text)`.
- `createGuestClaimToken(receiptId: string): Promise<string>` in `src/lib/guest-claim.ts` generates unique tokens prefixed with `mock-claim-${receiptId}-` in mock mode.
- `createGuestClaimLink(receiptId: string): Promise<string>` formats the token into a reachable web URL (`http://localhost:8081/claim/[token]` in development, `https://receipts.app/claim/[token]` in production).
- `getReceiptByGuestToken(tokenOrUrl: string): Promise<GetGuestReceiptResult>` parses both full URLs and bare tokens, looks up the receipt and items, and returns decorated items or an error object (`INVALID_TOKEN`, `EXPIRED_TOKEN`).
- Receipt screen at `src/app/(home)/receipts/[id].tsx` displays the generated link in a selectable box and contains a "Share Claim Link" button triggering `Share.share` and a "Copy Link" button copying the URL with a confirmation toast.

## Requirements
- Works offline under `USE_MOCK = true` using `mockGuestTokens` in `src/lib/mock.ts`.
- Does not require a Supabase auth session; public RPCs use `SECURITY DEFINER` and grant access to `anon, authenticated`.
- Must not introduce third-party clipboard packages that break Expo Go.
- Must pass `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/eslint/bin/eslint.js .` with zero errors.

## Acceptance criteria
1. Multiple calls to `createGuestClaimLink` for the same receipt return distinct, valid tokens.
2. `getReceiptByGuestToken` accepts either a full URL or a bare token and resolves the matching receipt data.
3. Accessing `getReceiptByGuestToken` with a non-existent token returns an error with code `INVALID_TOKEN`.
4. Accessing `getReceiptByGuestToken` with an empty token string returns an error with code `INVALID_TOKEN`.
5. The receipt screen displays a "Share Claim Link" button that invokes `Share.share` with the formatted claim URL.
6. The receipt screen displays a "Copy Link" button that copies the URL to the clipboard and triggers a success toast.

## Tests
File: `tests/unit/guest-claim.test.ts`
Setup for all: runs using Node test runner with in-memory snapshots of `mockGuestTokens` and `mockItemClaims` restored in `afterEach`.

- Test: `"generating multiple links for the same receipt returns valid and distinct tokens"`
  - Setup: Calls `createGuestClaimLink("r1")` twice.
  - Asserts: Both links contain `/claim/`, tokens are different, and both resolve receipt `"Costco run"`.
  - Covers: Criterion 1.

- Test: `"accepts full URL or bare token when looking up receipt"`
  - Setup: Creates token with `createGuestClaimToken("r1")` and builds full URL.
  - Asserts: Calling `getReceiptByGuestToken` with the bare token and with the full URL both succeed and return matching tokens.
  - Covers: Criterion 2.

- Test: `"accessing with a non-existent token fails gracefully"`
  - Setup: Calls `getReceiptByGuestToken("mock-non-existent-token-xyz")`.
  - Asserts: Returns `{ success: false, error: "INVALID_TOKEN" }`.
  - Covers: Criterion 3.

- Test: `"empty token fails gracefully"`
  - Setup: Calls `getReceiptByGuestToken("")`.
  - Asserts: Returns `{ success: false, error: "INVALID_TOKEN" }`.
  - Covers: Criterion 4.
