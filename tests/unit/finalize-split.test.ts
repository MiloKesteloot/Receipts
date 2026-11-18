/// <reference types="node" />
/**
 * User Story 3.3, Task 1: finalize readiness check and tax/tip split.
 * Pure functions only, so no Supabase client is needed.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { guestClaimKey, type ClaimableItem, type ItemClaim } from "@/lib/claims";
import {
  computeFinalSplit,
  findUnclaimedItems,
  splitByWeight,
  type FinalSplit,
  type FinalSplitResult,
} from "@/lib/finalize-split";

/**
 * Builds a claim.
 * @param itemId The claimed item
 * @param userId The claimant's key
 * @param guestName The guest's name, for guest claims
 * @returns The claim
 */
function claim(itemId: string, userId: string, guestName?: string): ItemClaim {
  return guestName === undefined ? { itemId, userId } : { itemId, userId, guestName };
}

/**
 * Asserts the result is ok and returns its split.
 * @param result A computeFinalSplit result
 * @returns The split
 */
function okSplit(result: FinalSplitResult): FinalSplit {
  assert.equal(result.status, "ok", JSON.stringify(result));
  if (result.status !== "ok") throw new Error("unreachable");
  return result.split;
}

/**
 * Asserts each person's total is their parts and everyone adds up to the receipt.
 * @param split The split to check
 */
function assertAddsUp(split: FinalSplit): void {
  for (const p of split.people) {
    assert.equal(p.totalCents, p.itemsCents + p.taxCents + p.tipCents);
  }
  const sum = (pick: (p: FinalSplit["people"][number]) => number) =>
    split.people.reduce((total, p) => total + pick(p), 0);
  assert.equal(sum((p) => p.itemsCents), split.subtotalCents);
  assert.equal(sum((p) => p.taxCents), split.taxCents);
  assert.equal(sum((p) => p.tipCents), split.tipCents);
  assert.equal(sum((p) => p.totalCents), split.totalCents);
  assert.equal(split.totalCents, split.subtotalCents + split.taxCents + split.tipCents);
}

describe("User Story 3.3 Task 1: finalize readiness and tax/tip split", () => {
  test("US-3.3-T-1: findUnclaimedItems returns only items with no claim, in order", () => {
    const items: ClaimableItem[] = [
      { id: "i1", priceCents: 100 },
      { id: "i2", priceCents: 200 },
      { id: "i3", priceCents: 300 },
    ];
    const claims = [claim("i2", "alice"), claim("other-item", "bob")];

    assert.deepEqual(
      findUnclaimedItems(items, claims).map((i) => i.id),
      ["i1", "i3"]
    );
    assert.deepEqual(findUnclaimedItems(items, [...claims, claim("i1", "a"), claim("i3", "b")]), []);
  });

  test("US-3.3-T-1: computeFinalSplit is blocked while any item is unclaimed", () => {
    const items: ClaimableItem[] = [
      { id: "i1", priceCents: 1000 },
      { id: "i2", priceCents: 500 },
    ];
    const result = computeFinalSplit({
      items,
      claims: [claim("i1", "alice")],
      taxCents: 100,
      tipCents: 200,
    });

    assert.deepEqual(result, { status: "unclaimed", items: [{ id: "i2", priceCents: 500 }] });
  });

  test("US-3.3-T-1: tax and tip are split in proportion to each person's subtotal", () => {
    const split = okSplit(
      computeFinalSplit({
        items: [
          { id: "burger", priceCents: 1500 },
          { id: "fries", priceCents: 500 },
        ],
        claims: [claim("burger", "alice"), claim("fries", "bob")],
        taxCents: 200,
        tipCents: 400,
      })
    );

    assert.deepEqual(split, {
      subtotalCents: 2000,
      taxCents: 200,
      tipCents: 400,
      totalCents: 2600,
      people: [
        { userId: "alice", itemsCents: 1500, taxCents: 150, tipCents: 300, totalCents: 1950 },
        { userId: "bob", itemsCents: 500, taxCents: 50, tipCents: 100, totalCents: 650 },
      ],
    });
  });

  test("US-3.3-T-1: shares add up to the receipt total when amounts don't divide evenly", () => {
    const split = okSplit(
      computeFinalSplit({
        items: [
          { id: "a", priceCents: 1001 },
          { id: "b", priceCents: 337 },
          { id: "c", priceCents: 1 },
        ],
        claims: [claim("a", "u1"), claim("a", "u2"), claim("a", "u3"), claim("b", "u2"), claim("c", "u3")],
        taxCents: 117,
        tipCents: 263,
      })
    );
    assertAddsUp(split);
    assert.equal(split.totalCents, 1001 + 337 + 1 + 117 + 263);

    // Deterministic pseudo-random receipts: the totals must always add up.
    let seed = 42;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const users = ["u1", "u2", "u3", "u4", guestClaimKey("Casey")];
    for (let run = 0; run < 200; run += 1) {
      const items = Array.from({ length: 1 + next(6) }, (_, i) => ({
        id: `item-${i}`,
        priceCents: next(5000),
      }));
      const claims = items.flatMap((item) => {
        const count = 1 + next(users.length);
        return users.slice(0, count).map((u) => claim(item.id, u));
      });
      assertAddsUp(
        okSplit(computeFinalSplit({ items, claims, taxCents: next(999), tipCents: next(1999) }))
      );
    }
  });

  test("US-3.3-T-1: leftover cents go to the largest remainder, then lowest user id", () => {
    // 10 cents by weights 1:2 -> 3.33 and 6.67; the extra cent goes to b.
    assert.deepEqual(
      splitByWeight(10, [
        { userId: "a", weight: 1 },
        { userId: "b", weight: 2 },
      ]),
      [
        { userId: "a", cents: 3 },
        { userId: "b", cents: 7 },
      ]
    );
    // Equal remainders: the extra cent goes to the lowest user id.
    assert.deepEqual(
      splitByWeight(100, [
        { userId: "c", weight: 100 },
        { userId: "a", weight: 100 },
        { userId: "b", weight: 100 },
      ]),
      [
        { userId: "a", cents: 34 },
        { userId: "b", cents: 33 },
        { userId: "c", cents: 33 },
      ]
    );
  });

  test("US-3.3-T-1: claim order doesn't change the split, and guests and shared items are included", () => {
    const casey = guestClaimKey("Casey");
    const items: ClaimableItem[] = [
      { id: "pizza", priceCents: 1000 },
      { id: "soda", priceCents: 200 },
    ];
    const claims = [
      claim("pizza", "alice"),
      claim("pizza", "bob"),
      claim("pizza", casey, "Casey"),
      claim("soda", casey, "Casey"),
    ];
    const input = { items, taxCents: 123, tipCents: 0 };

    const split = okSplit(computeFinalSplit({ ...input, claims }));
    const reversed = okSplit(computeFinalSplit({ ...input, claims: [...claims].reverse() }));
    assert.deepEqual(reversed, split);
    assertAddsUp(split);

    // Pizza 1000 / 3 = 334 + 333 + 333, leftover cent to the lowest id ("alice").
    assert.deepEqual(
      split.people.map((p) => [p.userId, p.itemsCents, p.guestName]),
      [
        ["alice", 334, undefined],
        ["bob", 333, undefined],
        [casey, 533, "Casey"],
      ]
    );
  });

  test("US-3.3-T-1: invalid tax, tip, or empty item lists are rejected", () => {
    const items: ClaimableItem[] = [{ id: "i1", priceCents: 100 }];
    const claims = [claim("i1", "alice")];

    for (const [taxCents, tipCents] of [[-1, 0], [0, -5], [1.5, 0], [0, Number.NaN]]) {
      assert.equal(computeFinalSplit({ items, claims, taxCents, tipCents }).status, "invalid");
    }
    assert.equal(
      computeFinalSplit({ items: [], claims: [], taxCents: 0, tipCents: 0 }).status,
      "invalid"
    );
    assert.throws(() => splitByWeight(-1, [{ userId: "a", weight: 1 }]), RangeError);
    assert.throws(() => splitByWeight(10, [{ userId: "a", weight: 0.5 }]), RangeError);
  });

  test("US-3.3-T-1: splitByWeight splits evenly when every weight is zero", () => {
    assert.deepEqual(
      splitByWeight(101, [
        { userId: "b", weight: 0 },
        { userId: "a", weight: 0 },
      ]),
      [
        { userId: "a", cents: 51 },
        { userId: "b", cents: 50 },
      ]
    );

    // Free items with a tip: still splits, still adds up.
    const split = okSplit(
      computeFinalSplit({
        items: [{ id: "free", priceCents: 0 }],
        claims: [claim("free", "a"), claim("free", "b")],
        taxCents: 0,
        tipCents: 101,
      })
    );
    assertAddsUp(split);
  });
});
