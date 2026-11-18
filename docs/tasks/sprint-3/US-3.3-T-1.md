---
id: US-3.3-T-1
story: US-3.3
sprint: 3
assignee: Daniel Klos
estimate_hours: 4
---

# Build finalize readiness check and tax/tip split calculator

## Description
Serves User Story 3.3 (Finalize and split). This task implements the pure calculation module in `src/lib/finalize-split.ts` that decides whether a receipt can be finalized (every item has at least one claim) and computes each person's final share: their claimed item subtotal plus a share of tax and a share of tip, both split in proportion to each person's subtotal, with shares that add up exactly to the receipt total. Database changes (storing tax/tip and a finalized status), the finalize action, and the receipt screen UI belong to later tasks in this story and are out of scope.

## Specs
- `findUnclaimedItems(items: ClaimableItem[], claims: ItemClaim[]): ClaimableItem[]` in `src/lib/finalize-split.ts` returns the items with no claim, in the order given. Claims on items not in the list are ignored.
- `splitByWeight(totalCents: number, weights: WeightedShare[]): CentsShare[]` splits a whole-cent amount in proportion to each person's weight (their item subtotal in cents) using the largest-remainder method:
  - Each person first gets `floor(totalCents * weight / sumOfWeights)`; the leftover cents go one each to the people with the largest remainders, ties broken by user id order (the same order `splitCents` uses).
  - When every weight is `0`, the amount is split evenly with `splitCents`.
  - Returns one share per person in user id order; shares always add up to exactly `totalCents`.
  - Throws `RangeError` if `totalCents` or any weight is not a whole, non-negative number.
- `computeFinalSplit(input: FinalSplitInput): FinalSplitResult` where `FinalSplitInput` is `{ items: ClaimableItem[]; claims: ItemClaim[]; taxCents: number; tipCents: number }`:
  - Returns `{ status: "unclaimed", items }` (the unclaimed items) when any item has no claim.
  - Returns `{ status: "invalid", message }` when `taxCents` or `tipCents` is not a whole, non-negative number of cents, or when there are no items.
  - Otherwise returns `{ status: "ok", split }` where `split` is `{ subtotalCents, taxCents, tipCents, totalCents, people: PersonShare[] }` and each `PersonShare` is `{ userId, guestName?, itemsCents, taxCents, tipCents, totalCents }`, in user id order.
  - `itemsCents` is the sum of the person's item shares from `getItemShares`; tax and tip are each split separately with `splitByWeight` using `itemsCents` as the weight.
  - `guestName` is copied from the person's guest claims, if any.

## Requirements
- Keep the module pure: no Supabase imports or network access, so it is deterministic and testable without a database.
- Reuse `ClaimableItem`, `ItemClaim`, `CentsShare`, `splitCents`, and `getItemShares` from `src/lib/claims.ts` rather than duplicating item-split math.
- All amounts are integers in cents; never use floating-point division for money in the final shares.
- Guest claimants (keyed with `guestClaimKey`) are treated the same as members.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. `findUnclaimedItems` returns exactly the items that have no claim, and `computeFinalSplit` returns `status: "unclaimed"` listing those items instead of a split while any item is unclaimed.
2. Tax and tip are each split in proportion to each person's item subtotal (e.g. a person with 75% of the subtotal pays 75% of the tax and 75% of the tip, give or take one cent of rounding).
3. Every person's `totalCents` equals `itemsCents + taxCents + tipCents`, and the sum of everyone's `totalCents` equals the receipt's subtotal + tax + tip exactly, including cases where the proportional amounts do not divide evenly.
4. Leftover cents from rounding are assigned deterministically (largest remainder, then user id order), so the same input always produces the same split regardless of claim order, and shared items and guest claimants are included correctly.
5. `computeFinalSplit` returns `status: "invalid"` for negative or non-integer tax/tip or an empty item list, and `splitByWeight` splits evenly when all weights are zero.
