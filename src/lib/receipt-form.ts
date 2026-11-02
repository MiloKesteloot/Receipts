/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Pure helpers for the add-receipt form (US 2.1 Task 2).
 * Money is typed as text by the user and converted to integer cents here.
 */

export type ReceiptItemDraft = {
  id: string;
  name: string;
  price: string;
};

export type ReceiptDraft = {
  store: string;
  items: ReceiptItemDraft[];
  tax: string;
  tip: string;
};

export type ReceiptTotals = {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  /** True when any non-empty amount could not be read as money. */
  invalid: boolean;
};

/**
 * Converts text such as "12", "12.5", "$12.50" or ".5" to integer cents.
 * @param input Text typed by the user
 * @returns Cents, or null when the text is not a valid amount
 */
export function parseCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "");
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  return Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
}

/**
 * Formats integer cents as a dollar string.
 * @param cents Amount in cents
 * @returns Formatted currency string, e.g. "$12.50"
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Creates a blank item row.
 * @param id Unique id for the row
 * @returns An item with empty name and price
 */
export function createEmptyItem(id: string): ReceiptItemDraft {
  return { id, name: "", price: "" };
}

/**
 * Reads one amount field. Empty text counts as zero and is not an error.
 * @param text Field text
 * @returns Cents (0 when empty or invalid) and whether the text was invalid
 */
function readAmount(text: string): { cents: number; invalid: boolean } {
  if (text.trim() === "") return { cents: 0, invalid: false };
  const cents = parseCents(text);
  return cents === null
    ? { cents: 0, invalid: true }
    : { cents, invalid: false };
}

/**
 * Computes subtotal, tax, tip and total for a receipt draft.
 * @param draft The receipt being entered
 * @returns Totals in cents plus an invalid flag
 */
export function computeTotals(draft: ReceiptDraft): ReceiptTotals {
  let invalid = false;
  let subtotalCents = 0;

  for (const item of draft.items) {
    const amount = readAmount(item.price);
    subtotalCents += amount.cents;
    invalid = invalid || amount.invalid;
  }

  const tax = readAmount(draft.tax);
  const tip = readAmount(draft.tip);
  invalid = invalid || tax.invalid || tip.invalid;

  return {
    subtotalCents,
    taxCents: tax.cents,
    tipCents: tip.cents,
    totalCents: subtotalCents + tax.cents + tip.cents,
    invalid,
  };
}

export type ReceiptStatus = "draft" | "submitted";

export type ReceiptRecord = {
  id: string;
  title: string;
  total_cents: number;
  created_at: string;
  status: ReceiptStatus;
  draft?: ReceiptDraft;
};

/**
 * Checks whether a draft can be saved as a draft.
 * @param draft The receipt being entered
 * @returns An error message, or null when the draft can be saved
 */
export function validateForDraft(draft: ReceiptDraft): string | null {
  if (draft.store.trim() === "") return "Enter a store name to save a draft.";
  if (computeTotals(draft).invalid) {
    return "Fix the amounts that are not numbers.";
  }
  return null;
}

/**
 * Checks whether a draft can be submitted. Blank item rows are ignored.
 * @param draft The receipt being entered
 * @returns The first problem found, or null when it can be submitted
 */
export function validateForSubmit(draft: ReceiptDraft): string | null {
  if (draft.store.trim() === "") return "Enter a store name.";

  const filled = draft.items.filter(
    (item) => item.name.trim() !== "" || item.price.trim() !== ""
  );
  if (filled.length === 0) return "Add at least one item.";

  for (const item of filled) {
    if (item.name.trim() === "") return "Every item needs a name.";
    if (item.price.trim() === "") return "Every item needs a price.";
  }

  const totals = computeTotals(draft);
  if (totals.invalid) return "Fix the amounts that are not numbers.";
  if (totals.totalCents <= 0) return "The total must be more than $0.00.";
  return null;
}

/**
 * Turns a draft into a receipt record ready to store.
 * @param id Unique id for the receipt
 * @param draft The receipt as entered
 * @param status Whether it is a draft or submitted
 * @param createdAt ISO timestamp
 * @returns The receipt record
 */
export function buildReceipt(
  id: string,
  draft: ReceiptDraft,
  status: ReceiptStatus,
  createdAt: string
): ReceiptRecord {
  const record: ReceiptRecord = {
    id,
    title: draft.store.trim(),
    total_cents: computeTotals(draft).totalCents,
    created_at: createdAt,
    status,
  };
  if (status === "draft") {
    record.draft = {
      store: draft.store,
      items: draft.items.map((item) => ({ ...item })),
      tax: draft.tax,
      tip: draft.tip,
    };
  }
  return record;
}