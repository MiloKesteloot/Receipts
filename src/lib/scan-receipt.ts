import type { SupabaseClient } from "@supabase/supabase-js";

export type ScannedItem = {
  description: string;
  quantity: number | null;
  price: number | null;
  totalPrice: number | null;
};

/**
 * What the `scan-receipt` Edge Function returns. Amounts are in dollars;
 * any field Azure couldn't find is null.
 */
export type ScannedReceipt = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  items: ScannedItem[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  confidence: number | null;
};

export type ReceiptCheck = {
  itemsSum: number;
  computedTotal: number;
  /** Printed total minus computed total, or null if no total was read. */
  difference: number | null;
  matches: boolean;
};

/**
 * True when the scanner found no line items and no printed total.
 * @param receipt Receipt returned by the scan function
 * @returns Whether the photo should be retaken
 */
export function isEmptyScan(receipt: ScannedReceipt): boolean {
  return receipt.items.length === 0 && receipt.total === null;
}

/**
 * Sends a base64 JPEG to the `scan-receipt` Edge Function.
 * @param base64 Image data, without the `data:` prefix
 * @param client Supabase client
 * @returns The parsed receipt
 */
export async function scanReceipt(
  base64: string,
  client: SupabaseClient | null,
): Promise<ScannedReceipt> {
  if (!client) throw new Error("Supabase isn't configured");

  const { data, error } = await client.functions.invoke<ScannedReceipt>(
    "scan-receipt",
    { body: { base64 } },
  );
  if (error) {
    // The function's own error message is in the response body.
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  if (!data) throw new Error("Empty response from scanner");
  return data;
}

/**
 * Converts dollars to whole cents so sums don't drift.
 * @param dollars Amount in dollars
 * @returns Amount in cents
 */
export const toCents = (dollars: number | null): number =>
  Math.round((dollars ?? 0) * 100);

/**
 * Line total for one item: TotalPrice, else Price x Quantity, else Price.
 * @param item Scanned line item
 * @returns Line total in cents
 */
export const itemCents = (item: ScannedItem): number => {
  if (item.totalPrice !== null) return toCents(item.totalPrice);
  return toCents((item.price ?? 0) * (item.quantity ?? 1));
};

/**
 * Adds up items + tax + tip and compares it to the printed total.
 * @param receipt Scanned receipt
 * @returns Sums in dollars and whether they match to the cent
 */
export function checkReceipt(receipt: ScannedReceipt): ReceiptCheck {
  const itemsCents = receipt.items.reduce((sum, it) => sum + itemCents(it), 0);
  const computedCents =
    itemsCents + toCents(receipt.tax) + toCents(receipt.tip);
  const diffCents =
    receipt.total === null ? null : toCents(receipt.total) - computedCents;

  return {
    itemsSum: itemsCents / 100,
    computedTotal: computedCents / 100,
    difference: diffCents === null ? null : diffCents / 100,
    matches: diffCents === 0,
  };
}
