/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 2.3, Task 2: claiming items and splitting prices in cents.
 * Tests the real `src/lib/claims.ts` with Supabase mocks.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

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

/** Test group identifier. */
const GROUP_ID = "group-1";

/** Test item identifier. */
const ITEM_ID = "item-1";

/**
 * Calculates sum of cents across an array of shares.
 * @param shares Array of shares
 * @returns Total cents
 */
function sumOf(shares: CentsShare[]): number {
  return shares.reduce((sum, share) => sum + share.cents, 0);
}

/** Record shape for a claim row in memory. */
type ClaimRow = { item_id: string; user_id: string | null; guest_name: string | null };

/**
 * Creates an in-memory fake client for testing claims.
 * @param initialRows Starting claims rows
 * @returns Fake ClaimsClient
 */
function createMemoryClaimsClient(initialRows: ClaimRow[] = []) {
  let currentUserId: string | null = "u1";
  const rows: ClaimRow[] = [...initialRows];

  const client: ClaimsClient = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: currentUserId ? { id: currentUserId } : null,
          },
        }),
    },
    from() {
      return {
        insert(row: Record<string, unknown>) {
          const itemId = String(row.item_id);
          const userId = row.user_id ? String(row.user_id) : null;
          // Duplicate check
          const exists = rows.some((r) => r.item_id === itemId && r.user_id === userId);
          if (exists) {
            return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
          }
          rows.push({
            item_id: itemId,
            user_id: userId,
            guest_name: row.guest_name ? String(row.guest_name) : null,
          });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(c1: string, v1: string) {
              return {
                eq(c2: string, v2: string) {
                  const idx = rows.findIndex(
                    (r) => (r as Record<string, unknown>)[c1] === v1 && (r as Record<string, unknown>)[c2] === v2
                  );
                  if (idx !== -1) rows.splice(idx, 1);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        select() {
          return {
            in(col: string, values: string[]) {
              const matched = rows.filter((r) => values.includes(String((r as Record<string, unknown>)[col])));
              return Promise.resolve({ data: matched, error: null });
            },
          };
        },
      };
    },
  };

  return {
    client,
    setUserId(id: string | null) {
      currentUserId = id;
    },
    getRows() {
      return rows;
    },
  };
}

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

  test("$0.00 split 3 ways gives 0 to everyone", () => {
    const shares = splitCents(0, ["u1", "u2", "u3"]);
    assert.deepEqual(
      shares.map((share) => share.cents),
      [0, 0, 0]
    );
    assert.equal(sumOf(shares), 0);
  });

  test("even split divides equally", () => {
    const shares = splitCents(1200, ["u1", "u2", "u3"]);
    assert.deepEqual(
      shares.map((share) => share.cents),
      [400, 400, 400]
    );
    assert.equal(sumOf(shares), 1200);
  });

  test("remainder cents go to the earliest claimants in the input list", () => {
    const shares = splitCents(1001, ["u1", "u2", "u3"]);
    assert.deepEqual(
      shares.map((share) => share.cents),
      [334, 334, 333]
    );
    assert.equal(sumOf(shares), 1001);
  });

  test("negative price throws", () => {
    assert.throws(() => splitCents(-100, ["u1"]), RangeError);
  });

  test("non-integer cents throw", () => {
    assert.throws(() => splitCents(10.5, ["u1"]), RangeError);
  });

  test("no claimants returns empty array", () => {
    assert.deepEqual(splitCents(1000, []), []);
  });

  test("duplicate claimant ids are deduplicated", () => {
    assert.deepEqual(splitCents(1000, ["u1", "u1"]), [{ userId: "u1", cents: 1000 }]);
  });
});

describe("US 2.3: getItemShares", () => {
  const item = { id: "item-1", priceCents: 1000 };

  test("nobody claimed returns isShared:false and empty shares", () => {
    assert.deepEqual(getItemShares(item, []), {
      isShared: false,
      claimedBy: [],
      shares: [],
    });
  });

  test("one person claimed returns isShared:false and full price", () => {
    assert.deepEqual(getItemShares(item, [{ itemId: "item-1", userId: "u1" }]), {
      isShared: false,
      claimedBy: ["u1"],
      shares: [{ userId: "u1", cents: 1000 }],
    });
  });

  test("two people claimed returns isShared:true and split shares", () => {
    assert.deepEqual(
      getItemShares(item, [
        { itemId: "item-1", userId: "u1" },
        { itemId: "item-1", userId: "u2" },
      ]),
      {
        isShared: true,
        claimedBy: ["u1", "u2"],
        shares: [
          { userId: "u1", cents: 500 },
          { userId: "u2", cents: 500 },
        ],
      }
    );
  });

  test("claims on other items are ignored", () => {
    assert.deepEqual(
      getItemShares(item, [
        { itemId: "other-item", userId: "u2" },
        { itemId: "item-1", userId: "u1" },
      ]),
      {
        isShared: false,
        claimedBy: ["u1"],
        shares: [{ userId: "u1", cents: 1000 }],
      }
    );
  });

  test("claimants and shares are sorted by user id", () => {
    const shares = getItemShares(item, [
      { itemId: "item-1", userId: "zebra" },
      { itemId: "item-1", userId: "apple" },
    ]);
    assert.deepEqual(shares.claimedBy, ["apple", "zebra"]);
    assert.deepEqual(
      shares.shares.map((s) => s.userId),
      ["apple", "zebra"]
    );
  });
});

describe("US 2.3: getMyTotal", () => {
  const items = [
    { id: "item-1", priceCents: 1000 },
    { id: "item-2", priceCents: 400 },
  ];
  const claims = [
    { itemId: "item-1", userId: "u1" },
    { itemId: "item-1", userId: "u2" },
    { itemId: "item-2", userId: "u1" },
  ];

  test("adds up shares for items the user claimed", () => {
    assert.deepEqual(getMyTotal(items, claims, "u1"), {
      totalCents: 900,
      claimedCount: 2,
    });
  });

  test("counts only claimed items for other users", () => {
    assert.deepEqual(getMyTotal(items, claims, "u2"), {
      totalCents: 500,
      claimedCount: 1,
    });
  });

  test("zero total when user claimed nothing", () => {
    assert.deepEqual(getMyTotal(items, claims, "u3"), {
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

describe("US 2.3: claiming items with Supabase mock", () => {
  test("claiming then unclaiming adds and removes the claim", async () => {
    const memory = createMemoryClaimsClient();
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client: memory.client }), { status: "ok" });

    let claimsRes = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(claimsRes.status, "ok");
    if (claimsRes.status === "ok") {
      assert.deepEqual(claimsRes.claims.map((c) => c.userId), ["u1"]);
    }

    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { client: memory.client }), { status: "ok" });
    claimsRes = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(claimsRes.status, "ok");
    if (claimsRes.status === "ok") {
      assert.deepEqual(claimsRes.claims, []);
    }
  });

  test("two people can claim the same item", async () => {
    const memory = createMemoryClaimsClient();
    memory.setUserId("u1");
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });
    memory.setUserId("u2");
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });

    const claimsRes = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(claimsRes.status, "ok");
    if (claimsRes.status === "ok") {
      assert.deepEqual(claimsRes.claims.map((c) => c.userId), ["u1", "u2"]);
    }
  });

  test("unclaiming only removes your own claim", async () => {
    const memory = createMemoryClaimsClient();
    memory.setUserId("u1");
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });
    memory.setUserId("u2");
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });
    memory.setUserId("u1");
    await unclaimItem(GROUP_ID, ITEM_ID, { client: memory.client });

    const claimsRes = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(claimsRes.status, "ok");
    if (claimsRes.status === "ok") {
      assert.deepEqual(claimsRes.claims.map((c) => c.userId), ["u2"]);
    }
  });

  test("claiming twice doesn't duplicate the claim", async () => {
    const memory = createMemoryClaimsClient();
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client: memory.client }), { status: "ok" });

    const claimsRes = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(claimsRes.status, "ok");
    if (claimsRes.status === "ok") {
      assert.deepEqual(claimsRes.claims.map((c) => c.userId), ["u1"]);
    }
  });

  test("unclaiming an unclaimed item is not an error", async () => {
    const memory = createMemoryClaimsClient();
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { client: memory.client }), { status: "ok" });
  });

  test("getClaims only returns the requested items", async () => {
    const memory = createMemoryClaimsClient();
    await claimItem(GROUP_ID, ITEM_ID, { client: memory.client });
    await claimItem(GROUP_ID, "other-item", { client: memory.client });

    const claimsRes = await getClaims(GROUP_ID, ["other-item"], { client: memory.client });
    assert.deepEqual(claimsRes, {
      status: "ok",
      claims: [{ itemId: "other-item", userId: "u1" }],
    });
  });

  test("signed out is forbidden", async () => {
    const memory = createMemoryClaimsClient();
    memory.setUserId(null);

    const forbidden = { status: "forbidden" };
    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client: memory.client }), forbidden);
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { client: memory.client }), forbidden);
  });
});

describe("US 2.3: missing Supabase client error handling", () => {
  test("returns error when client is unconfigured", async () => {
    const error = {
      status: "error",
      message: "Claims on the server are not set up yet.",
    };

    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client: null }), error);
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { client: null }), error);
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], { client: null }), error);
  });
});

describe("US 2.3 Task 6: fake client error cases", () => {
  test("RLS 42501 error maps to forbidden", async () => {
    const client: ClaimsClient = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from() {
        return {
          insert: () => Promise.resolve({ error: { code: "42501", message: "RLS denied" } }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { code: "42501", message: "RLS" } }) }) }),
          select: () => ({ in: () => Promise.resolve({ data: null, error: { code: "42501", message: "RLS" } }) }),
        };
      },
    };

    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client }), { status: "forbidden" });
    assert.deepEqual(await unclaimItem(GROUP_ID, ITEM_ID, { client }), { status: "forbidden" });
    assert.deepEqual(await getClaims(GROUP_ID, [ITEM_ID], { client }), { status: "forbidden" });
  });

  test("other database error surfaces message", async () => {
    const client: ClaimsClient = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from() {
        return {
          insert: () => Promise.resolve({ error: { message: "timeout" } }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { message: "timeout" } }) }) }),
          select: () => ({ in: () => Promise.resolve({ data: null, error: { message: "timeout" } }) }),
        };
      },
    };

    assert.deepEqual(await claimItem(GROUP_ID, ITEM_ID, { client }), {
      status: "error",
      message: "timeout",
    });
  });

  test("getClaims with no items sends no query", async () => {
    let queried = false;
    const client: ClaimsClient = {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from() {
        queried = true;
        return {
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        };
      },
    };

    assert.deepEqual(await getClaims(GROUP_ID, [], { client }), {
      status: "ok",
      claims: [],
    });
    assert.equal(queried, false);
  });
});

describe("US 2.3 Task 6: guests and claim keys", () => {
  test("getClaims parses guest claims correctly and formats guestClaimKey", async () => {
    const memory = createMemoryClaimsClient([
      { item_id: ITEM_ID, user_id: "u1", guest_name: null },
      { item_id: ITEM_ID, user_id: null, guest_name: " Casey " },
    ]);

    const res = await getClaims(GROUP_ID, [ITEM_ID], { client: memory.client });
    assert.equal(res.status, "ok");
    if (res.status === "ok") {
      assert.deepEqual(res.claims, [
        { itemId: ITEM_ID, userId: "u1" },
        { itemId: ITEM_ID, userId: "guest:casey", guestName: "Casey" },
      ]);
    }
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
    const all = ["u1", "u2", guest].map((p) => getMyTotal(items, claims, p).totalCents);
    assert.equal(all.reduce((a, b) => a + b, 0), 799 + 1000 + 1 + 450);
  });
});

describe("US 2.3: prices are validated before claiming", () => {
  test("whole non-negative cents pass, anything else is left out", () => {
    assert.deepEqual(
      toClaimableItems([
        { id: "a", amount_cents: 500 },
        { id: "b", amount_cents: "250" },
        { id: "c", amount_cents: 1.5 },
        { id: "d", amount_cents: -1 },
        { id: "e", amount_cents: null },
        { id: "f", amount_cents: "" },
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
