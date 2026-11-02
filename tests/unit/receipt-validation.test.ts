/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildReceipt,
  validateForDraft,
  validateForSubmit,
  type ReceiptDraft,
} from "@/lib/receipt-form";

/**
 * A draft that passes every check.
 */
const VALID_DRAFT: ReceiptDraft = {
  store: "Corner Market",
  items: [{ id: "a", name: "Milk", price: "5.00" }],
  tax: "0.50",
  tip: "",
};

describe("receipt validation (US 2.1 Task 3)", () => {
  it("accepts a complete receipt for submit", () => {
    assert.equal(validateForSubmit(VALID_DRAFT), null);
  });

  it("requires a store name to submit", () => {
    assert.equal(
      validateForSubmit({ ...VALID_DRAFT, store: "   " }),
      "Enter a store name."
    );
  });

  it("requires at least one item to submit", () => {
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [{ id: "a", name: "", price: "" }],
      }),
      "Add at least one item."
    );
  });

  it("requires every filled item to have a name and a price", () => {
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [{ id: "a", name: "", price: "3" }],
      }),
      "Every item needs a name."
    );
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [{ id: "a", name: "Milk", price: "" }],
      }),
      "Every item needs a price."
    );
  });

  it("ignores blank item rows when submitting", () => {
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [...VALID_DRAFT.items, { id: "b", name: "", price: "" }],
      }),
      null
    );
  });

  it("rejects unreadable amounts and a zero total", () => {
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [{ id: "a", name: "Milk", price: "abc" }],
      }),
      "Fix the amounts that are not numbers."
    );
    assert.equal(
      validateForSubmit({
        ...VALID_DRAFT,
        items: [{ id: "a", name: "Milk", price: "0" }],
        tax: "",
      }),
      "The total must be more than $0.00."
    );
  });

  it("lets a draft have just a store name", () => {
    assert.equal(
      validateForDraft({ store: "Costco", items: [], tax: "", tip: "" }),
      null
    );
  });

  it("requires a store name and readable amounts for a draft", () => {
    assert.equal(
      validateForDraft({ ...VALID_DRAFT, store: "" }),
      "Enter a store name to save a draft."
    );
    assert.equal(
      validateForDraft({ ...VALID_DRAFT, tax: "x" }),
      "Fix the amounts that are not numbers."
    );
  });

  it("builds a receipt record with trimmed title and total", () => {
    const receipt = buildReceipt(
      "r9",
      { ...VALID_DRAFT, store: "  Corner Market " },
      "draft",
      "2026-11-02T00:00:00.000Z"
    );
    assert.deepEqual(receipt, {
      id: "r9",
      title: "Corner Market",
      total_cents: 550,
      created_at: "2026-11-02T00:00:00.000Z",
      status: "draft",
    });
  });
});