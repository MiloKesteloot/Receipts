import { toWholeCents } from "@/lib/claims";
import { NOT_CONFIGURED } from "@/lib/group-data";
import { isPostedReceipt } from "@/lib/home-overview";
import { SUPABASE } from "@/lib/supabase";

type DbError = { code?: string; message: string } | null;

type QueryResponse = PromiseLike<{
  data: Record<string, unknown>[] | null;
  error: DbError;
}>;

/**
 * Narrow Supabase client interface used by `loadGroupStats`, so unit tests can
 * inject a fake client.
 */
export type GroupStatsClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): QueryResponse;
      in(column: string, values: string[]): QueryResponse;
    };
  };
};

/**
 * One posted (submitted or finalized) receipt in a group, in whole cents.
 * `title` is the store name entered on the receipt.
 */
export type StatsReceipt = {
  id: string;
  title: string;
  totalCents: number;
  taxCents: number;
  tipCents: number;
  status: string;
  createdAt: string;
};

/**
 * One line item on a posted receipt, in whole cents.
 */
export type StatsItem = {
  id: string;
  receiptId: string;
  name: string;
  amountCents: number;
};

/**
 * Shared receipt data for a group's Stats cards (US 4.1).
 */
export type GroupStats = {
  receipts: StatsReceipt[];
  items: StatsItem[];
};

/**
 * Result of `loadGroupStats`.
 */
export type GroupStatsResult =
  | { status: "ok"; stats: GroupStats }
  | { status: "error"; message: string };

/**
 * Options for `loadGroupStats`.
 */
export type GroupStatsOptions = {
  client?: GroupStatsClient | null;
};

/**
 * Money spent on one receipt date. `date` is a local `YYYY-MM-DD` day key.
 */
export type SpendingPoint = {
  date: string;
  totalCents: number;
};

/** Short month names for chart labels (avoids locale-dependent Intl output). */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Reads rows from a Supabase query or throws if it returned an error.
 * @param response Supabase query
 * @returns The rows (empty when there are none)
 */
async function unwrapRows(
  response: QueryResponse
): Promise<Record<string, unknown>[]> {
  const { data, error } = await response;
  if (error) throw new Error(error.message || "Failed to load stats.");
  return data ?? [];
}

/**
 * Turns a raw `receipts` row into a `StatsReceipt`.
 * @param row Raw database row
 * @returns The receipt in whole cents
 */
function toStatsReceipt(row: Record<string, unknown>): StatsReceipt {
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    totalCents: toWholeCents(row.total_cents) ?? 0,
    taxCents: toWholeCents(row.tax_cents) ?? 0,
    tipCents: toWholeCents(row.tip_cents) ?? 0,
    status: String(row.status ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

/**
 * Turns a raw `receipt_items` row into a `StatsItem`.
 * @param row Raw database row
 * @returns The item in whole cents
 */
function toStatsItem(row: Record<string, unknown>): StatsItem {
  return {
    id: String(row.id),
    receiptId: String(row.receipt_id),
    name: typeof row.name === "string" ? row.name : "",
    amountCents: toWholeCents(row.amount_cents) ?? 0,
  };
}

/**
 * Loads a group's submitted and finalized receipts and their items. This is
 * the one backend fetch shared by every Stats card; drafts are left out.
 * @param groupId Group to load
 * @param options Optional Supabase client override
 * @returns The group's stats data, or an error message
 */
export async function loadGroupStats(
  groupId: string,
  options?: GroupStatsOptions
): Promise<GroupStatsResult> {
  const client =
    options?.client !== undefined
      ? options.client
      : (SUPABASE as unknown as GroupStatsClient | null);
  if (!client) return { status: "error", message: NOT_CONFIGURED };

  try {
    const receiptRows = await unwrapRows(
      client
        .from("receipts")
        .select("id, title, total_cents, tax_cents, tip_cents, status, created_at")
        .eq("group_id", groupId)
    );
    const receipts = receiptRows
      .filter((row) => isPostedReceipt(row.status as string | null))
      .map(toStatsReceipt);

    let items: StatsItem[] = [];
    if (receipts.length > 0) {
      const itemRows = await unwrapRows(
        client
          .from("receipt_items")
          .select("id, receipt_id, name, amount_cents")
          .in(
            "receipt_id",
            receipts.map((r) => r.id)
          )
      );
      items = itemRows.map(toStatsItem);
    }

    return { status: "ok", stats: { receipts, items } };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Something went wrong",
    };
  }
}

/**
 * Local `YYYY-MM-DD` day key for a timestamp.
 * @param iso ISO timestamp
 * @returns Day key, or null when the timestamp can't be parsed
 */
export function toDayKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Formats a `YYYY-MM-DD` day key as a short label, e.g. `"Nov 3"`.
 * @param dayKey Day key from `toDayKey`
 * @returns Short date label
 */
export function formatDayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  return `${MONTHS[month - 1] ?? "?"} ${day}`;
}

/**
 * Adds up receipt totals per receipt date for the spending-over-time graph.
 * Receipts with an unreadable date are skipped.
 * @param receipts Posted receipts
 * @returns One point per date, oldest first
 */
export function buildSpendingOverTime(
  receipts: readonly StatsReceipt[]
): SpendingPoint[] {
  const totals = new Map<string, number>();
  for (const receipt of receipts) {
    const key = toDayKey(receipt.createdAt);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + receipt.totalCents);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalCents]) => ({ date, totalCents }));
}

/**
 * Total money spent across the given receipts.
 * @param receipts Posted receipts
 * @returns Sum of `totalCents`
 */
export function totalSpentCents(receipts: readonly StatsReceipt[]): number {
  return receipts.reduce((sum, r) => sum + r.totalCents, 0);
}
