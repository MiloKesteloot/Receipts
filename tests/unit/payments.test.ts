/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.4, Task 2: the receipt_payments table, the mark_share_paid and
 * respond_to_payment RPC clients, and loading payments.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  getPayments,
  markSharePaid,
  respondToPayment,
  type PaymentsClient,
} from "@/lib/payments";

type Answer = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A fake client that records RPC calls and selects, answering with `answer`.
 * @param answer What every call returns, or a function that throws
 * @returns The client and its recorded calls
 */
function fakeClient(answer: Answer | (() => never)) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const selects: { table: string; columns: string; eq: [string, string] }[] = [];
  const respond = () =>
    typeof answer === "function" ? Promise.resolve().then(answer) : Promise.resolve(answer);
  const client: PaymentsClient = {
    rpc(fn, args) {
      rpcCalls.push({ fn, args });
      return respond();
    },
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              selects.push({ table, columns, eq: [column, value] });
              return respond() as PromiseLike<{ data: unknown[] | null; error: Answer["error"] }>;
            },
          };
        },
      };
    },
  };
  return { client, rpcCalls, selects };
}

/** A successful RPC answer for a share in `state`. */
const ok = (state: string, payerKey = "u-blake"): Answer => ({
  data: {
    success: true,
    payer_key: payerKey,
    state,
    marked_paid_at: "2026-11-18T10:00:00Z",
    responded_at: state === "paid" ? null : "2026-11-18T11:00:00Z",
  },
  error: null,
});

describe("markSharePaid", () => {
  test("US-3.4-T-2: calls mark_share_paid and returns the paid record", async () => {
    const { client, rpcCalls } = fakeClient(ok("paid"));
    const result = await markSharePaid("r1", { client });
    assert.deepEqual(rpcCalls, [{ fn: "mark_share_paid", args: { p_receipt_id: "r1" } }]);
    assert.deepEqual(result, {
      status: "ok",
      payment: {
        payerKey: "u-blake",
        state: "paid",
        markedPaidAt: "2026-11-18T10:00:00Z",
        respondedAt: null,
      },
    });
  });
});

describe("respondToPayment", () => {
  test("US-3.4-T-2: calls respond_to_payment and returns the confirmed or rejected record", async () => {
    const confirmed = fakeClient(ok("confirmed"));
    const r1 = await respondToPayment("r1", "u-blake", true, { client: confirmed.client });
    assert.deepEqual(confirmed.rpcCalls, [
      {
        fn: "respond_to_payment",
        args: { p_receipt_id: "r1", p_payer_key: "u-blake", p_received: true },
      },
    ]);
    assert.equal(r1.status === "ok" && r1.payment.state, "confirmed");

    const rejected = fakeClient(ok("not_received", "guest:casey"));
    const r2 = await respondToPayment("r1", "guest:casey", false, { client: rejected.client });
    assert.equal(rejected.rpcCalls[0].args.p_received, false);
    assert.equal(r2.status === "ok" && r2.payment.state, "not_received");
    assert.equal(r2.status === "ok" && r2.payment.payerKey, "guest:casey");
  });
});

describe("payment action errors", () => {
  const actions = [
    (client: PaymentsClient | null) => markSharePaid("r1", { client }),
    (client: PaymentsClient | null) => respondToPayment("r1", "u-blake", true, { client }),
  ];

  test("US-3.4-T-2: server errors pass through with their message", async () => {
    for (const code of ["NOT_FINALIZED", "NOT_UPLOADER", "ALREADY_CONFIRMED", "IS_UPLOADER", "NO_SHARE", "NOT_MARKED_PAID"]) {
      for (const action of actions) {
        const { client } = fakeClient({
          data: { success: false, error: code, message: `msg ${code}` },
          error: null,
        });
        assert.deepEqual(await action(client), {
          status: "error",
          error: code,
          message: `msg ${code}`,
        });
      }
    }
  });

  test("US-3.4-T-2: blank ids, missing clients, 42501, network errors, and bad answers don't throw", async () => {
    const blank = fakeClient(ok("paid"));
    const r1 = await markSharePaid("  ", { client: blank.client });
    const r2 = await respondToPayment("r1", " ", true, { client: blank.client });
    const r3 = await respondToPayment("", "u-blake", true, { client: blank.client });
    for (const r of [r1, r2, r3]) assert.equal(r.status === "error" && r.error, "NOT_FOUND");
    assert.equal(blank.rpcCalls.length, 0);

    const cases: [Answer | (() => never), string][] = [
      [{ data: null, error: { code: "42501", message: "denied" } }, "NOT_SIGNED_IN"],
      [{ data: null, error: { message: "timeout" } }, "NETWORK_ERROR"],
      [() => { throw new Error("offline"); }, "NETWORK_ERROR"],
      [{ data: null, error: null }, "NETWORK_ERROR"],
      [{ data: "nope", error: null }, "NETWORK_ERROR"],
      [{ data: { success: true, payer_key: "u-blake", state: "weird" }, error: null }, "NETWORK_ERROR"],
      [{ data: { success: false, error: "MADE_UP" }, error: null }, "NETWORK_ERROR"],
    ];
    for (const [answer, expected] of cases) {
      for (const action of actions) {
        const { client } = fakeClient(answer);
        const r = await action(client);
        assert.equal(r.status === "error" && r.error, expected, JSON.stringify(answer));
      }
    }

    for (const action of actions) {
      const r = await action(null);
      assert.equal(r.status === "error" && r.error, "NETWORK_ERROR");
    }
  });
});

describe("getPayments", () => {
  test("US-3.4-T-2: loads the receipt's payments, skipping unknown states, and reports errors", async () => {
    const { client, selects } = fakeClient({
      data: [
        { payer_key: "u-blake", state: "paid", marked_paid_at: "t1", responded_at: null },
        { payer_key: "guest:casey", state: "confirmed", marked_paid_at: null, responded_at: "t2" },
        { payer_key: "u-dana", state: "refunded", marked_paid_at: null, responded_at: null },
        { payer_key: "", state: "paid" },
        null,
      ],
      error: null,
    });
    const result = await getPayments("r1", { client });
    assert.equal(selects[0].table, "receipt_payments");
    assert.deepEqual(selects[0].eq, ["receipt_id", "r1"]);
    assert.deepEqual(result, {
      status: "ok",
      payments: [
        { payerKey: "u-blake", state: "paid", markedPaidAt: "t1", respondedAt: null },
        { payerKey: "guest:casey", state: "confirmed", markedPaidAt: null, respondedAt: "t2" },
      ],
    });

    const failed = fakeClient({ data: null, error: { message: "relation missing" } });
    assert.deepEqual(await getPayments("r1", { client: failed.client }), {
      status: "error",
      message: "relation missing",
    });
    const thrown = fakeClient(() => { throw new Error("offline"); });
    assert.equal((await getPayments("r1", { client: thrown.client })).status, "error");
    assert.equal((await getPayments("r1", { client: null })).status, "error");
    assert.equal((await getPayments(" ", { client })).status, "error");
  });
});

describe("receipt_payments migration", () => {
  test("US-3.4-T-2: migration and setup.sql define the table, read-only RLS, and both RPCs", () => {
    const migration = readFileSync("supabase/migrations/20261118_receipt_payments.sql", "utf8");
    const setup = readFileSync("supabase/setup.sql", "utf8");

    for (const sql of [migration, setup]) {
      assert.match(sql, /create table if not exists public\.receipt_payments/);
      assert.match(sql, /references public\.receipts \(id\) on delete cascade/);
      assert.match(sql, /check \(state in \('paid', 'confirmed', 'not_received'\)\)/);
      assert.match(sql, /primary key \(receipt_id, payer_key\)/);
      assert.match(sql, /alter table public\.receipt_payments enable row level security/);
      // Members read; clients never write directly.
      assert.match(sql, /revoke all on public\.receipt_payments from anon, authenticated/);
      assert.match(sql, /grant select on public\.receipt_payments to authenticated/);
      assert.doesNotMatch(sql, /grant [^;]*(insert|update|delete)[^;]* on public\.receipt_payments/);
      assert.match(sql, /on public\.receipt_payments for select[\s\S]*?public\.is_group_member\(r\.group_id\)/);

      assert.match(sql, /create or replace function public\.mark_share_paid\(p_receipt_id text\)/);
      assert.match(sql, /create or replace function public\.respond_to_payment\(\s*p_receipt_id text,\s*p_payer_key text,\s*p_received boolean\s*\)/);
      for (const code of ["NOT_SIGNED_IN", "NOT_FOUND", "NOT_FINALIZED", "IS_UPLOADER", "NOT_UPLOADER", "NO_SHARE", "ALREADY_CONFIRMED", "NOT_MARKED_PAID"]) {
        assert.ok(sql.includes(`'${code}'`), `missing ${code}`);
      }
      assert.match(sql, /v_receipt\.status <> 'finalized'/);
      assert.match(sql, /v_receipt\.created_by <> v_user_id/);
      assert.match(sql, /grant execute on function public\.mark_share_paid\(text\) to authenticated/);
      assert.match(sql, /grant execute on function public\.respond_to_payment\(text, text, boolean\) to authenticated/);
      // Guest payer keys match guestClaimKey.
      assert.match(sql, /'guest:' \|\| lower\(trim\(c\.guest_name\)\)/);
    }
  });
});
