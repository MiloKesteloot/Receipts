import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ScannedReceipt } from "@/lib/scan-receipt";
import {
  isEmptyScan,
  mapAzureResult,
} from "../../supabase/functions/scan-receipt/map-azure";

/**
 * Shaped like a real prebuilt-receipt result. To test with a real one, save the
 * JSON Azure returns (the object with `status: "succeeded"`) and use it here.
 */
const FULL_RESULT = {
  status: "succeeded",
  analyzeResult: {
    documents: [
      {
        confidence: 0.93,
        fields: {
          MerchantName: { valueString: "CAFE ROMA" },
          TransactionDate: { valueDate: "2026-10-30" },
          Items: {
            valueArray: [
              {
                valueObject: {
                  Description: { valueString: "Latte" },
                  Quantity: { valueNumber: 1 },
                  Price: { valueCurrency: { amount: 4.1, currencyCode: "USD" } },
                  TotalPrice: {
                    valueCurrency: { amount: 4.1, currencyCode: "USD" },
                  },
                },
              },
              {
                valueObject: {
                  Description: { content: "  Bagel  " },
                  Quantity: { valueNumber: 2 },
                  Price: { valueCurrency: { amount: 1.6, currencyCode: "USD" } },
                },
              },
            ],
          },
          Subtotal: { valueCurrency: { amount: 7.3, currencyCode: "USD" } },
          TotalTax: { valueCurrency: { amount: 0.66, currencyCode: "USD" } },
          Tip: { valueCurrency: { amount: 1.5, currencyCode: "USD" } },
          Total: { valueCurrency: { amount: 9.46, currencyCode: "USD" } },
        },
      },
    ],
  },
};

describe("mapAzureResult", () => {
  it("maps a full receipt", () => {
    assert.deepEqual(mapAzureResult(FULL_RESULT), {
      merchant: "CAFE ROMA",
      date: "2026-10-30",
      currency: "USD",
      items: [
        { description: "Latte", quantity: 1, price: 4.1, totalPrice: 4.1 },
        { description: "Bagel", quantity: 2, price: 1.6, totalPrice: null },
      ],
      subtotal: 7.3,
      tax: 0.66,
      tip: 1.5,
      total: 9.46,
      confidence: 0.93,
    });
  });

  it("returns nulls and no items when Azure found nothing", () => {
    assert.deepEqual(mapAzureResult({ analyzeResult: { documents: [] } }), {
      merchant: null,
      date: null,
      currency: null,
      items: [],
      subtotal: null,
      tax: null,
      tip: null,
      total: null,
      confidence: null,
    });
  });

  it("does not crash on an empty or malformed result", () => {
    assert.equal(mapAzureResult({}).items.length, 0);
    assert.equal(mapAzureResult(null).total, null);
    assert.equal(mapAzureResult(undefined).merchant, null);
  });

  it("uses an empty description, not a placeholder, when none was read", () => {
    const result = mapAzureResult({
      analyzeResult: {
        documents: [
          { fields: { Items: { valueArray: [{ valueObject: {} }, {}] } } },
        ],
      },
    });
    assert.deepEqual(
      result.items.map((item) => item.description),
      ["", ""],
    );
  });

  it("keeps a real zero amount instead of turning it into null", () => {
    const result = mapAzureResult({
      analyzeResult: {
        documents: [
          {
            fields: {
              TotalTax: { valueCurrency: { amount: 0, currencyCode: "USD" } },
              Tip: { valueNumber: 0 },
            },
          },
        ],
      },
    });
    assert.equal(result.tax, 0);
    assert.equal(result.tip, 0);
  });

  it("matches the app's ScannedReceipt type", () => {
    const scan: ScannedReceipt = mapAzureResult(FULL_RESULT);
    assert.equal(scan.items.length, 2);
  });
});

describe("isEmptyScan", () => {
  it("is true with no items and no total", () => {
    assert.equal(isEmptyScan(mapAzureResult({})), true);
  });

  it("is false with a total or with items", () => {
    assert.equal(isEmptyScan(mapAzureResult(FULL_RESULT)), false);
    const totalOnly = mapAzureResult({
      analyzeResult: {
        documents: [{ fields: { Total: { valueNumber: 5 } } }],
      },
    });
    assert.equal(isEmptyScan(totalOnly), false);
  });
});
