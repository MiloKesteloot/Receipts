/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_SCAN_BYTES,
  ScanReceiptError,
  scanReceiptPhoto,
} from "@/lib/scan-flow";
import type { ScannedReceipt } from "@/lib/scan-receipt";

/**
 * Builds a complete scanner result with optional overrides.
 * @param overrides Fields to replace in the default result
 * @returns A complete scanned receipt
 */
const scanned = (overrides: Partial<ScannedReceipt> = {}): ScannedReceipt => ({
  merchant: "Cafe",
  date: null,
  currency: "USD",
  items: [{ description: "Tea", quantity: 1, price: 2, totalPrice: 2 }],
  subtotal: 2,
  tax: null,
  tip: null,
  total: 2,
  confidence: 0.9,
  ...overrides,
});

/**
 * Creates the smallest Supabase client shape needed by the scan helper.
 * @param invoke Mock function invocation implementation
 * @returns A client-shaped mock
 */
const clientWith = (invoke: () => Promise<unknown>) =>
  ({ functions: { invoke } }) as never;

describe("scanReceiptPhoto", () => {
  test("rejects a missing or oversized photo before calling Supabase", async () => {
    let calls = 0;
    const client = clientWith(async () => {
      calls += 1;
      return { data: scanned(), error: null };
    });

    await assert.rejects(
      scanReceiptPhoto("", client),
      (error: unknown) =>
        error instanceof ScanReceiptError && error.code === "missing-photo",
    );
    await assert.rejects(
      scanReceiptPhoto("a".repeat(Math.ceil((MAX_SCAN_BYTES / 0.75) + 1)), client),
      (error: unknown) =>
        error instanceof ScanReceiptError && error.code === "photo-too-large",
    );
    assert.equal(calls, 0);
  });

  test("turns an empty result into a retake error", async () => {
    const client = clientWith(async () => ({
      data: scanned({ items: [], total: null }),
      error: null,
    }));

    await assert.rejects(
      scanReceiptPhoto("photo", client),
      (error: unknown) =>
        error instanceof ScanReceiptError && error.code === "empty-scan",
    );
  });

  test("retries a scanner failure once", async () => {
    let calls = 0;
    const client = clientWith(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return { data: scanned(), error: null };
    });

    const result = await scanReceiptPhoto("photo", client);
    assert.equal(result.merchant, "Cafe");
    assert.equal(calls, 2);
  });
});
