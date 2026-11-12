/// <reference types="node" />
/**
 * User Story 2.3, Task 2: claiming items and splitting prices in cents.
 * Tests the real `src/lib/claims.ts`.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/claims.test.ts
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. These tests use the mock and a fake Supabase client. They prove the
 *    app-side rules, not that the database enforces them; the RLS policies in
 *    the item_claims_member_only migration are checked by hand (see its PR).
 * 2. Claims go in the shared `mockItemClaims`, so `afterEach` empties it and
 *    tests pass in any order. Remove that with the mock.
 * ==========================================================================
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  claimItem,
  type CentsShare,
  type ClaimsClient,
  getClaims,
  getItemShares,
  getMyTotal,
  guestClaimKey,
  isGuestClaimKey,
  splitCents,
  toClaimableItems,
  toWholeCents,
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

describe("US 2.3: getItemShares", () => {
  const item = { id: ITEM_ID, priceCents: 1000 };

  test("an unclaimed item isn't shared and has no shares", () => {
    assert.deepEqual(getItemShares(item, []), {
      isShared: false,
      claimedBy: [],
      shares: [],
    });
  });

  test("one claimer isn't shared and pays the whole price", () => {
    assert.deepEqual(
      getItemShares(item, [{ itemId: ITEM_ID, userId: "u1" }]),
      {
        isShared: false,
        claimedBy: ["u1"],
        shares: [{ userId: "u1", cents: 1000 }],
      }
    );
  });

  test("three claimers are shared and split the exact price", () => {
    const claims = [
      { itemId: ITEM_ID, userId: "u3" },
      { itemId: ITEM_ID, userId: "u1" },
      { itemId: ITEM_ID, userId: "u2" },
    ];
    assert.deepEqual(getItemShares(item, claims), {
      isShared: true,
      claimedBy: ["u1", "u2", "u3"],
      shares: [
        { userId: "u1", cents: 334 },
        { userId: "u2", cents: 333 },
        { userId: "u3", cents: 333 },
      ],
    });
  });

  test("claims on other items are ignored", () => {
    const result = getItemShares(item, [
      { itemId: ITEM_ID, userId: "u1" },
      { itemId: "other-item", userId: "u2" },
    ]);
    assert.equal(result.isShared, false);
    assert.deepEqual(result.claimedBy, ["u1"]);
  });

  test("a duplicate claim doesn't make an item shared", () => {
    const result = getItemShares(item, [
      { itemId: ITEM_ID, userId: "u1" },
      { itemId: ITEM_ID, userId: "u1" },
    ]);
    assert.equal(result.isShared, false);
    assert.deepEqual(result.shares, [{ userId: "u1", cents: 1000 }]);
  });
});

describe("US 2.3: getMyTotal", () => {
  const items = [
    { id: "shared-three", priceCents: 1000 },
    { id: "shared-penny", priceCents: 1 },
    { id: "just-u2", priceCents: 250 },
    { id: "just-u3", priceCents: 500 },
    { id: "unclaimed", priceCents: 999 },
  ];
  const claims = [
    { itemId: "shared-three", userId: "u1" },
    { itemId: "shared-three", userId: "u2" },
    { itemId: "shared-three", userId: "u3" },
    { itemId: "shared-penny", userId: "u1" },
    { itemId: "shared-penny", userId: "u2" },
    { itemId: "just-u2", userId: "u2" },
    { itemId: "just-u3", userId: "u3" },
  ];

  test("adds my shares across shared and unshared items", () => {
    assert.deepEqual(getMyTotal(items, claims, "u1"), {
      totalCents: 335, // 334 + 1
      claimedCount: 2,
    });
    assert.deepEqual(getMyTotal(items, claims, "u3"), {
      totalCents: 833, // 333 + 500
      claimedCount: 2,
    });
  });

  test("an item whose share rounds down to $0.00 still counts as claimed", () => {
    assert.deepEqual(getMyTotal(items, claims, "u2"), {
      totalCents: 583, // 333 + 0 + 250
      claimedCount: 3,
    });
  });

  test("my total equals the sum of my shares", () => {
    for (const userId of ["u1", "u2", "u3"]) {
      const myShares = items.flatMap((item) =>
        getItemShares(item, claims).shares.filter(
          (share) => share.userId === userId
        )
      );
      const total = getMyTotal(items, claims, userId);
      assert.equal(total.totalCents, sumOf(myShares));
      assert.equal(total.claimedCount, myShares.length);
    }
  });

  test("everyone's totals add up to the price of every claimed item", () => {
    const totals = ["u1", "u2", "u3"].map(
      (userId) => getMyTotal(items, claims, userId).totalCents
    );
    assert.equal(
      totals.reduce((sum, cents) => sum + cents, 0),
      1751 // every item except "unclaimed"
    );
  });

  test("claiming nothing gives a total of 0 and a count of 0", () => {
    assert.deepEqual(getMyTotal(items, claims, "u4"), {
      totalCents: 0,
      claimedCount: 0,
    });
  });

  test("no items gives a total of 0 and a count of 0", () => {
    assert.deepEqual(getMyTotal([], claims, "u1"), {
      totalCents: 0,
      claimedCount: 0,
    });
  });

  test("claims on items that aren't in the list are ignored", () => {
    assert.deepEqual(
      getMyTotal([{ id: "just-u2", priceCents: 250 }], claims, "u1"),
      { totalCents: 0, claimedCount: 0 }
    );
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

describe("US 2.3: real paths without a Supabase client", () => {
  test("they return an error and don't touch the mock data", async () => {
    const real = { useMock: false, client: null };
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

type DbError = { code?: string; message: string } | null;

/**
 * Builds a fake Supabase client for the real paths.
 * @param replies What each call returns
 * @param replies.userId Signed-in user, or null when signed out
 * @param replies.insertError Error the insert returns
 * @param replies.deleteError Error the delete returns
 * @param replies.rows Rows the select returns
 * @returns The fake client and a log of the calls it received
 */
function fakeClient(replies: {
  userId?: string | null;
  insertError?: DbError;
  deleteError?: DbError;
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- database column names */
  rows?: { item_id: string; user_id: string | null; guest_name: string | null }[];
}) {
  const calls: string[] = [];
  const client: ClaimsClient = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: replies.userId === null ? null : { id: replies.userId ?? "me" },
          },
        }),
    },
    from(table) {
      return {
        insert(row) {
          calls.push(`insert:${table}:${JSON.stringify(row)}`);
          return Promise.resolve({ error: replies.insertError ?? null });
        },
        delete() {
          return {
            eq(c1, v1) {
              return {
                eq(c2, v2) {
                  calls.push(`delete:${table}:${c1}=${v1}&${c2}=${v2}`);
                  return Promise.resolve({ error: replies.deleteError ?? null });
                },
              };
            },
          };
        },
        select(cols) {
          return {
            in(col, values) {
              calls.push(`select:${table}:${cols}:${col}=${values.join(",")}`);
              return Promise.resolve({ data: replies.rows ?? [], error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("US 2.3 Task 6: real paths with a fake client", () => {
  test("claims as the signed-in user", async () => {
    const { client, calls } = fakeClient({ userId: "me" });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "ok",
    });
    assert.deepEqual(calls, [
      `insert:item_claims:{"item_id":"${ITEM_ID}","user_id":"me"}`,
    ]);
  });

  test("claiming twice (23505 unique violation) is ok, not an error", async () => {
    const { client } = fakeClient({
      insertError: { code: "23505", message: "duplicate key value" },
    });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "ok",
    });
  });

  test("a non-member's claim blocked by RLS (42501) is forbidden", async () => {
    const { client } = fakeClient({
      insertError: { code: "42501", message: "new row violates row-level security policy" },
    });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "forbidden",
    });
  });

  test("signed out is forbidden and sends nothing", async () => {
    const { client, calls } = fakeClient({ userId: null });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "forbidden",
    });
    assert.deepEqual(calls, []);
  });

  test("other errors keep their message", async () => {
    const { client } = fakeClient({ insertError: { message: "timeout" } });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "error",
      message: "timeout",
    });
  });

  test("unclaim deletes only my own row", async () => {
    const { client, calls } = fakeClient({ userId: "me" });
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { useMock: false, client }), {
      status: "ok",
    });
    assert.deepEqual(calls, [`delete:item_claims:item_id=${ITEM_ID}&user_id=me`]);
  });

  test("getClaims returns member and guest claims, keyed for splitting", async () => {
    const { client, calls } = fakeClient({
      rows: [
        /* eslint-disable @typescript-eslint/naming-convention -- database column names */
        { item_id: ITEM_ID, user_id: "u1", guest_name: null },
        { item_id: ITEM_ID, user_id: null, guest_name: " Casey " },
        { item_id: ITEM_ID, user_id: null, guest_name: null },
        /* eslint-enable @typescript-eslint/naming-convention */
      ],
    });
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], { useMock: false, client }), {
      status: "ok",
      claims: [
        { itemId: ITEM_ID, userId: "u1" },
        { itemId: ITEM_ID, userId: "guest:casey", guestName: "Casey" },
      ],
    });
    assert.deepEqual(calls, [
      `select:item_claims:item_id, user_id, guest_name:item_id=${ITEM_ID}`,
    ]);
  });

  test("getClaims with no items sends no query", async () => {
    const { client, calls } = fakeClient({});
    assert.deepEqual(await getClaims(GROUP_ID, [], { useMock: false, client }), {
      status: "ok",
      claims: [],
    });
    assert.deepEqual(calls, []);
  });
});

describe("US 2.3 Task 6: guests and the mock user", () => {
  test("the mock signed-in user can claim in Apartment 402", async () => {
    const asMe = { useMock: true };
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, asMe), { status: "ok" });
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], asMe), {
      status: "ok",
      claims: [{ itemId: ITEM_ID, userId: "current-user" }],
    });
  });

  test("getClaims includes guest claims, and unclaiming never removes them", async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- database column names
    mockItemClaims.push({ item_id: ITEM_ID, guest_name: "Casey" });
    await claimItem(GROUP_ID, ITEM_ID, AS_U1);
    await unclaimItem(GROUP_ID, ITEM_ID, AS_U1);

    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], AS_U1), {
      status: "ok",
      claims: [{ itemId: ITEM_ID, userId: guestClaimKey("Casey"), guestName: "Casey" }],
    });
  });

  test("guest keys match names the way the database does", () => {
    assert.equal(guestClaimKey(" Casey "), guestClaimKey("casey"));
    assert.equal(isGuestClaimKey(guestClaimKey("Casey")), true);
    assert.equal(isGuestClaimKey("u1"), false);
  });

  test("a guest sharer still splits to the exact cent", () => {
    const guest = guestClaimKey("Casey");
    assert.equal(sumOf(splitCents(1000, ["u1", "u2", guest])), 1000);
    assert.equal(sumOf(splitCents(1, ["u1", guest])), 1);
  });

  test("my total equals the sum of my shares on a mixed receipt", () => {
    const guest = guestClaimKey("Casey");
    const items = [
      { id: "solo", priceCents: 799 },
      { id: "shared", priceCents: 1000 },
      { id: "guest-shared", priceCents: 1 },
      { id: "guest-only", priceCents: 450 },
    ];
    const claims = [
      { itemId: "solo", userId: "u1" },
      { itemId: "shared", userId: "u1" },
      { itemId: "shared", userId: "u2" },
      { itemId: "shared", userId: guest, guestName: "Casey" },
      { itemId: "guest-shared", userId: "u1" },
      { itemId: "guest-shared", userId: guest, guestName: "Casey" },
      { itemId: "guest-only", userId: guest, guestName: "Casey" },
    ];

    for (const person of ["u1", "u2", guest]) {
      const myShares = items.flatMap((item) =>
        getItemShares(item, claims).shares.filter((s) => s.userId === person)
      );
      assert.equal(getMyTotal(items, claims, person).totalCents, sumOf(myShares));
    }
    // Every claimed cent is owed by someone.
    const all = ["u1", "u2", guest].map((p) => getMyTotal(items, claims, p).totalCents);
    assert.equal(all.reduce((a, b) => a + b, 0), 799 + 1000 + 1 + 450);
  });
});

describe("US 2.3: prices are validated before claiming", () => {
  test("whole non-negative cents pass, anything else is left out", () => {
    assert.deepEqual(
      toClaimableItems([
        /* eslint-disable @typescript-eslint/naming-convention -- database column names */
        { id: "a", amount_cents: 500 },
        { id: "b", amount_cents: "250" },
        { id: "c", amount_cents: 1.5 },
        { id: "d", amount_cents: -1 },
        { id: "e", amount_cents: null },
        { id: "f", amount_cents: "" },
        /* eslint-enable @typescript-eslint/naming-convention */
      ]),
      {
        items: [
          { id: "a", priceCents: 500 },
          { id: "b", priceCents: 250 },
        ],
        invalidIds: ["c", "d", "e", "f"],
      }
    );
    assert.equal(toWholeCents(0), 0);
  });
});
