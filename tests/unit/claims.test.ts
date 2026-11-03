/// <reference types="node" />
/**
 * User Story 2.3, Task 2: claiming items and splitting prices in cents.
 * Tests the real `src/lib/claims.ts`.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/claims.test.ts
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. These tests run against the mock only. They prove the app-side rules, not
 *    that the database enforces them. Add database checks with Task 1.
 * 2. Claims go in the shared `mockItemClaims`, so `afterEach` empties it and
 *    tests pass in any order. Remove that with the mock.
 * ==========================================================================
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  claimItem,
  type CentsShare,
  getClaims,
  splitCents,
  unclaimItem,
} from "@/lib/claims";
import { mockItemClaims } from "@/lib/mock";

/**
 * Apartment 402, whose members are u1, u2 and u3.
 */
const GROUP_ID = "mock-1";

/**
 * Item used for claiming.
 */
const ITEM_ID = "item-1";

/**
 * Options for acting as member u1 in mock mode.
 */
const AS_U1 = { useMock: true, mockUserId: "u1" };

/**
 * Options for acting as member u2 in mock mode.
 */
const AS_U2 = { useMock: true, mockUserId: "u2" };

/**
 * Options for someone who isn't in the group.
 */
const AS_STRANGER = { useMock: true, mockUserId: "not-a-member" };

/**
 * Adds up a split's shares.
 * @param shares The shares from `splitCents`
 * @returns The total in cents
 */
function sumOf(shares: CentsShare[]): number {
  return shares.reduce((sum, share) => sum + share.cents, 0);
}

/**
 * Lists who has claimed the test item.
 * @returns The user ids, as stored
 */
async function claimantsOfItem(): Promise<string[]> {
  const result = await getClaims(GROUP_ID, [ITEM_ID], AS_U1);
  assert.equal(result.status, "ok");
  return result.status === "ok" ? result.claims.map((c) => c.userId) : [];
}

// PLACEHOLDER #2: undo whatever the test added to the shared mock data.
afterEach(() => {
  mockItemClaims.length = 0;
});

describe("US 2.3: splitCents", () => {
  test("$10.00 split 3 ways sums to exactly $10.00", () => {
    const shares = splitCents(1000, ["u1", "u2", "u3"]);
    assert.deepEqual(
      shares.map((share) => share.cents),
      [334, 333, 333]
    );
    assert.equal(sumOf(shares), 1000);
  });

  test("$0.01 split 2 ways doesn't lose the cent", () => {
    const shares = splitCents(1, ["u1", "u2"]);
    assert.deepEqual(
      shares.map((share) => share.cents),
      [1, 0]
    );
    assert.equal(sumOf(shares), 1);
  });

  test("shares always sum to the exact price and differ by at most a cent", () => {
    const people = ["a", "b", "c", "d", "e", "f", "g"];
    for (let cents = 0; cents <= 500; cents++) {
      for (let count = 1; count <= people.length; count++) {
        const shares = splitCents(cents, people.slice(0, count));
        const amounts = shares.map((share) => share.cents);
        assert.equal(sumOf(shares), cents);
        assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1);
      }
    }
  });

  test("the result doesn't depend on the order people claimed in", () => {
    assert.deepEqual(
      splitCents(1000, ["u3", "u1", "u2"]),
      splitCents(1000, ["u1", "u2", "u3"])
    );
  });

  test("an evenly divisible price has no leftover", () => {
    assert.deepEqual(splitCents(1000, ["u2", "u1"]), [
      { userId: "u1", cents: 500 },
      { userId: "u2", cents: 500 },
    ]);
  });

  test("one person pays the whole price", () => {
    assert.deepEqual(splitCents(999, ["u1"]), [{ userId: "u1", cents: 999 }]);
  });

  test("a repeated person only gets one share", () => {
    assert.deepEqual(splitCents(100, ["u1", "u1"]), [
      { userId: "u1", cents: 100 },
    ]);
  });

  test("no people means no shares", () => {
    assert.deepEqual(splitCents(1000, []), []);
  });

  test("prices that aren't whole, non-negative cents are rejected", () => {
    assert.throws(() => splitCents(10.5, ["u1"]), RangeError);
    assert.throws(() => splitCents(-1, ["u1"]), RangeError);
    assert.throws(() => splitCents(Number.NaN, ["u1"]), RangeError);
  });
});

describe("US 2.3: claiming items (mock)", () => {
  test("claiming then unclaiming adds and removes the claim", async () => {
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, AS_U1), { status: "ok" });
    assert.deepEqual(await claimantsOfItem(), ["u1"]);

    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, AS_U1), { status: "ok" });
    assert.deepEqual(await claimantsOfItem(), []);
  });

  test("two people can claim the same item", async () => {
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);
    await claimItem(GROUP_ID, ITEM_ID, AS_U2);
    assert.deepEqual(await claimantsOfItem(), ["u1", "u2"]);
  });

  test("unclaiming only removes your own claim", async () => {
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);
    await claimItem(GROUP_ID, ITEM_ID, AS_U2);
    await unclaimItem(GROUP_ID, ITEM_ID, AS_U1);
    assert.deepEqual(await claimantsOfItem(), ["u2"]);
  });

  test("claiming twice doesn't add a second claim", async () => {
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, AS_U1), { status: "ok" });
    assert.deepEqual(await claimantsOfItem(), ["u1"]);
  });

  test("unclaiming an unclaimed item is not an error", async () => {
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, AS_U1), { status: "ok" });
    assert.deepEqual(await claimantsOfItem(), []);
  });

  test("getClaims only returns the requested items", async () => {
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);
    await claimItem(GROUP_ID, "other-item", AS_U1);
    assert.deepEqual(await getClaims(GROUP_ID, ["other-item"], AS_U1), {
      status: "ok",
      claims: [{ itemId: "other-item", userId: "u1" }],
    });
  });

  test("non-members can't claim, unclaim or read claims", async () => {
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);

    const forbidden = { status: "forbidden" };
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, AS_STRANGER), forbidden);
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, AS_STRANGER), forbidden);
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], AS_STRANGER), forbidden);
    assert.deepEqual(await claimantsOfItem(), ["u1"]);
  });

  test("an unknown group behaves like not being a member", async () => {
    assert.deepEqual(await claimItem("no-such-group", ITEM_ID, AS_U1), {
      status: "forbidden",
    });
  });
});

describe("US 2.3: real paths aren't written yet (PLACEHOLDER)", () => {
  test("they return an error and don't touch the mock data", async () => {
    const real = { useMock: false };
    const error = {
      status: "error",
      message: "Claims on the server are not set up yet.",
    };

    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, real), error);
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, real), error);
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], real), error);
    assert.equal(mockItemClaims.length, 0);
  });
});
