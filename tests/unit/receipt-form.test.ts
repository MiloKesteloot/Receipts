import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    computeTotals,
    createEmptyItem,
    formatCents,
    parseCents,
} from "@/lib/receipt-form";

describe("receipt form helpers (US 2.1 Task 2)", () => {
  it("parses valid amounts to integer cents", () => {
    assert.equal(parseCents("12"), 1200);
    assert.equal(parseCents("12.5"), 1250);
    assert.equal(parseCents("12.50"), 1250);
    assert.equal(parseCents("$3.07"), 307);
    assert.equal(parseCents(".5"), 50);
    assert.equal(parseCents("12."), 1200);
    assert.equal(parseCents("  8.25  "), 825);
  });

  it("rejects invalid amounts", () => {
    assert.equal(parseCents(""), null);
    assert.equal(parseCents("abc"), null);
    assert.equal(parseCents("1.234"), null);
    assert.equal(parseCents("-5"), null);
    assert.equal(parseCents("1,000"), null);
  });

  it("formats cents as dollars", () => {
    assert.equal(formatCents(0), "$0.00");
    assert.equal(formatCents(1766), "$17.66");
    assert.equal(formatCents(8423), "$84.23");
  });

  it("creates a blank item with the given id", () => {
    assert.deepEqual(createEmptyItem("item-9"), {
      id: "item-9",
      name: "",
      price: "",
    });
  });

  it("totals items, tax and tip", () => {
    const totals = computeTotals({
      store: "Costco",
      items: [
        { id: "a", name: "Milk", price: "10.00" },
        { id: "b", name: "Eggs", price: "4.50" },
      ],
      tax: "1.16",
      tip: "2",
    });
    assert.equal(totals.subtotalCents, 1450);
    assert.equal(totals.taxCents, 116);
    assert.equal(totals.tipCents, 200);
    assert.equal(totals.totalCents, 1766);
    assert.equal(totals.invalid, false);
  });

  it("treats empty fields as zero without flagging them", () => {
    const totals = computeTotals({
      store: "",
      items: [createEmptyItem("a")],
      tax: "",
      tip: "",
    });
    assert.equal(totals.totalCents, 0);
    assert.equal(totals.invalid, false);
  });

  it("flags unreadable amounts and counts them as zero", () => {
    const totals = computeTotals({
      store: "",
      items: [
        { id: "a", name: "", price: "abc" },
        { id: "b", name: "", price: "5" },
      ],
      tax: "",
      tip: "",
    });
    assert.equal(totals.subtotalCents, 500);
    assert.equal(totals.invalid, true);
  });
});