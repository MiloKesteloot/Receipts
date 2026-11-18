---
id: US-2.3-T-7
story: US-2.3
sprint: 3
assignee: Alex Kirkman
estimate_hours: 4
---

# Wire item claiming into the receipt screen and restrict claims to group members

## Description
Serves User Story 2.3 (Claim items, including shared ones): "As a roommate, I want to tap the items I bought, so that I only pay for my share." The claims service (`src/lib/claims.ts`) and the `useClaims` hook (`src/lib/use-claims.ts`) were built and tested in Sprint 2, but no screen used them: the receipt screen showed claims read-only and split shared items with `Math.round`, so shares did not always add up to the item price. This task connects `useClaims` to the receipt screen (`src/app/(app)/(home)/receipts/[id].tsx`) so members can tap to claim and unclaim, see shared items with exact per-person amounts, and see a running total. It also adds a migration (`supabase/migrations/20261111_item_claims_member_only.sql`, mirrored in `supabase/setup.sql`) so only members of a receipt's group can claim or unclaim its items. The guest claim web page (`src/app/claim/[token].tsx`, US-2.5) and settling or finalizing receipts are out of scope.

## Specs
- Signed-in members load the receipt directly (`receipts` row including `group_id`, then `receipt_items`, then `get_group` for member names) instead of through the guest token, so the screen knows the group that `useClaims` needs. The guest token is still created for the share card. A user who can't read the receipt gets "Receipt not found."
- Receipt items are mapped to `ClaimableItem` with `toClaimableItems` / `toWholeCents`; rows with an invalid price are shown but can't be claimed.
- `useClaims(items, groupId, userId)` accepts `groupId` and `userId` as `undefined`: nothing loads and `toggle` does nothing until both are known. After a failed claim or unclaim is rolled back, it reloads claims from the server.
- `getClaims` returns guest claims as well, keyed with `guestClaimKey(name)` (`guest:<trimmed lowercase name>`), so `splitCents`, `getItemShares` and `getMyTotal` treat guests like any other sharer. A member can only toggle their own claim, never a guest's.
- Each item row is a pressable button (`accessibilityRole="button"`, `accessibilityState={{ selected, busy }}`, label "Claim <name>" / "Unclaim <name>") that calls `toggle(item.id)`:
  - The user's items are highlighted with a filled checkbox and a "✓ Mine" pill.
  - Shared items (2+ claimers) show a "Shared" tag and each person's exact share from `getItemShares`; guests show as "<name> (Guest)". A single claimer shows their name; unclaimed rows show "Tap to claim".
- A total bar at the bottom shows "Your total $X.XX · N items" from `getMyTotal`, or "Tap items you bought to claim them" when the user has claimed nothing. It updates immediately with each optimistic change.
- Claim failures show the existing `Toast` with the hook's error ("You're not a member of this group." for a 42501 refusal).
- Migration `20261111_item_claims_member_only.sql` replaces two `item_claims` policies inside one transaction:
  - "Users insert own claim" requires `user_id = auth.uid()`, `guest_name is null`, a `receipt_id` matching the item's receipt when one is sent, and membership in the group that owns the item's receipt (joined from `item_id` through `receipt_items` and `receipts` to `is_group_member`).
  - "Users delete own claim" requires `user_id = auth.uid()` and the same group membership.

## Requirements
- Shared amounts must come from `splitCents` (via `useClaims`), never from floating-point division, so every item's shares add up to exactly its price.
- The app keeps writing claims directly to `item_claims` and relies on RLS, so it works whether or not the migration has been applied; duplicate claims (`23505`) and unclaiming something not claimed are treated as success.
- Guest claims made through `claim_item_as_guest` (security definer) are not affected by the new policies.
- The guest share-link card on the receipt screen keeps working as before.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. Tapping an unclaimed item claims it for the current user right away (highlighted with "✓ Mine"), and tapping it again unclaims it.
2. A fast double tap on an item sends only one request, and claiming an item twice never creates a second claim.
3. If a claim or unclaim request fails, the change is rolled back, an error toast is shown, and claims are reloaded from the server.
4. An item claimed by two or more people (members or guests) shows a "Shared" tag, who claimed it, and each person's exact share; for example, a $10.00 item split 3 ways shows $3.34 / $3.33 / $3.33 and a $0.01 item split 2 ways does not lose the cent.
5. The total bar shows the user's number of claimed items and a total equal to the sum of their shares, and updates immediately on claim and unclaim.
6. A signed-in user who is not a member of the receipt's group cannot claim or unclaim its items: the server refuses the insert, and the screen rolls back with "You're not a member of this group."
