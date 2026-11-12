/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateGuestTotalCents,
  claimItemAsGuest,
  createGuestClaimToken,
  extractToken,
  formatClaimUrl,
  getReceiptByGuestToken,
  type GuestReceiptDetail,
} from "@/lib/guest-claim";
import type { SUPABASE } from "@/lib/supabase";

/** Options for fake guest client. */
type FakeGuestClientOptions = {
  receiptDetail?: GuestReceiptDetail;
  rpcGetError?: { message: string } | null;
  claimResult?: { success: boolean; error?: string; message?: string };
};

/**
 * Creates a fake Supabase client for testing guest claim operations.
 * @param options Client responses and mock data
 * @returns Fake client, RPC calls, and inserted tokens
 */
function createFakeGuestClient(options?: FakeGuestClientOptions) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const insertedTokens: Record<string, unknown>[] = [];

  const client = {
    auth: {
      getUser() {
        return Promise.resolve({ data: { user: { id: "u1" } } });
      },
    },
    from(table: string) {
      if (table === "receipt_guest_tokens") {
        return {
          select() {
            return {
              eq() {
                return {
                  or() {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              maybeSingle() {
                                return Promise.resolve({ data: null, error: null });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertedTokens.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "get_receipt_by_guest_token") {
        if (options?.rpcGetError) {
          return Promise.resolve({ data: null, error: options.rpcGetError });
        }
        if (options?.receiptDetail) {
          return Promise.resolve({ data: options.receiptDetail, error: null });
        }
        return Promise.resolve({
          data: null,
          error: { message: "Invalid or expired claim token." },
        });
      }
      if (fn === "claim_item_as_guest") {
        if (options?.claimResult) {
          return Promise.resolve({ data: options.claimResult, error: null });
        }
        return Promise.resolve({
          data: {
            success: true,
            item_id: args.p_item_id,
            guest_name: args.p_guest_name,
            claimed: args.p_claimed,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as typeof SUPABASE;

  return { client, rpcCalls, insertedTokens };
}

describe("User Story 2.5: Guest Claim Service & Edge Cases with Supabase mock", () => {
  const sampleReceipt: GuestReceiptDetail = {
    token: "claim-r1-abc12345",
    receipt_id: "r1",
    title: "Costco run",
    total_cents: 3498,
    created_at: "2026-10-01T00:00:00Z",
    items: [
      {
        id: "item-r1-1",
        receipt_id: "r1",
        name: "Paper Towels",
        amount_cents: 2499,
        claims: [
          {
            user_id: "u1",
            guest_name: null,
            display_name: "Alex",
            is_guest: false,
          },
        ],
        is_shared: false,
        per_person_cents: 2499,
      },
      {
        id: "item-r1-2",
        receipt_id: "r1",
        name: "Avocados",
        amount_cents: 999,
        claims: [],
        is_shared: false,
        per_person_cents: 999,
      },
    ],
  };

  describe("Link & Token Generation", () => {
    it("creates a guest claim token and inserts it into database", async () => {
      const { client, insertedTokens } = createFakeGuestClient();
      const token = await createGuestClaimToken("r1", client);

      assert.ok(token.startsWith("claim-r1-"));
      assert.equal(insertedTokens.length, 1);
      assert.equal(insertedTokens[0].receipt_id, "r1");
      assert.equal(insertedTokens[0].token, token);
    });

    it("formats and extracts claim tokens from URLs", () => {
      const token = "claim-r1-abc12345";
      const url = formatClaimUrl(token);
      assert.ok(url.includes("/claim/claim-r1-abc12345"));
      assert.equal(extractToken(url), token);
      assert.equal(extractToken(token), token);
    });

    it("accepts full URL or bare token when looking up receipt", async () => {
      const { client, rpcCalls } = createFakeGuestClient({ receiptDetail: sampleReceipt });
      const token = "claim-r1-abc12345";
      const fullUrl = `https://receipts.app/claim/${token}`;

      const byToken = await getReceiptByGuestToken(token, client);
      const byUrl = await getReceiptByGuestToken(fullUrl, client);

      assert.equal(byToken.success, true);
      assert.equal(byUrl.success, true);
      if (byToken.success && byUrl.success) {
        assert.equal(byToken.receipt.receipt_id, "r1");
        assert.equal(byUrl.receipt.title, "Costco run");
      }
      assert.deepEqual(rpcCalls, [
        { fn: "get_receipt_by_guest_token", args: { p_token: token } },
        { fn: "get_receipt_by_guest_token", args: { p_token: token } },
      ]);
    });
  });

  describe("Token Validation & Expiration", () => {
    it("accessing with a non-existent or expired token fails gracefully", async () => {
      const { client } = createFakeGuestClient({
        rpcGetError: { message: "Invalid or expired claim token." },
      });
      const result = await getReceiptByGuestToken("non-existent-token", client);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_TOKEN");
        assert.match(result.message, /invalid or expired/i);
      }
    });

    it("empty token fails gracefully without calling RPC", async () => {
      const { client, rpcCalls } = createFakeGuestClient();
      const result = await getReceiptByGuestToken("", client);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_TOKEN");
      }
      assert.equal(rpcCalls.length, 0);
    });
  });

  describe("Guest Claim Recording", () => {
    it("calls claim_item_as_guest RPC and reports success", async () => {
      const { client, rpcCalls } = createFakeGuestClient();
      const res = await claimItemAsGuest("claim-r1-token", "item-r1-1", "Casey", true, client);

      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.item_id, "item-r1-1");
        assert.equal(res.guest_name, "Casey");
        assert.equal(res.claimed, true);
      }
      assert.deepEqual(rpcCalls, [
        {
          fn: "claim_item_as_guest",
          args: {
            p_token: "claim-r1-token",
            p_item_id: "item-r1-1",
            p_guest_name: "Casey",
            p_claimed: true,
          },
        },
      ]);
    });

    it("allows a guest to unclaim an item", async () => {
      const { client, rpcCalls } = createFakeGuestClient();
      const res = await claimItemAsGuest("claim-r1-token", "item-r1-1", "Casey", false, client);

      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.claimed, false);
      }
      assert.deepEqual(rpcCalls, [
        {
          fn: "claim_item_as_guest",
          args: {
            p_token: "claim-r1-token",
            p_item_id: "item-r1-1",
            p_guest_name: "Casey",
            p_claimed: false,
          },
        },
      ]);
    });

    it("empty guest names are rejected before RPC call", async () => {
      const { client, rpcCalls } = createFakeGuestClient();
      const emptyRes = await claimItemAsGuest("claim-r1-token", "item-1", "", true, client);
      assert.equal(emptyRes.success, false);
      if (!emptyRes.success) {
        assert.equal(emptyRes.error, "EMPTY_NAME");
      }

      const whitespaceRes = await claimItemAsGuest("claim-r1-token", "item-1", "   ", true, client);
      assert.equal(whitespaceRes.success, false);
      if (!whitespaceRes.success) {
        assert.equal(whitespaceRes.error, "EMPTY_NAME");
      }
      assert.equal(rpcCalls.length, 0);
    });
  });

  describe("Split Calculations & Running Totals", () => {
    it("calculates accurate running total across multiple claimed items", () => {
      const items = [
        {
          id: "item-1",
          receipt_id: "r1",
          name: "Item 1",
          amount_cents: 2499,
          claims: [
            { display_name: "Alex", is_guest: false },
            { guest_name: "Avery", display_name: "Avery", is_guest: true },
          ],
          is_shared: true,
          per_person_cents: 1250,
        },
        {
          id: "item-2",
          receipt_id: "r1",
          name: "Item 2",
          amount_cents: 499,
          claims: [
            { display_name: "Sam", is_guest: false },
            { guest_name: "Avery", display_name: "Avery", is_guest: true },
          ],
          is_shared: true,
          per_person_cents: 250,
        },
        {
          id: "item-3",
          receipt_id: "r1",
          name: "Item 3",
          amount_cents: 999,
          claims: [{ guest_name: "Avery", display_name: "Avery", is_guest: true }],
          is_shared: false,
          per_person_cents: 999,
        },
      ];

      const total = calculateGuestTotalCents(items, "Avery");
      assert.equal(total, 1250 + 250 + 999);
      assert.equal(total, 2499);
    });
  });
});
