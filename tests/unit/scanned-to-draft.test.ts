import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTotals } from "@/lib/receipt-form";
import type { ScannedReceipt } from "@/lib/scan-receipt";
import { scannedToDraft } from "@/lib/scanned-to-draft";

/**
 * Builds a receipt with sensible defaults for each test to override.
 * @param overrides Fields to change
 * @returns A scanned receipt
 */
const receipt = (overrides: Partial<ScannedReceipt>): ScannedReceipt => ({
  merchant: "CAFE ROMA",
  date: null,
  currency: "USD",
  items: [],
  subtotal: null,
  tax: null,
  tip: null,
  total: null,
  confidence: null,
  ...overrides,
});

describe("scannedToDraft", () => {
  it("fills the form with tidy text and two-decimal amounts", () => {
    const { draft, notes } = scannedToDraft(
      receipt({
        items: [
          { description: "LATTE", quantity: 1, price: 4.1, totalPrice: 4.1 },
          { description: "BAGEL", quantity: 1, price: 3.2, totalPrice: 3.2 },
        ],
        tax: 0.66,
        tip: 1.5,
        total: 9.46,
      }),
    );
    assert.deepEqual(draft, {
      store: "Cafe Roma",
      items: [
        { id: "item-1", name: "Latte", price: "4.10" },
        { id: "item-2", name: "Bagel", price: "3.20" },
      ],
      tax: "0.66",
      tip: "1.50",
    });
    assert.deepEqual(notes, []);
  });

  it("produces a draft whose total equals the printed total", () => {
    const { draft } = scannedToDraft(
      receipt({
        items: [
          { description: "Latte", quantity: 1, price: 4.1, totalPrice: 4.1 },
          { description: "Bagel", quantity: 1, price: 3.2, totalPrice: 3.2 },
        ],
        tax: 0.66,
        tip: 1.5,
        total: 9.46,
      }),
    );
    const totals = computeTotals(draft);
    assert.equal(totals.invalid, false);
    assert.equal(totals.totalCents, 946);
  });

  it("uses price x quantity when there is no line total", () => {
    const { draft } = scannedToDraft(
      receipt({
        items: [
          { description: "Taco", quantity: 3, price: 2.25, totalPrice: null },
        ],
      }),
    );
    assert.deepEqual(draft.items, [
      { id: "item-1", name: "Taco ×3", price: "6.75" },
    ]);
  });

  it("leaves a price blank and adds a note when none was read", () => {
    const { draft, notes } = scannedToDraft(
      receipt({
        items: [
          { description: "Tea", quantity: 1, price: null, totalPrice: null },
          { description: "Soup", quantity: 1, price: null, totalPrice: null },
        ],
      }),
    );
    assert.deepEqual(
      draft.items.map((item) => item.price),
      ["", ""],
    );
    assert.deepEqual(notes, ["2 items have no price. Fill them in."]);
  });

  it("uses singular wording for a single missing price", () => {
    const { notes } = scannedToDraft(
      receipt({
        items: [
          { description: "Tea", quantity: 1, price: null, totalPrice: null },
        ],
      }),
    );
    assert.deepEqual(notes, ["1 item has no price. Fill it in."]);
  });

  it("keeps a discount as negative text and adds a note", () => {
    const { draft, notes } = scannedToDraft(
      receipt({
        items: [
          { description: "Coupon", quantity: 1, price: -1.5, totalPrice: -1.5 },
        ],
      }),
    );
    assert.equal(draft.items[0].price, "-1.50");
    assert.equal(notes.length, 1);
    assert.match(notes[0], /discount/);
  });

  it("uses blanks for anything the scanner did not read", () => {
    const { draft } = scannedToDraft(receipt({ merchant: null }));
    assert.deepEqual(draft, { store: "", items: [], tax: "", tip: "" });
  });

  it("gives each item a unique id", () => {
    const { draft } = scannedToDraft(
      receipt({
        items: [
          { description: "A", quantity: 1, price: 1, totalPrice: 1 },
          { description: "B", quantity: 1, price: 2, totalPrice: 2 },
          { description: "C", quantity: 1, price: 3, totalPrice: 3 },
        ],
      }),
    );
    assert.equal(new Set(draft.items.map((item) => item.id)).size, 3);
  });
});
