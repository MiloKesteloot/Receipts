import {
  centsToInput,
  cleanItemName,
  cleanMerchant,
} from "@/lib/format-scan";
import type { ReceiptDraft, ReceiptItemDraft } from "@/lib/receipt-form";
import {
  itemCents,
  toCents,
  type ScannedItem,
  type ScannedReceipt,
} from "@/lib/scan-receipt";

export type ScannedDraft = {
  draft: ReceiptDraft;
  /** Things the user should check before submitting, in plain language. */
  notes: string[];
};

/**
 * Price text for one scanned item: its line total, or "" if none was read.
 * @param item Scanned line item
 * @returns Text such as "6.75", or "" so the user must fill it in
 */
function itemPrice(item: ScannedItem): string {
  if (item.totalPrice === null && item.price === null) return "";
  return centsToInput(itemCents(item));
}

/**
 * Turns a scan into a draft for the receipt form, with notes about anything
 * the user needs to fix by hand. Negative lines (discounts) are kept as
 * negative text so the amount is not lost; the form flags them until the
 * team decides how discounts work.
 * @param scan Receipt returned by the scan-receipt function
 * @returns The prefilled draft and a list of notes
 */
export function scannedToDraft(scan: ScannedReceipt): ScannedDraft {
  const items: ReceiptItemDraft[] = scan.items.map((item, i) => ({
    id: `item-${i + 1}`,
    name: cleanItemName(item.description, item.quantity),
    price: itemPrice(item),
  }));

  const notes: string[] = [];

  const unpriced = items.filter((item) => item.price === "").length;
  if (unpriced > 0) {
    notes.push(
      unpriced === 1
        ? "1 item has no price. Fill it in."
        : `${unpriced} items have no price. Fill them in.`,
    );
  }

  const negative = items.filter((item) => item.price.startsWith("-")).length;
  if (negative > 0) {
    notes.push(
      negative === 1
        ? "1 line looks like a discount. The form does not accept negative amounts yet, so fix it before submitting."
        : `${negative} lines look like discounts. The form does not accept negative amounts yet, so fix them before submitting.`,
    );
  }

  return {
    draft: {
      store: cleanMerchant(scan.merchant),
      items,
      tax: scan.tax === null ? "" : centsToInput(toCents(scan.tax)),
      tip: scan.tip === null ? "" : centsToInput(toCents(scan.tip)),
    },
    notes,
  };
}
