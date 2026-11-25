/* eslint-disable @typescript-eslint/naming-convention -- database column names */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAxisDollars, niceTicks } from "@/lib/chart-scale";
import { NOT_CONFIGURED } from "@/lib/group-data";
import {
  buildSpendingOverTime,
  formatDayLabel,
  loadGroupStats,
  type GroupStatsClient,
  type StatsReceipt,
  totalSpentCents,
} from "@/lib/group-stats";

type Row = Record<string, unknown>;

/**
 * In-memory fake Supabase client that supports `select().eq()` and
 * `select().in()` and logs every query.
 * @param tables Rows keyed by table name
 * @param options Error injection
 * @param options.errorTable Table that returns a database error
 * @param options.throwOnTable Table whose query rejects (network error)
 * @returns The fake client and the query log
 */
function fakeClient(
  tables: Record<string, Row[]>,
  options: { errorTable?: string; throwOnTable?: string } = {}
) {
  const calls: string[] = [];
  const respond = (table: string, rows: Row[]) => {
    if (options.throwOnTable === table) {
      return Promise.reject(new Error("Network down"));
    }
    if (options.errorTable === table) {
      return Promise.resolve({
        data: null,
        error: { message: `Failed to read ${table}` },
      });
    }
    return Promise.resolve({ data: rows, error: null });
  };

  const client: GroupStatsClient = {
    from(table) {
      const rows = tables[table] ?? [];
      return {
        select(columns) {
          return {
            eq(column, value) {
              calls.push(`${table}.select(${columns}).eq(${column},${value})`);
              return respond(
                table,
                rows.filter((r) => r[column] === value)
              );
            },
            in(column, values) {
              calls.push(`${table}.select(${columns}).in(${column})`);
              return respond(
                table,
                rows.filter((r) => values.includes(String(r[column])))
              );
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

/** Receipts across two groups, with one draft in the chosen group. */
const RECEIPTS: Row[] = [
  {
    id: "r1",
    group_id: "g1",
    title: "Safeway",
    total_cents: 2500,
    tax_cents: 200,
    tip_cents: 0,
    status: "submitted",
    created_at: "2026-11-02T12:00:00",
  },
  {
    id: "r2",
    group_id: "g1",
    title: "Costco",
    total_cents: "1050",
    tax_cents: 50,
    tip_cents: 100,
    status: "finalized",
    created_at: "2026-11-05T12:00:00",
  },
  {
    id: "r3",
    group_id: "g1",
    title: "Draft run",
    total_cents: 9999,
    tax_cents: 0,
    tip_cents: 0,
    status: "draft",
    created_at: "2026-11-06T12:00:00",
  },
  {
    id: "r4",
    group_id: "g2",
    title: "Other group",
    total_cents: 4000,
    tax_cents: 0,
    tip_cents: 0,
    status: "submitted",
    created_at: "2026-11-02T12:00:00",
  },
];

/** Items on the receipts above. */
const ITEMS: Row[] = [
  { id: "i1", receipt_id: "r1", name: "Milk", amount_cents: 500 },
  { id: "i2", receipt_id: "r2", name: "Eggs", amount_cents: 450 },
  { id: "i3", receipt_id: "r3", name: "Draft item", amount_cents: 9999 },
  { id: "i4", receipt_id: "r4", name: "Other item", amount_cents: 4000 },
];

/**
 * Builds a `StatsReceipt` for `buildSpendingOverTime` tests.
 * @param id Receipt id
 * @param createdAt Receipt timestamp
 * @param totalCents Receipt total
 * @returns The receipt
 */
function receipt(id: string, createdAt: string, totalCents: number): StatsReceipt {
  return {
    id,
    title: "Store",
    totalCents,
    taxCents: 0,
    tipCents: 0,
    status: "submitted",
    createdAt,
  };
}

describe("User Story 4.1 Task 1: loadGroupStats", () => {
  it("US-4.1-T-1: returns the group's submitted and finalized receipts with their items and leaves out drafts", async () => {
    const { client, calls } = fakeClient({
      receipts: RECEIPTS,
      receipt_items: ITEMS,
    });

    const result = await loadGroupStats("g1", { client });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.deepEqual(
      result.stats.receipts.map((r) => r.id),
      ["r1", "r2"]
    );
    assert.deepEqual(result.stats.receipts[1], {
      id: "r2",
      title: "Costco",
      totalCents: 1050,
      taxCents: 50,
      tipCents: 100,
      status: "finalized",
      createdAt: "2026-11-05T12:00:00",
    });
    assert.deepEqual(result.stats.items, [
      { id: "i1", receiptId: "r1", name: "Milk", amountCents: 500 },
      { id: "i2", receiptId: "r2", name: "Eggs", amountCents: 450 },
    ]);
    assert.ok(calls[0].startsWith("receipts.select("));
    assert.ok(calls[0].endsWith(".eq(group_id,g1)"));
  });

  it("US-4.1-T-1: skips the items query when the group has no posted receipts", async () => {
    const { client, calls } = fakeClient({
      receipts: [RECEIPTS[2]],
      receipt_items: ITEMS,
    });

    const result = await loadGroupStats("g1", { client });

    assert.deepEqual(result, { status: "ok", stats: { receipts: [], items: [] } });
    assert.equal(calls.length, 1);
  });

  it("US-4.1-T-1: returns an error message when Supabase returns an error", async () => {
    const { client } = fakeClient(
      { receipts: RECEIPTS, receipt_items: ITEMS },
      { errorTable: "receipt_items" }
    );

    const result = await loadGroupStats("g1", { client });

    assert.deepEqual(result, {
      status: "error",
      message: "Failed to read receipt_items",
    });
  });

  it("US-4.1-T-1: returns an error message when the request fails", async () => {
    const { client } = fakeClient({}, { throwOnTable: "receipts" });

    const result = await loadGroupStats("g1", { client });

    assert.deepEqual(result, { status: "error", message: "Network down" });
  });

  it("US-4.1-T-1: returns the not-configured message without a Supabase client", async () => {
    const result = await loadGroupStats("g1", { client: null });

    assert.deepEqual(result, { status: "error", message: NOT_CONFIGURED });
  });
});

describe("User Story 4.1 Task 1: buildSpendingOverTime", () => {
  it("US-4.1-T-1: returns one point per receipt date, oldest first, adding same-day receipts", () => {
    const points = buildSpendingOverTime([
      receipt("a", "2026-11-05T18:30:00", 1000),
      receipt("b", "2026-11-02T09:00:00", 2500),
      receipt("c", "2026-11-05T08:15:00", 425),
      receipt("d", "2026-10-30T12:00:00", 300),
    ]);

    assert.deepEqual(points, [
      { date: "2026-10-30", totalCents: 300 },
      { date: "2026-11-02", totalCents: 2500 },
      { date: "2026-11-05", totalCents: 1425 },
    ]);
  });

  it("US-4.1-T-1: skips receipts with an unreadable date and returns nothing for no receipts", () => {
    assert.deepEqual(buildSpendingOverTime([]), []);
    assert.deepEqual(
      buildSpendingOverTime([
        receipt("a", "not a date", 1000),
        receipt("b", "2026-11-02T09:00:00", 200),
      ]),
      [{ date: "2026-11-02", totalCents: 200 }]
    );
  });

  it("US-4.1-T-1: totals the group's spending and formats date labels", () => {
    assert.equal(
      totalSpentCents([
        receipt("a", "2026-11-05T18:30:00", 1000),
        receipt("b", "2026-11-02T09:00:00", 2550),
      ]),
      3550
    );
    assert.equal(formatDayLabel("2026-11-03"), "Nov 3");
    assert.equal(formatDayLabel("2026-01-28"), "Jan 28");
  });
});

describe("User Story 4.1 Task 1: chart axis helpers", () => {
  it("US-4.1-T-1: picks round y-axis ticks from 0 that cover the largest value", () => {
    assert.deepEqual(niceTicks(2500), [0, 1000, 2000, 3000]);
    assert.deepEqual(niceTicks(4000), [0, 1000, 2000, 3000, 4000]);
    assert.deepEqual(niceTicks(0), [0, 1]);
    const ticks = niceTicks(12345);
    assert.equal(ticks[0], 0);
    assert.ok(ticks[ticks.length - 1] >= 12345);
  });

  it("US-4.1-T-1: formats axis amounts as compact dollars", () => {
    assert.equal(formatAxisDollars(0), "$0");
    assert.equal(formatAxisDollars(4000), "$40");
    assert.equal(formatAxisDollars(250), "$2.50");
    assert.equal(formatAxisDollars(250000), "$2.5k");
    assert.equal(formatAxisDollars(100000), "$1k");
  });
});
