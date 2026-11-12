/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOT_CONFIGURED } from "@/lib/group-data";
import {
  buildGroupOverviewCards,
  calculateUserBalances,
  loadHomeOverview,
  resolveDisplayName,
  type HomeOverviewClient,
  type OverviewClaimRow,
  type OverviewGroupRow,
  type OverviewItemRow,
  type OverviewMemberRow,
  type OverviewReceiptRow,
} from "@/lib/home-overview";

type TableFixture = Record<string, Record<string, unknown>[]>;

/**
 * Builds an in-memory fake Supabase client backed by table arrays and optional
 * error injection per table or auth.
 * @param options Fixture configuration
 * @param options.tables Table rows keyed by table name
 * @param options.user Signed-in auth user (or null)
 * @param options.errorTable Table name that should return a DB error
 * @param options.throwOnTable Table name that should reject with a network error
 * @returns Fake `HomeOverviewClient` and call log
 */
function createFakeOverviewClient(options: {
  tables?: TableFixture;
  user?: {
    id: string;
    email?: string | null;
    user_metadata?: { full_name?: string | null; name?: string | null } | null;
  } | null;
  errorTable?: string;
  throwOnTable?: string;
}) {
  const calls: string[] = [];
  const tables = options.tables ?? {};

  const client: HomeOverviewClient = {
    auth: {
      getUser() {
        calls.push("auth.getUser");
        return Promise.resolve({
          data: { user: options.user ?? null },
          error: null,
        });
      },
    },
    from(table) {
      calls.push(`from:${table}`);
      if (options.throwOnTable === table) {
        return {
          select() {
            return {
              order() {
                return Promise.reject(new Error("Network down"));
              },
              in() {
                return Promise.reject(new Error("Network down"));
              },
            };
          },
        };
      }

      const rows = [...(tables[table] ?? [])];
      const result = (filtered: Record<string, unknown>[]) =>
        options.errorTable === table
          ? Promise.resolve({
              data: null,
              error: { message: `Failed to read ${table}` },
            })
          : Promise.resolve({ data: filtered, error: null });

      return {
        select(columns) {
          calls.push(`select:${table}:${columns}`);
          return {
            order(column) {
              calls.push(`order:${table}:${column}`);
              return result(
                [...rows].sort((a, b) =>
                  String(a[column] ?? "").localeCompare(String(b[column] ?? ""))
                )
              );
            },
            in(column, values) {
              calls.push(`in:${table}:${column}:${values.join(",")}`);
              const allowed = new Set(values);
              return result(
                rows.filter((row) => allowed.has(String(row[column] ?? "")))
              );
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

describe("User Story 3.1 Task 1: Home overview data & balance logic", () => {
  it("US-3.1-T-1: resolves display name using fullName, name, profileDisplayName, email prefix, and fallback", () => {
    assert.equal(
      resolveDisplayName({
        fullName: "  Kellar McLaughlin ",
        name: "Kellar M.",
        profileDisplayName: "ProfileName",
        email: "kmclaugh@ucsc.edu",
      }),
      "Kellar McLaughlin"
    );

    assert.equal(
      resolveDisplayName({
        fullName: "   ",
        name: "  Alex Morgan ",
        profileDisplayName: "ProfileAlex",
        email: "alex@ucsc.edu",
      }),
      "Alex Morgan"
    );

    assert.equal(
      resolveDisplayName({
        fullName: null,
        name: "",
        profileDisplayName: "  ProfileSam ",
        email: "sam@ucsc.edu",
      }),
      "ProfileSam"
    );

    assert.equal(
      resolveDisplayName({
        fullName: null,
        name: null,
        profileDisplayName: "   ",
        email: "jordan.lee@ucsc.edu",
      }),
      "jordan.lee"
    );

    assert.equal(
      resolveDisplayName({
        fullName: null,
        name: "",
        profileDisplayName: null,
        email: "   ",
      }),
      "there"
    );
  });

  it("US-3.1-T-1: computes unique memberCount and picks latest submitted receipt per group (ignoring drafts)", () => {
    const groups: OverviewGroupRow[] = [
      { id: "g2", name: "Road Trip" },
      { id: "g1", name: "Apartment 402" },
      { id: "g3", name: "Empty Group" },
    ];
    const members: OverviewMemberRow[] = [
      { group_id: "g1", user_id: "u1" },
      { group_id: "g1", user_id: "u2" },
      { group_id: "g1", user_id: "u2" }, // duplicate should count once
      { group_id: "g1", user_id: "u3" },
      { group_id: "g2", user_id: "u1" },
    ];
    const receipts: OverviewReceiptRow[] = [
      {
        id: "r-old",
        group_id: "g1",
        title: "Older Submitted",
        total_cents: 1200,
        status: "submitted",
        created_at: "2026-10-01T10:00:00Z",
        created_by: "u1",
      },
      {
        id: "r-latest",
        group_id: "g1",
        title: "Costco Run",
        total_cents: "8423",
        status: "submitted",
        created_at: "2026-10-05T10:00:00Z",
        created_by: "u2",
      },
      {
        id: "r-draft-newer",
        group_id: "g1",
        title: "Unfinished Draft",
        total_cents: 9999,
        status: "draft",
        created_at: "2026-10-09T10:00:00Z",
        created_by: "u1",
      },
      {
        id: "r-draft-only",
        group_id: "g2",
        title: "Gas Draft",
        total_cents: 4500,
        status: "draft",
        created_at: "2026-10-08T10:00:00Z",
        created_by: "u1",
      },
    ];

    const cards = buildGroupOverviewCards(groups, members, receipts);
    assert.deepEqual(
      cards.map((c) => c.id),
      ["g1", "g3", "g2"]
    );
    assert.equal(cards[0].memberCount, 3);
    assert.deepEqual(cards[0].latestReceipt, {
      id: "r-latest",
      title: "Costco Run",
      totalCents: 8423,
      createdAt: "2026-10-05T10:00:00Z",
    });

    // Empty Group has no members/receipts
    assert.equal(cards[1].memberCount, 0);
    assert.equal(cards[1].latestReceipt, null);

    // Road Trip has only a draft receipt, so latestReceipt is null
    assert.equal(cards[2].memberCount, 1);
    assert.equal(cards[2].latestReceipt, null);
  });

  it("US-3.1-T-1: calculates owedToMeCents with splitCents across member and guest claims while excluding payer share and drafts", () => {
    const receipts: OverviewReceiptRow[] = [
      {
        id: "r1",
        group_id: "g1",
        title: "Dinner",
        total_cents: 2001,
        status: "submitted",
        created_at: "2026-10-05T10:00:00Z",
        created_by: "u1", // current user paid
      },
      {
        id: "r-draft",
        group_id: "g1",
        title: "Draft Receipt",
        total_cents: 5000,
        status: "draft",
        created_at: "2026-10-06T10:00:00Z",
        created_by: "u1",
      },
    ];
    const items: OverviewItemRow[] = [
      // Split between guest ("guest:casey"), "u1", and "u2".
      // Sorted claimant keys: ["guest:casey", "u1", "u2"]
      // 1000 / 3 => guest:casey = 334, u1 = 333 (excluded), u2 = 333 => owedToMe += 667
      { id: "i1", receipt_id: "r1", amount_cents: 1000 },
      // 1001 claimed only by guest "Casey" (two claims with same trimmed case deduplicated) => 1001
      { id: "i2", receipt_id: "r1", amount_cents: "1001" },
      // Draft receipt item must be completely excluded
      { id: "i-draft", receipt_id: "r-draft", amount_cents: 5000 },
    ];
    const claims: OverviewClaimRow[] = [
      { item_id: "i1", user_id: "u1", guest_name: null },
      { item_id: "i1", user_id: "u2", guest_name: null },
      { item_id: "i1", user_id: null, guest_name: "Casey" },
      { item_id: "i2", user_id: null, guest_name: " casey " },
      { item_id: "i2", user_id: null, guest_name: "Casey" },
      { item_id: "i-draft", user_id: "u2", guest_name: null },
    ];

    const balances = calculateUserBalances("u1", receipts, items, claims);
    assert.equal(balances.owedToMeCents, 667 + 1001);
    assert.equal(balances.iOweCents, 0);
  });

  it("US-3.1-T-1: calculates iOweCents on receipts paid by others while ignoring unclaimed items and invalid prices", () => {
    const receipts: OverviewReceiptRow[] = [
      {
        id: "r2",
        group_id: "g1",
        title: "Groceries",
        total_cents: 1500,
        status: "submitted",
        created_at: "2026-10-06T10:00:00Z",
        created_by: "u2", // someone else paid
      },
      {
        id: "r3-draft",
        group_id: "g1",
        title: "Other Draft",
        total_cents: 800,
        status: "draft",
        created_at: "2026-10-07T10:00:00Z",
        created_by: "u2",
      },
    ];
    const items: OverviewItemRow[] = [
      // Split between "u1" and "u2": sorted ["u1", "u2"], 101 / 2 => u1 pays 51, u2 pays 50
      { id: "i3", receipt_id: "r2", amount_cents: 101 },
      // Unclaimed item => ignored
      { id: "i4", receipt_id: "r2", amount_cents: 400 },
      // Item claimed only by u2 => u1 owes 0
      { id: "i5", receipt_id: "r2", amount_cents: 300 },
      // Invalid amount => ignored without throwing
      { id: "i6-bad", receipt_id: "r2", amount_cents: -10 },
      { id: "i7-nan", receipt_id: "r2", amount_cents: "not-a-number" },
      // Draft receipt item => ignored
      { id: "i8-draft", receipt_id: "r3-draft", amount_cents: 800 },
    ];
    const claims: OverviewClaimRow[] = [
      { item_id: "i3", user_id: "u2", guest_name: null },
      { item_id: "i3", user_id: "u1", guest_name: null },
      { item_id: "i5", user_id: "u2", guest_name: null },
      { item_id: "i6-bad", user_id: "u1", guest_name: null },
      { item_id: "i7-nan", user_id: "u1", guest_name: null },
      { item_id: "i8-draft", user_id: "u1", guest_name: null },
    ];

    const balances = calculateUserBalances("u1", receipts, items, claims);
    assert.equal(balances.owedToMeCents, 0);
    assert.equal(balances.iOweCents, 51);
  });

  it("US-3.1-T-1: loadHomeOverview handles missing client, signed-out user, empty groups, query errors, and full loads", async () => {
    // Missing client
    const noClient = await loadHomeOverview({ client: null });
    assert.deepEqual(noClient, { status: "error", message: NOT_CONFIGURED });

    // Signed-out user
    const signedOutFake = createFakeOverviewClient({ user: null });
    const signedOut = await loadHomeOverview({ client: signedOutFake.client });
    assert.deepEqual(signedOut, {
      status: "error",
      message: "Please sign in to view your overview.",
    });

    // Empty groups short-circuits without querying members/receipts/items/claims
    const emptyFake = createFakeOverviewClient({
      user: {
        id: "u1",
        email: "kellar@ucsc.edu",
        user_metadata: {},
      },
      tables: {
        groups: [],
        profiles: [{ id: "u1", display_name: "Kellar" }],
      },
    });
    const emptyRes = await loadHomeOverview({ client: emptyFake.client });
    assert.deepEqual(emptyRes, {
      status: "ok",
      overview: {
        displayName: "Kellar",
        groups: [],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    });
    assert.equal(emptyFake.calls.includes("from:group_members"), false);
    assert.equal(emptyFake.calls.includes("from:receipts"), false);

    // Query error propagation
    const errFake = createFakeOverviewClient({
      tables: {
        groups: [{ id: "g1", name: "Apt" }],
        profiles: [{ id: "u1", display_name: "Kellar" }],
      },
      errorTable: "receipts",
    });
    const errRes = await loadHomeOverview({
      client: errFake.client,
      user: { id: "u1", fullName: "Kellar McLaughlin" },
    });
    assert.deepEqual(errRes, {
      status: "error",
      message: "Failed to read receipts",
    });

    // Network throw propagation
    const throwFake = createFakeOverviewClient({
      throwOnTable: "groups",
    });
    const throwRes = await loadHomeOverview({
      client: throwFake.client,
      user: { id: "u1", fullName: "Kellar" },
    });
    assert.deepEqual(throwRes, { status: "error", message: "Network down" });

    // Full end-to-end overview load
    const fullFake = createFakeOverviewClient({
      tables: {
        groups: [{ id: "g1", name: "Apartment 402" }],
        profiles: [{ id: "u1", display_name: "Kellar" }],
        group_members: [
          { group_id: "g1", user_id: "u1" },
          { group_id: "g1", user_id: "u2" },
        ],
        receipts: [
          {
            id: "r1",
            group_id: "g1",
            title: "Trader Joe's",
            total_cents: 1200,
            status: "submitted",
            created_at: "2026-10-10T10:00:00Z",
            created_by: "u1",
          },
          {
            id: "r2",
            group_id: "g1",
            title: "Coffee",
            total_cents: 500,
            status: "submitted",
            created_at: "2026-10-11T10:00:00Z",
            created_by: "u2",
          },
        ],
        receipt_items: [
          { id: "item-1", receipt_id: "r1", amount_cents: 1200 },
          { id: "item-2", receipt_id: "r2", amount_cents: 500 },
        ],
        item_claims: [
          { item_id: "item-1", user_id: "u1", guest_name: null },
          { item_id: "item-1", user_id: "u2", guest_name: null },
          { item_id: "item-2", user_id: "u1", guest_name: null },
        ],
      },
    });
    const fullRes = await loadHomeOverview({
      client: fullFake.client,
      user: { id: "u1", email: "kellar@ucsc.edu" },
    });
    assert.deepEqual(fullRes, {
      status: "ok",
      overview: {
        displayName: "Kellar",
        groups: [
          {
            id: "g1",
            name: "Apartment 402",
            memberCount: 2,
            latestReceipt: {
              id: "r2",
              title: "Coffee",
              totalCents: 500,
              createdAt: "2026-10-11T10:00:00Z",
            },
          },
        ],
        balances: { owedToMeCents: 600, iOweCents: 500 },
      },
    });
  });
});

