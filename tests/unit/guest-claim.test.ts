/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  calculateGuestTotalCents,
  claimItemAsGuest,
  createGuestClaimLink,
  createGuestClaimToken,
  extractToken,
  formatClaimUrl,
  getReceiptByGuestToken,
} from "@/lib/guest-claim";
import {
  mockGuestTokens,
  mockItemClaims,
  type MockGuestToken,
  type MockItemClaim,
} from "@/lib/mock";

describe("User Story 2.5: Guest Claim Service & Edge Cases", () => {
  let savedTokens: MockGuestToken[];
  let savedClaims: MockItemClaim[];

  beforeEach(() => {
    // Snapshot in-memory mock collections
    savedTokens = mockGuestTokens.map((t) => ({ ...t }));
    savedClaims = mockItemClaims.map((c) => ({ ...c }));
  });

  afterEach(() => {
    // Restore in-memory mock collections so tests run idempotently
    mockGuestTokens.length = 0;
    mockGuestTokens.push(...savedTokens);
    mockItemClaims.length = 0;
    mockItemClaims.push(...savedClaims);
  });

  describe("Link & Token Generation", () => {
    it("generating multiple links for the same receipt returns valid and distinct tokens", async () => {
      const link1 = await createGuestClaimLink("r1");
      const link2 = await createGuestClaimLink("r1");

      assert.ok(link1.includes("/claim/"), "Link 1 must format with web claim route");
      assert.ok(link2.includes("/claim/"), "Link 2 must format with web claim route");
      assert.notEqual(link1, link2, "Multiple calls must generate distinct tokens");

      const token1 = extractToken(link1);
      const token2 = extractToken(link2);
      assert.ok(token1.length > 5, "Token 1 must not be empty");
      assert.ok(token2.length > 5, "Token 2 must not be empty");

      // Verify both tokens resolve the receipt
      const res1 = await getReceiptByGuestToken(token1);
      const res2 = await getReceiptByGuestToken(token2);

      assert.equal(res1.success, true);
      assert.equal(res2.success, true);
      if (res1.success && res2.success) {
        assert.equal(res1.receipt.receipt_id, "r1");
        assert.equal(res2.receipt.receipt_id, "r1");
        assert.equal(res1.receipt.title, "Costco run");
        assert.equal(res2.receipt.title, "Costco run");
      }
    });

    it("accepts full URL or bare token when looking up receipt", async () => {
      const token = await createGuestClaimToken("r1");
      const fullUrl = formatClaimUrl(token);

      const byToken = await getReceiptByGuestToken(token);
      const byUrl = await getReceiptByGuestToken(fullUrl);

      assert.equal(byToken.success, true);
      assert.equal(byUrl.success, true);
      if (byToken.success && byUrl.success) {
        assert.equal(byToken.receipt.token, token);
        assert.equal(byUrl.receipt.token, token);
      }
    });
  });

  describe("Token Validation & Expiration", () => {
    it("accessing with a non-existent token fails gracefully", async () => {
      const result = await getReceiptByGuestToken("mock-non-existent-token-xyz");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_TOKEN");
        assert.ok(result.message.length > 0);
      }
    });

    it("accessing with an expired token fails gracefully", async () => {
      const expiredToken = "mock-expired-token-123";
      mockGuestTokens.push({
        token: expiredToken,
        receipt_id: "r1",
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      });

      const result = await getReceiptByGuestToken(expiredToken);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EXPIRED_TOKEN");
        assert.ok(result.message.toLowerCase().includes("expired"));
      }

      // Claiming with expired token also fails
      const claimResult = await claimItemAsGuest(
        expiredToken,
        "item-r1-1",
        "Guest Jordan"
      );
      assert.equal(claimResult.success, false);
      if (!claimResult.success) {
        assert.equal(claimResult.error, "EXPIRED_TOKEN");
      }
    });

    it("empty token fails gracefully", async () => {
      const result = await getReceiptByGuestToken("");
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_TOKEN");
      }
    });
  });

  describe("Guest Claim Recording & Member Claim Preservation", () => {
    it("guest claims properly record the guest's name and don't overwrite registered member claims", async () => {
      const token = await createGuestClaimToken("r1");

      // Verify item-r1-1 initially has Alex's claim
      const initial = await getReceiptByGuestToken(token);
      assert.equal(initial.success, true);
      if (!initial.success) return;

      const itemBefore = initial.receipt.items.find((i) => i.id === "item-r1-1");
      assert.ok(itemBefore, "item-r1-1 must exist");
      const initialClaimants = itemBefore.claims;
      assert.equal(initialClaimants.length, 1);
      assert.equal(initialClaimants[0].display_name, "Alex");
      assert.equal(initialClaimants[0].is_guest, false);

      // Guest "Casey" claims item-r1-1
      const claimRes = await claimItemAsGuest(token, "item-r1-1", "Casey");
      assert.equal(claimRes.success, true);
      if (claimRes.success) {
        assert.equal(claimRes.item_id, "item-r1-1");
        assert.equal(claimRes.guest_name, "Casey");
        assert.equal(claimRes.claimed, true);
      }

      // Inspect updated receipt
      const updated = await getReceiptByGuestToken(token);
      assert.equal(updated.success, true);
      if (!updated.success) return;

      const itemAfter = updated.receipt.items.find((i) => i.id === "item-r1-1");
      assert.ok(itemAfter);
      assert.equal(itemAfter.claims.length, 2, "Item must now have 2 claims");

      // Verify Alex's registered user claim was preserved
      const alexClaim = itemAfter.claims.find((c) => c.user_id === "u1");
      assert.ok(alexClaim, "Alex's registered claim must still exist");
      assert.equal(alexClaim.display_name, "Alex");
      assert.equal(alexClaim.is_guest, false);

      // Verify Casey's guest claim was added
      const caseyClaim = itemAfter.claims.find((c) => c.guest_name === "Casey");
      assert.ok(caseyClaim, "Casey's guest claim must exist");
      assert.equal(caseyClaim.display_name, "Casey");
      assert.equal(caseyClaim.is_guest, true);
    });

    it("allows a guest to unclaim an item without affecting member claims", async () => {
      const token = await createGuestClaimToken("r1");

      // Guest claims item-r1-1
      await claimItemAsGuest(token, "item-r1-1", "Taylor", true);
      let res = await getReceiptByGuestToken(token);
      assert.equal(res.success, true);
      if (!res.success) return;
      let item = res.receipt.items.find((i) => i.id === "item-r1-1");
      assert.equal(item?.claims.length, 2);

      // Guest unclaims item-r1-1
      const unclaimRes = await claimItemAsGuest(token, "item-r1-1", "Taylor", false);
      assert.equal(unclaimRes.success, true);

      res = await getReceiptByGuestToken(token);
      assert.equal(res.success, true);
      if (!res.success) return;
      item = res.receipt.items.find((i) => i.id === "item-r1-1");
      assert.equal(item?.claims.length, 1);
      assert.equal(item?.claims[0].display_name, "Alex");
    });
  });

  describe("Split Calculations & Running Totals", () => {
    it("an item claimed by both a guest and a registered user shows as shared and divides cents accurately", async () => {
      const token = await createGuestClaimToken("r1");

      // item-r1-1: amount_cents = 2499 ($24.99)
      // Already claimed by Alex (member)
      await claimItemAsGuest(token, "item-r1-1", "Morgan");

      const res = await getReceiptByGuestToken(token);
      assert.equal(res.success, true);
      if (!res.success) return;

      const item = res.receipt.items.find((i) => i.id === "item-r1-1");
      assert.ok(item);
      assert.equal(item.is_shared, true, "Item claimed by Alex and Morgan must be marked shared");
      assert.equal(item.claims.length, 2);
      // 2499 cents divided evenly between 2 people = 1250 cents ($12.50)
      assert.equal(item.per_person_cents, Math.round(2499 / 2));
      assert.equal(item.per_person_cents, 1250);

      // Running total for Morgan should be 1250 cents
      const morganTotal = calculateGuestTotalCents(res.receipt.items, "Morgan");
      assert.equal(morganTotal, 1250);
    });

    it("calculates accurate running total across multiple claimed items", async () => {
      const token = await createGuestClaimToken("r1");

      // Claim item-r1-1 (2499 cents, shared with Alex -> 1250 cents)
      await claimItemAsGuest(token, "item-r1-1", "Avery");
      // Claim item-r1-4 (Rotisserie Chicken: 499 cents, shared with Sam -> 250 cents)
      await claimItemAsGuest(token, "item-r1-4", "Avery");
      // Claim item-r1-3 (Organic Avocados: 999 cents, unshared -> 999 cents)
      await claimItemAsGuest(token, "item-r1-3", "Avery");

      const res = await getReceiptByGuestToken(token);
      assert.equal(res.success, true);
      if (!res.success) return;

      const total = calculateGuestTotalCents(res.receipt.items, "Avery");
      // 1250 + 250 + 999 = 2499 cents ($24.99)
      assert.equal(total, 1250 + 250 + 999);
      assert.equal(total, 2499);
    });
  });

  describe("Validation & Rejections", () => {
    it("empty guest names are rejected before claiming", async () => {
      const token = await createGuestClaimToken("r1");

      const emptyRes = await claimItemAsGuest(token, "item-r1-1", "");
      assert.equal(emptyRes.success, false);
      if (!emptyRes.success) {
        assert.equal(emptyRes.error, "EMPTY_NAME");
      }

      const whitespaceRes = await claimItemAsGuest(token, "item-r1-1", "   ");
      assert.equal(whitespaceRes.success, false);
      if (!whitespaceRes.success) {
        assert.equal(whitespaceRes.error, "EMPTY_NAME");
      }

      // Assert that no new claim was added
      const res = await getReceiptByGuestToken(token);
      assert.equal(res.success, true);
      if (res.success) {
        const item = res.receipt.items.find((i) => i.id === "item-r1-1");
        assert.equal(item?.claims.length, 1);
        assert.equal(item?.claims[0].display_name, "Alex");
      }
    });

    it("claiming a non-existent item fails with ITEM_NOT_FOUND", async () => {
      const token = await createGuestClaimToken("r1");

      const result = await claimItemAsGuest(token, "fake-item-id-999", "Riley");
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "ITEM_NOT_FOUND");
      }
    });
  });
});
