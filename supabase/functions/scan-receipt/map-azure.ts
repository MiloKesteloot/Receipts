// Pure mapping from Azure Document Intelligence's prebuilt-receipt result to the
// flat JSON the app expects.
//
// Keep this file free of Deno and Node APIs so tests/unit/map-azure.test.ts can
// import it. Keep the types in sync with src/lib/scan-receipt.ts; the test checks
// that the output is assignable to the app's ScannedReceipt type.

export type ScannedItem = {
  description: string;
  quantity: number | null;
  price: number | null;
  totalPrice: number | null;
};

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

// deno-lint-ignore no-explicit-any
type Field = any;

const amount = (f: Field): number | null =>
  f?.valueCurrency?.amount ?? f?.valueNumber ?? null;

// An item with no readable description becomes "" (not a placeholder), so the
// form's "Every item needs a name" check still catches it.
const description = (f: Field): string =>
  String(f?.valueString ?? f?.content ?? "").trim();

/**
 * Turns a finished Azure analysis result into the app's ScannedReceipt shape.
 * Anything Azure did not find becomes null (or "" for an item description).
 */
export function mapAzureResult(result: Field): ScannedReceipt {
  const doc = result?.analyzeResult?.documents?.[0];
  const fields = doc?.fields ?? {};

  const items: ScannedItem[] = (fields.Items?.valueArray ?? []).map(
    (it: Field) => {
      const o = it?.valueObject ?? {};
      return {
        description: description(o.Description),
        quantity: o.Quantity?.valueNumber ?? null,
        price: amount(o.Price),
        totalPrice: amount(o.TotalPrice),
      };
    },
  );

  return {
    merchant: fields.MerchantName?.valueString ?? null,
    date: fields.TransactionDate?.valueDate ?? null,
    currency: fields.Total?.valueCurrency?.currencyCode ?? null,
    items,
    subtotal: amount(fields.Subtotal),
    tax: amount(fields.TotalTax),
    tip: amount(fields.Tip),
    total: amount(fields.Total),
    confidence: doc?.confidence ?? null,
  };
}

/**
 * True when nothing useful was read: no line items and no total. The function
 * can use this to ask for a retake instead of returning an empty receipt.
 */
export function isEmptyScan(scan: ScannedReceipt): boolean {
  return scan.items.length === 0 && scan.total === null;
}
