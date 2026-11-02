import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { mockGroupDetails } from "@/lib/mock";
import type { ReceiptDraft } from "@/lib/receipt-form";
import { saveReceipt } from "@/lib/receipts";

/**
 * Group used for saving. It starts with no receipts.
 */
const GROUP_ID = "mock-3";

/**
 * A draft that passes every check.
 */
const VALID_DRAFT: ReceiptDraft = {
  store: "Corner Market",
  items: [{ id: "a", name: "Milk", price: "5.00" }],
  tax: "0.50",
  tip: "",
};

describe("saveReceipt (US 2.1 Task 3)", () => {
  afterEach(() => {
    mockGroupDetails[GROUP_ID].receipts.length = 0;
  });

  it("submits a receipt into the group's list", async () => {
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", {
      useMock: true,
    });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.receipt.status, "submitted");
    assert.equal(result.receipt.title, "Corner Market");
    assert.equal(result.receipt.total_cents, 550);
    assert.equal(mockGroupDetails[GROUP_ID].receipts.length, 1);
  });

  it("saves a draft and puts the newest receipt first", async () => {
    await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { useMock: true });
    const result = await saveReceipt(
      GROUP_ID,
      { ...VALID_DRAFT, store: "Draft Store" },
      "draft",
      { useMock: true }
    );

    assert.equal(result.status, "ok");
    const receipts = mockGroupDetails[GROUP_ID].receipts;
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0].title, "Draft Store");
    assert.equal(receipts[0].status, "draft");
  });

  it("gives each receipt a unique id", async () => {
    await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { useMock: true });
    await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { useMock: true });

    const ids = mockGroupDetails[GROUP_ID].receipts.map((r) => r.id);
    assert.equal(new Set(ids).size, 2);
  });

  it("returns the validation message and saves nothing", async () => {
    const result = await saveReceipt(
      GROUP_ID,
      { ...VALID_DRAFT, store: "" },
      "submitted",
      { useMock: true }
    );

    assert.deepEqual(result, { status: "error", message: "Enter a store name." });
    assert.equal(mockGroupDetails[GROUP_ID].receipts.length, 0);
  });

  it("returns an error for an unknown group", async () => {
    const result = await saveReceipt("nope", VALID_DRAFT, "submitted", {
      useMock: true,
    });

    assert.deepEqual(result, { status: "error", message: "Group not found." });
  });

  it("returns an error and saves nothing when mock mode is off", async () => {
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", {
      useMock: false,
    });

    assert.equal(result.status, "error");
    assert.equal(mockGroupDetails[GROUP_ID].receipts.length, 0);
  });
});