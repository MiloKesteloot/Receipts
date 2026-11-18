/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.3, Task 2: storing tax/tip, the finalize_receipt RPC client,
 * the finalize migration, and counting finalized receipts on Home.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { finalizeReceipt, type FinalizeClient } from "@/lib/finalize-receipt";
import {
  buildGroupOverviewCards,
  calculateUserBalances,
  isPostedReceipt,
  type OverviewReceiptRow,
} from "@/lib/home-overview";
import type { ReceiptDraft } from "@/lib/receipt-form";
import { saveReceipt } from "@/lib/receipts";
import type { SUPABASE } from "@/lib/supabase";

/** A receipt with $15 + $5 of items, $2 tax and $4 tip. */
const DRAFT: ReceiptDraft = {
  store: "Diner",
  items: [
    { id: "a", name: "Burger", price: "15.00" },
    { id: "b", name: "Fries", price: "5.00" },
  ],
  tax: "2.00",
  tip: "4.00",
};

type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A fake client whose `rpc` records its calls and answers with `answer`.
 * @param answer What every RPC call returns, or a function that throws
 * @returns The client and its recorded calls
 */
function fakeRpcClient(answer: RpcAnswer | (() => never)) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: FinalizeClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (typeof answer === "function") return Promise.resolve().then(answer);
      return Promise.resolve(answer);
    },
  };
  return { client, calls };
}

/**
 * A fake Supabase client that records receipt inserts and updates.
 * @returns The client and the payloads written to `receipts`
 */
function fakeSaveClient() {
  const written: Record<string, unknown>[] = [];
  const single = (payload: Record<string, unknown>) =>
    Promise.resolve({
      data: { id: "r1", created_at: "2026-11-17T00:00:00Z", draft_data: null, ...payload },
      error: null,
    });
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          if (table === "receipts") written.push(payload);
          return { select: () => ({ single: () => single(payload) }) };
        },
        update(payload: Record<string, unknown>) {
          written.push(payload);
          const chain = { eq: () => chain, select: () => ({ single: () => single(payload) }) };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as typeof SUPABASE, written };
}

describe("User Story 3.3 Task 2: finalize receipt", () => {
  test("US-3.3-T-2: saveReceipt stores tax_cents and tip_cents on insert and update", async () => {
    const { client, written } = fakeSaveClient();

    const inserted = await saveReceipt("g1", DRAFT, "submitted", { client });
    const updated = await saveReceipt("g1", DRAFT, "submitted", { client, existingId: "r1" });

    assert.equal(inserted.status, "ok");
    assert.equal(updated.status, "ok");
    assert.equal(written.length, 2);
    for (const payload of written) {
      assert.equal(payload.total_cents, 2600);
      assert.equal(payload.tax_cents, 200);
      assert.equal(payload.tip_cents, 400);
    }
  });

  test("US-3.3-T-2: finalizeReceipt calls finalize_receipt and returns ok", async () => {
    const { client, calls } = fakeRpcClient({
      data: { success: true, receipt_id: "r1", finalized_at: "2026-11-17T12:00:00Z" },
      error: null,
    });

    const result = await finalizeReceipt("r1", { client });

    assert.deepEqual(calls, [{ fn: "finalize_receipt", args: { p_receipt_id: "r1" } }]);
    assert.deepEqual(result, { status: "ok", finalizedAt: "2026-11-17T12:00:00Z" });
  });

  test("US-3.3-T-2: finalizeReceipt reports unclaimed items and server errors", async () => {
    const unclaimed = fakeRpcClient({
      data: { success: false, error: "UNCLAIMED_ITEMS", message: "x", unclaimed_count: 3 },
      error: null,
    });
    assert.deepEqual(await finalizeReceipt("r1", { client: unclaimed.client }), {
      status: "unclaimed",
      unclaimedCount: 3,
    });

    for (const code of ["NOT_UPLOADER", "ALREADY_FINALIZED", "NOT_SUBMITTED", "NO_ITEMS", "NOT_FOUND"]) {
      const { client } = fakeRpcClient({
        data: { success: false, error: code, message: `msg ${code}` },
        error: null,
      });
      assert.deepEqual(await finalizeReceipt("r1", { client }), {
        status: "error",
        error: code,
        message: `msg ${code}`,
      });
    }
  });

  test("US-3.3-T-2: finalizeReceipt handles bad input and failures without throwing", async () => {
    const blank = fakeRpcClient({ data: null, error: null });
    const result = await finalizeReceipt("  ", { client: blank.client });
    assert.equal(result.status === "error" && result.error, "NOT_FOUND");
    assert.equal(blank.calls.length, 0);

    const noClient = await finalizeReceipt("r1", { client: null });
    assert.equal(noClient.status === "error" && noClient.error, "NETWORK_ERROR");

    const cases: [RpcAnswer | (() => never), string][] = [
      [{ data: null, error: { code: "42501", message: "denied" } }, "NOT_SIGNED_IN"],
      [{ data: null, error: { message: "timeout" } }, "NETWORK_ERROR"],
      [() => { throw new Error("offline"); }, "NETWORK_ERROR"],
      [{ data: null, error: null }, "NETWORK_ERROR"],
      [{ data: { success: true }, error: null }, "NETWORK_ERROR"],
      [{ data: { success: false, error: "SOMETHING_NEW" }, error: null }, "NETWORK_ERROR"],
      [{ data: { success: false, error: "UNCLAIMED_ITEMS", unclaimed_count: "lots" }, error: null }, "NETWORK_ERROR"],
    ];
    for (const [answer, expected] of cases) {
      const { client } = fakeRpcClient(answer);
      const r = await finalizeReceipt("r1", { client });
      assert.equal(r.status, "error", JSON.stringify(answer));
      assert.equal(r.status === "error" && r.error, expected, JSON.stringify(answer));
    }
  });

  test("US-3.3-T-2: migration defines finalize_receipt, the claim lock, and finalized RLS", () => {
    const migration = readFileSync("supabase/migrations/20261117_finalize_receipt.sql", "utf8");
    const setup = readFileSync("supabase/setup.sql", "utf8");

    for (const sql of [migration, setup]) {
      assert.match(sql, /add column if not exists tax_cents bigint not null default 0/);
      assert.match(sql, /add column if not exists tip_cents bigint not null default 0/);
      assert.match(sql, /check \(status in \('draft', 'submitted', 'finalized'\)\)/);
      assert.match(sql, /create or replace function public\.finalize_receipt\(p_receipt_id text\)/);
      for (const code of ["NOT_SIGNED_IN", "NOT_FOUND", "NOT_UPLOADER", "ALREADY_FINALIZED", "NOT_SUBMITTED", "NO_ITEMS", "UNCLAIMED_ITEMS"]) {
        assert.ok(sql.includes(`'${code}'`), `missing ${code}`);
      }
      assert.match(sql, /for update;/);
      assert.match(sql, /grant execute on function public\.finalize_receipt\(text\) to authenticated/);
      assert.match(sql, /before insert or delete on public\.item_claims/);
      assert.match(sql, /errcode = '42501'/);
      // Clients can't edit finalized receipts or set 'finalized' themselves.
      assert.match(sql, /and status <> 'finalized'\s*\)\s*with check \([^;]*status in \('draft', 'submitted'\)/);
      // Item insert/update/delete policies all check the receipt isn't finalized.
      const itemPolicies = sql.slice(
        sql.indexOf('create policy "Members insert items"'),
        sql.indexOf("receipt_items for delete") + 400
      );
      assert.equal(itemPolicies.match(/r\.status <> 'finalized'/g)?.length, 4);
    }
  });

  test("US-3.3-T-2: Home counts finalized receipts like submitted ones and ignores drafts", () => {
    assert.equal(isPostedReceipt("finalized"), true);
    assert.equal(isPostedReceipt("submitted"), true);
    assert.equal(isPostedReceipt("draft"), false);

    const receipt = (id: string, status: string, createdAt: string): OverviewReceiptRow => ({
      id,
      group_id: "g1",
      title: `Receipt ${id}`,
      total_cents: 1000,
      status,
      created_at: createdAt,
      created_by: "payer",
    });
    const receipts = [
      receipt("old", "submitted", "2026-11-01T00:00:00Z"),
      receipt("final", "finalized", "2026-11-10T00:00:00Z"),
      receipt("draft", "draft", "2026-11-15T00:00:00Z"),
    ];

    const [card] = buildGroupOverviewCards([{ id: "g1", name: "G" }], [], receipts);
    assert.equal(card.latestReceipt?.id, "final");

    const items = [
      { id: "i-final", receipt_id: "final", amount_cents: 600 },
      { id: "i-draft", receipt_id: "draft", amount_cents: 900 },
    ];
    const claims = [
      { item_id: "i-final", user_id: "me", guest_name: null },
      { item_id: "i-draft", user_id: "me", guest_name: null },
    ];
    assert.deepEqual(calculateUserBalances("me", receipts, items, claims), {
      owedToMeCents: 0,
      iOweCents: 600,
    });
    assert.deepEqual(calculateUserBalances("payer", receipts, items, claims), {
      owedToMeCents: 600,
      iOweCents: 0,
    });
  });
});
