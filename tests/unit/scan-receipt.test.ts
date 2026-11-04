/// <reference types="node" />
/**
 * Receipt scanning test screen: checks the totals math in
 * `src/lib/scan-receipt.ts`. The Azure call itself is checked by hand.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/scan-receipt.test.ts
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { checkReceipt, type ScannedReceipt } from "@/lib/scan-receipt";

/**
 * Builds a receipt with sensible defaults for each test to override.
 * @param overrides Fields to change
 * @returns A scanned receipt
 */
const receipt = (overrides: Partial<ScannedReceipt>): ScannedReceipt => ({
    merchant: "Cafe",
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

describe("checkReceipt", () => {
    test("matches when items + tax + tip equal the printed total", () => {
        const check = checkReceipt(receipt({
            items: [
                { description: "Latte", quantity: 1, price: 4.1, totalPrice: 4.1 },
                { description: "Bagel", quantity: 1, price: 3.2, totalPrice: 3.2 },
            ],
            tax: 0.66,
            tip: 1.5,
            total: 9.46,
        }));
        assert.equal(check.itemsSum, 7.3);
        assert.equal(check.computedTotal, 9.46);
        assert.equal(check.difference, 0);
        assert.equal(check.matches, true);
    });

    test("reports how far off the printed total is", () => {
        const check = checkReceipt(receipt({
            items: [{ description: "Soup", quantity: 1, price: 5, totalPrice: 5 }],
            tax: 0.5,
            total: 6,
        }));
        assert.equal(check.difference, 0.5);
        assert.equal(check.matches, false);
    });

    test("falls back to price x quantity when there's no line total", () => {
        const check = checkReceipt(receipt({
            items: [{ description: "Taco", quantity: 3, price: 2.25, totalPrice: null }],
            total: 6.75,
        }));
        assert.equal(check.itemsSum, 6.75);
        assert.equal(check.matches, true);
    });

    test("doesn't match when no total was read", () => {
        const check = checkReceipt(receipt({
            items: [{ description: "Tea", quantity: 1, price: 2, totalPrice: 2 }],
        }));
        assert.equal(check.difference, null);
        assert.equal(check.matches, false);
    });
});
