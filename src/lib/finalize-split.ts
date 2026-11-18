/**
 * User Story 3.3 (Finalize and split), Task 1: checking that a receipt can be
 * finalized, and working out what everyone owes once it is.
 *
 * A receipt can be finalized only when every item has at least one claim.
 * Each person then pays their share of the items they claimed (split with
 * `getItemShares`, as on the receipt screen) plus a share of the tax and a
 * share of the tip. Tax and tip are each split in proportion to each person's
 * item subtotal, so whoever ordered more pays more of both.
 *
 * Everything is whole cents. Rounding leftovers are handed out with the
 * largest-remainder method, so the shares always add up exactly to the
 * receipt total.
 *
 * Pure functions only: no Supabase, so this works the same in tests.
 */

import {
  getItemShares,
  splitCents,
  type CentsShare,
  type ClaimableItem,
  type ItemClaim,
} from "@/lib/claims";

/** One person and how much weight they carry in a proportional split. */
export type WeightedShare = {
  userId: string;
  /** Their item subtotal in whole cents. */
  weight: number;
};

/** What one person owes on a finalized receipt. */
export type PersonShare = {
  /** A member's user id, or `guestClaimKey(name)` for a guest. */
  userId: string;
  /** Set only for guests: the name they claimed under. */
  guestName?: string;
  /** Their share of the items they claimed. */
  itemsCents: number;
  /** Their share of the tax. */
  taxCents: number;
  /** Their share of the tip. */
  tipCents: number;
  /** `itemsCents + taxCents + tipCents`. */
  totalCents: number;
};

/** The whole receipt's split, once every item is claimed. */
export type FinalSplit = {
  /** Sum of every item's price. */
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  /** `subtotalCents + taxCents + tipCents`; equals the sum of everyone's total. */
  totalCents: number;
  /** One entry per person who claimed something, in user id order. */
  people: PersonShare[];
};

export type FinalSplitInput = {
  items: ClaimableItem[];
  /** Everyone's claims on the receipt. Claims on other items are ignored. */
  claims: ItemClaim[];
  taxCents: number;
  tipCents: number;
};

export type FinalSplitResult =
  | { status: "ok"; split: FinalSplit }
  /** Finalizing is blocked: these items still need a claim. */
  | { status: "unclaimed"; items: ClaimableItem[] }
  | { status: "invalid"; message: string };

/**
 * Whether a value is a whole, non-negative number of cents.
 * @param value The value to check
 * @returns True if it can be used as an amount in cents
 */
function isWholeCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Finds the items nobody has claimed yet.
 * @param items The receipt's items
 * @param claims Claims to look through. Claims on other items are ignored.
 * @returns The unclaimed items, in the order given
 */
export function findUnclaimedItems(
  items: ClaimableItem[],
  claims: ItemClaim[]
): ClaimableItem[] {
  const claimedIds = new Set(claims.map((claim) => claim.itemId));
  return items.filter((item) => !claimedIds.has(item.id));
}

/**
 * Splits an amount in proportion to each person's weight, in whole cents, so
 * the shares add up to exactly the amount. Each person first gets the
 * rounded-down share; the leftover cents go one each to the people whose
 * share was rounded down the most, ties going to the lowest user id.
 * If every weight is zero, the amount is split evenly instead.
 * @param totalCents The amount to split
 * @param weights Each person's weight. Repeated user ids are combined.
 * @returns One share per person, in user id order
 * @throws {RangeError} If the amount or a weight isn't whole, non-negative
 *   cents, or the amounts are too large to split exactly
 */
export function splitByWeight(
  totalCents: number,
  weights: WeightedShare[]
): CentsShare[] {
  if (!isWholeCents(totalCents)) {
    throw new RangeError(`Invalid amount in cents: ${totalCents}`);
  }

  const weightByUser = new Map<string, number>();
  for (const { userId, weight } of weights) {
    if (!isWholeCents(weight)) {
      throw new RangeError(`Invalid weight for ${userId}: ${weight}`);
    }
    weightByUser.set(userId, (weightByUser.get(userId) ?? 0) + weight);
  }

  // The default sort compares character codes, matching `splitCents`.
  const people = [...weightByUser.keys()].sort();
  if (people.length === 0) return [];

  const weightSum = people.reduce((sum, id) => sum + (weightByUser.get(id) ?? 0), 0);
  if (weightSum === 0) return splitCents(totalCents, people);

  const parts = people.map((userId) => {
    const scaled = totalCents * (weightByUser.get(userId) ?? 0);
    if (!Number.isSafeInteger(scaled)) {
      throw new RangeError(`Amount too large to split exactly: ${totalCents}`);
    }
    return {
      userId,
      cents: Math.floor(scaled / weightSum),
      remainder: scaled % weightSum,
    };
  });

  let leftoverCents =
    totalCents - parts.reduce((sum, part) => sum + part.cents, 0);
  // `parts` is already in user id order and sort is stable, so ties keep it.
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder);
  for (const part of byRemainder) {
    if (leftoverCents === 0) break;
    part.cents += 1;
    leftoverCents -= 1;
  }

  return parts.map(({ userId, cents }) => ({ userId, cents }));
}

/**
 * Works out what everyone owes on a receipt: their items plus a share of tax
 * and tip in proportion to their item subtotal. Blocked while any item is
 * unclaimed.
 * @param input The receipt's items, claims, tax and tip
 * @returns The split, the unclaimed items, or why the input is invalid
 */
export function computeFinalSplit(input: FinalSplitInput): FinalSplitResult {
  const { items, claims, taxCents, tipCents } = input;

  if (!isWholeCents(taxCents)) {
    return { status: "invalid", message: "Tax must be a whole, non-negative number of cents." };
  }
  if (!isWholeCents(tipCents)) {
    return { status: "invalid", message: "Tip must be a whole, non-negative number of cents." };
  }
  if (items.length === 0) {
    return { status: "invalid", message: "The receipt has no items to split." };
  }

  const unclaimed = findUnclaimedItems(items, claims);
  if (unclaimed.length > 0) return { status: "unclaimed", items: unclaimed };

  const itemsCentsByUser = new Map<string, number>();
  let subtotalCents = 0;
  for (const item of items) {
    subtotalCents += item.priceCents;
    for (const share of getItemShares(item, claims).shares) {
      itemsCentsByUser.set(
        share.userId,
        (itemsCentsByUser.get(share.userId) ?? 0) + share.cents
      );
    }
  }

  const guestNames = new Map<string, string>();
  for (const claim of claims) {
    if (claim.guestName && !guestNames.has(claim.userId)) {
      guestNames.set(claim.userId, claim.guestName);
    }
  }

  const weights = [...itemsCentsByUser].map(([userId, weight]) => ({ userId, weight }));
  const taxByUser = new Map(
    splitByWeight(taxCents, weights).map((s) => [s.userId, s.cents])
  );
  const tipByUser = new Map(
    splitByWeight(tipCents, weights).map((s) => [s.userId, s.cents])
  );

  const people = [...itemsCentsByUser.keys()].sort().map((userId): PersonShare => {
    const itemsCents = itemsCentsByUser.get(userId) ?? 0;
    const personTax = taxByUser.get(userId) ?? 0;
    const personTip = tipByUser.get(userId) ?? 0;
    const guestName = guestNames.get(userId);
    return {
      userId,
      ...(guestName !== undefined && { guestName }),
      itemsCents,
      taxCents: personTax,
      tipCents: personTip,
      totalCents: itemsCents + personTax + personTip,
    };
  });

  return {
    status: "ok",
    split: {
      subtotalCents,
      taxCents,
      tipCents,
      totalCents: subtotalCents + taxCents + tipCents,
      people,
    },
  };
}
