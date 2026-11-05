---
id: US-2.5-T-2
story: US-2.5
sprint: 2
assignee: Kellar McLaughlin
estimate_hours: 3.5
---

# Claim receipt items anonymously via web link with real-time split calculation

## Description
Serves US-2.5 (Create a receipt claiming link for guests). This task covers the public web claiming screen at `src/app/claim/[token].tsx`, guest name onboarding modal with local storage persistence, interactive item claim/unclaim toggling, real-time split calculations dividing cents evenly across claimants without overwriting member claims, and a sticky personal running total bar. Link generation and receipt share buttons (`US-2.5-T-1`) are out of scope.

## Specs
- Screen at `src/app/claim/[token].tsx` accessible via web browser without login session.
- Root layout at `src/app/_layout.tsx` detects the `/claim` route segment and renders directly via `<Slot />` without mounting the app's native tab bar.
- First-time visitors without a stored display name are presented with a welcome modal prompt; valid names are saved in browser `localStorage` (`receipts_guest_name`).
- `claimItemAsGuest(tokenOrUrl: string, itemId: string, guestName: string, claimed: boolean)` in `src/lib/guest-claim.ts` inserts or deletes guest claims. Empty names return `{ success: false, error: "EMPTY_NAME" }`. Non-existent items return `{ success: false, error: "ITEM_NOT_FOUND" }`.
- `calculateGuestTotalCents(items: ReceiptItemWithClaims[], guestName: string): number` computes the guest's share across claimed items, calculating `Math.round(amount_cents / claims.length)`.
- Line items indicate whether an item is shared (`is_shared === true`), display claimant chips (distinguishing members from guests), and display individual split prices.
- Invalid or expired tokens display an error card informing the guest that the link is no longer valid.

## Requirements
- Works without Supabase auth sessions; anonymous guests must never be redirected to a login screen.
- Persists guest claims alongside registered user claims in `mockItemClaims` (`src/lib/mock.ts`) without overwriting or deleting member claims.
- Responsive layout constrained to readable desktop widths (`maxWidth: 640`).
- Must pass `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/eslint/bin/eslint.js .` with zero errors.

## Acceptance criteria
1. Empty or whitespace-only guest names are rejected before claiming with error code `EMPTY_NAME`.
2. Claiming a non-existent item ID fails with error code `ITEM_NOT_FOUND`.
3. Guest claims properly record the guest's name and do not overwrite or delete registered member claims.
4. An item claimed by both a guest and a registered user is marked as shared and divides cents accurately among all claimants.
5. A guest can unclaim an item, removing their claim while leaving member claims intact.
6. Personal running total recalculates accurately across multiple claimed items.
7. Accessing with an expired token fails gracefully with error code `EXPIRED_TOKEN` and rejects claim attempts.

## Tests
File: `tests/unit/guest-claim.test.ts`
Setup for all: runs using Node test runner with in-memory snapshots of `mockGuestTokens` and `mockItemClaims` restored in `afterEach`.

- Test: `"empty guest names are rejected before claiming"`
  - Setup: Calls `claimItemAsGuest` with empty string `""` and whitespace `"   "`.
  - Asserts: Both return `{ success: false, error: "EMPTY_NAME" }` and no claim is added.
  - Covers: Criterion 1.

- Test: `"claiming a non-existent item fails with ITEM_NOT_FOUND"`
  - Setup: Calls `claimItemAsGuest` with item ID `"fake-item-id-999"`.
  - Asserts: Returns `{ success: false, error: "ITEM_NOT_FOUND" }`.
  - Covers: Criterion 2.

- Test: `"guest claims properly record the guest's name and don't overwrite registered member claims"`
  - Setup: Guest `"Casey"` claims `item-r1-1` (originally claimed by member Alex `u1`).
  - Asserts: Item has 2 claims; Alex's claim remains intact (`user_id === "u1"`, `is_guest === false`); Casey's claim is added (`is_guest === true`).
  - Covers: Criterion 3.

- Test: `"an item claimed by both a guest and a registered user shows as shared and divides cents accurately"`
  - Setup: Guest `"Morgan"` claims `item-r1-1` (2499 cents, already claimed by Alex).
  - Asserts: `item.is_shared === true`, `item.per_person_cents === 1250` (Math.round(2499/2)), and guest running total equals 1250.
  - Covers: Criterion 4.

- Test: `"allows a guest to unclaim an item without affecting member claims"`
  - Setup: Guest claims and subsequently unclaims with `claim = false`.
  - Asserts: Guest claim is removed, item claims count drops back to 1, and Alex's claim remains.
  - Covers: Criterion 5.

- Test: `"calculates accurate running total across multiple claimed items"`
  - Setup: Guest `"Avery"` claims a shared item (1250 cents), a second shared item (250 cents), and an unshared item (999 cents).
  - Asserts: Running total equals 2499 cents ($24.99).
  - Covers: Criterion 6.

- Test: `"accessing with an expired token fails gracefully"`
  - Setup: Injects an expired token with past `expires_at` timestamp and calls `getReceiptByGuestToken` and `claimItemAsGuest`.
  - Asserts: Both return `{ success: false, error: "EXPIRED_TOKEN" }`.
  - Covers: Criterion 7.
