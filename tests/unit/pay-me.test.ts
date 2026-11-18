/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention -- RPC and column names */
/**
 * User Story 3.5, Task 1: the send-pay-me Edge Function logic, the app's
 * Pay me client, and the Pay me migration.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/pay-me.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { guestClaimKey } from "@/lib/claims";
import {
  cooldownSecondsLeft,
  countNudgeable,
  formatCooldown,
  loadLastPayMe,
  type PayMeClient,
  sendPayMe,
} from "@/lib/pay-me";
import type { Settlement } from "@/lib/settlement";
import {
  handlePayMe,
  type PayMeDeps,
  type PushMessage,
  type PushTicket,
} from "../../supabase/functions/send-pay-me/pay-me";

/** The finalized receipt every test nudges about. */
const RECEIPT = "11111111-1111-1111-1111-111111111111";
/** The signed-in uploader, as the fake JWT check reports. */
const UPLOADER = "uploader";

/** A successful start_pay_me answer: Alex has two phones, Bo has none. */
const STARTED = {
  success: true,
  receipt_id: RECEIPT,
  receipt_title: "Diner",
  uploader_name: "Milo",
  owing_count: 2,
  recipients: [
    { user_id: "alex", tokens: ["ExponentPushToken[alex-1]", "ExponentPushToken[alex-2]"] },
    { user_id: "bo", tokens: [] },
  ],
};

type Fake = {
  deps: PayMeDeps;
  sent: PushMessage[][];
  deleted: string[][];
  cleared: string[];
  startCalls: [string, string][];
};

/**
 * Builds fake Edge Function dependencies.
 * @param start What start_pay_me answers
 * @param tickets Answers Expo with these tickets, or throws if "throw"
 * @returns The deps and what they recorded
 */
function fakeDeps(
  start: unknown,
  tickets: ((messages: PushMessage[]) => PushTicket[]) | "throw" = (m) =>
    m.map(() => ({ status: "ok" as const, id: "t" }))
): Fake {
  const fake: Fake = { sent: [], deleted: [], cleared: [], startCalls: [], deps: undefined as never };
  fake.deps = {
    getUserId: async (header) => (header === "Bearer good" ? UPLOADER : null),
    startPayMe: async (receiptId, userId) => {
      fake.startCalls.push([receiptId, userId]);
      return { data: start, error: null };
    },
    sendPush: async (messages) => {
      fake.sent.push(messages);
      if (tickets === "throw") throw new Error("offline");
      return tickets(messages);
    },
    deleteTokens: async (tokens) => {
      fake.deleted.push(tokens);
    },
    clearCooldown: async (receiptId) => {
      fake.cleared.push(receiptId);
    },
  };
  return fake;
}

type Call = { kind: string; name: string; args: unknown };

type InvokeAnswer = { data: unknown; error: { message: string; context?: unknown } | null };

type FakeAnswers = {
  invoke?: () => Promise<InvokeAnswer>;
  nudge?: unknown;
};

/**
 * A fake app Supabase client that records calls.
 * @param answers What functions.invoke and the pay_me_nudges read answer
 * @returns The client and its recorded calls
 */
function fakeClient(answers: FakeAnswers): { client: PayMeClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: PayMeClient = {
    functions: {
      invoke: async (name, options) => {
        calls.push({ kind: "invoke", name, args: options.body });
        return answers.invoke ? answers.invoke() : { data: null, error: null };
      },
    },
    from: (table) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          calls.push({ kind: "from", name: table, args: { columns, column, value } });
          return { maybeSingle: async () => ({ data: answers.nudge ?? null, error: null }) };
        },
      }),
    }),
  };
  return { client, calls };
}

/**
 * A settlement (US 3.4) with one person per status.
 * @returns The settlement
 */
function mixedSettlement(): Settlement {
  const person = (userId: string, status: Settlement["people"][number]["status"]) => ({
    userId,
    owesCents: status === "nothing_owed" ? 0 : 500,
    status,
  });
  return {
    people: [
      person(UPLOADER, "uploader"),
      person("unpaid-member", "unpaid"),
      person("not-received-member", "not_received"),
      person("paid-member", "paid"),
      person("confirmed-member", "confirmed"),
      person("zero-member", "nothing_owed"),
      { ...person(guestClaimKey("Sam"), "unpaid"), guestName: "Sam" },
    ],
    settled: false,
    outstandingCount: 4,
    outstandingCents: 2000,
  };
}

describe("User Story 3.5 Task 1: Pay me", () => {
  test("US-3.5-T-1: AC2 sendPayMe calls send-pay-me with the receipt id and reports how many were notified", async () => {
    const { client, calls } = fakeClient({
      invoke: async () => ({ data: { status: "sent", notifiedCount: 2, owingCount: 3 }, error: null }),
    });
    const result = await sendPayMe(RECEIPT, { client });
    assert.deepEqual(calls, [{ kind: "invoke", name: "send-pay-me", args: { receiptId: RECEIPT } }]);
    assert.deepEqual(result, { status: "sent", notifiedCount: 2, owingCount: 3 });
  });

  test("US-3.5-T-1: AC2 sendPayMe reads error bodies, handles failures, and never throws", async () => {
    const forbidden = fakeClient({
      invoke: async () => ({
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: { json: async () => ({ status: "error", error: "NOT_SIGNED_IN", message: "Please sign in." }) },
        },
      }),
    });
    assert.deepEqual(await sendPayMe(RECEIPT, { client: forbidden.client }), {
      status: "error",
      error: "NOT_SIGNED_IN",
      message: "Please sign in.",
    });

    const throws = fakeClient({ invoke: async () => Promise.reject(new Error("offline")) });
    assert.deepEqual(await sendPayMe(RECEIPT, { client: throws.client }), {
      status: "error",
      error: "NETWORK_ERROR",
      message: "offline",
    });

    const garbage = fakeClient({ invoke: async () => ({ data: { status: "sent" }, error: null }) });
    assert.equal((await sendPayMe(RECEIPT, { client: garbage.client })).status, "error");
    assert.equal((await sendPayMe(RECEIPT, { client: null })).status, "error");
    assert.deepEqual(await sendPayMe("  ", { client: garbage.client }), {
      status: "error",
      error: "NOT_FOUND",
      message: "Receipt not found.",
    });
  });

  test("US-3.5-T-1: AC3 send-pay-me pushes every device of members who still owe", async () => {
    const fake = fakeDeps(STARTED);
    const res = await handlePayMe("Bearer good", { receiptId: RECEIPT }, fake.deps);

    assert.deepEqual(fake.startCalls, [[RECEIPT, UPLOADER]]);
    assert.equal(fake.sent.length, 1);
    assert.deepEqual(
      fake.sent[0].map((m) => m.to),
      ["ExponentPushToken[alex-1]", "ExponentPushToken[alex-2]"]
    );
    assert.deepEqual(fake.sent[0][0], {
      to: "ExponentPushToken[alex-1]",
      title: "Milo says: Pay me",
      body: 'Settle up for "Diner".',
      sound: "default",
      channelId: "pay-me",
      data: { receiptId: RECEIPT, url: `/receipts/${RECEIPT}` },
    });
    assert.deepEqual(res, {
      httpStatus: 200,
      body: { status: "sent", notifiedCount: 1, owingCount: 2 },
    });
  });

  test("US-3.5-T-1: AC3 send-pay-me only sends to who start_pay_me says owes, batches by 100, and deletes dead tokens", async () => {
    // Paid members, the uploader and guests are never in start_pay_me's
    // recipients (see the migration test), so nothing is sent to them.
    const many = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[t${i}]`);
    const fake = fakeDeps(
      { ...STARTED, owing_count: 1, recipients: [{ user_id: "alex", tokens: many }] },
      (messages) =>
        messages.map((m) =>
          m.to === "ExponentPushToken[t3]"
            ? { status: "error" as const, details: { error: "DeviceNotRegistered" } }
            : { status: "ok" as const }
        )
    );
    const res = await handlePayMe("Bearer good", { receiptId: RECEIPT }, fake.deps);

    assert.deepEqual(fake.sent.map((b) => b.length), [100, 50]);
    const everyone = fake.sent.flat().map((m) => m.to);
    assert.ok(!everyone.some((t) => t.includes(UPLOADER)));
    assert.deepEqual(fake.deleted, [["ExponentPushToken[t3]"]]);
    assert.deepEqual(res.body, { status: "sent", notifiedCount: 1, owingCount: 1 });
  });

  test("US-3.5-T-1: AC3 send-pay-me rejects strangers, passes through rule errors, and frees the cooldown if Expo is down", async () => {
    const noAuth = fakeDeps(STARTED);
    assert.equal((await handlePayMe(null, { receiptId: RECEIPT }, noAuth.deps)).httpStatus, 401);
    assert.equal(noAuth.startCalls.length, 0);

    assert.equal((await handlePayMe("Bearer good", {}, noAuth.deps)).httpStatus, 400);

    const notUploader = fakeDeps({ success: false, error: "NOT_UPLOADER", message: "Only the uploader." });
    assert.deepEqual((await handlePayMe("Bearer good", { receiptId: RECEIPT }, notUploader.deps)).body, {
      status: "error",
      error: "NOT_UPLOADER",
      message: "Only the uploader.",
    });
    assert.equal(notUploader.sent.length, 0);

    const nobody = fakeDeps({ success: false, error: "NOBODY_OWES" });
    assert.deepEqual((await handlePayMe("Bearer good", { receiptId: RECEIPT }, nobody.deps)).body, {
      status: "nobody_owes",
    });
    assert.equal(nobody.sent.length, 0);

    const down = fakeDeps(STARTED, "throw");
    const res = await handlePayMe("Bearer good", { receiptId: RECEIPT }, down.deps);
    assert.equal(res.httpStatus, 502);
    assert.deepEqual(down.cleared, [RECEIPT]);
  });

  test("US-3.5-T-1: AC4 a second Pay me within the hour sends nothing and returns retryAfterSeconds", async () => {
    const fake = fakeDeps({ success: false, error: "COOLDOWN", retry_after_seconds: 3540 });
    const res = await handlePayMe("Bearer good", { receiptId: RECEIPT }, fake.deps);
    assert.deepEqual(res, { httpStatus: 200, body: { status: "cooldown", retryAfterSeconds: 3540 } });
    assert.equal(fake.sent.length, 0);
    assert.equal(fake.cleared.length, 0);

    const { client } = fakeClient({
      invoke: async () => ({ data: res.body, error: null }),
    });
    assert.deepEqual(await sendPayMe(RECEIPT, { client }), {
      status: "cooldown",
      retryAfterSeconds: 3540,
    });
  });

  test("US-3.5-T-1: AC4 cooldown countdown math and formatting", () => {
    const sent = "2026-11-17T12:00:00.000Z";
    const sentMs = Date.parse(sent);
    assert.equal(cooldownSecondsLeft(sent, sentMs), 3600);
    assert.equal(cooldownSecondsLeft(sent, sentMs + 60_500), 3540);
    assert.equal(cooldownSecondsLeft(sent, sentMs + 3_600_000), 0);
    assert.equal(cooldownSecondsLeft(sent, sentMs + 5_000_000), 0);
    assert.equal(cooldownSecondsLeft(null, sentMs), 0);
    assert.equal(cooldownSecondsLeft("not a date", sentMs), 0);

    assert.equal(formatCooldown(95), "1:35");
    assert.equal(formatCooldown(3540), "59:00");
    assert.equal(formatCooldown(3725), "1:02:05");
    assert.equal(formatCooldown(0), "0:00");
  });

  test("US-3.5-T-1: AC5 only unpaid and not-received member shares can be nudged", () => {
    // Uploader, marked paid, confirmed, $0 shares and guests are left out.
    assert.equal(countNudgeable(mixedSettlement()), 2);

    const allPaid = mixedSettlement();
    allPaid.people = allPaid.people.map((p) =>
      p.status === "unpaid" || p.status === "not_received" ? { ...p, status: "paid" } : p
    );
    assert.equal(countNudgeable(allPaid), 0);
  });

  test("US-3.5-T-1: AC4 loadLastPayMe reads the receipt's last Pay me so the countdown survives reopening", async () => {
    const { client, calls } = fakeClient({ nudge: { last_sent_at: "2026-11-17T12:00:00.000Z" } });
    assert.deepEqual(await loadLastPayMe(RECEIPT, { client }), {
      status: "ok",
      lastSentAt: "2026-11-17T12:00:00.000Z",
    });
    assert.deepEqual(calls, [
      {
        kind: "from",
        name: "pay_me_nudges",
        args: { columns: "last_sent_at", column: "receipt_id", value: RECEIPT },
      },
    ]);

    const never = fakeClient({});
    assert.deepEqual(await loadLastPayMe(RECEIPT, { client: never.client }), {
      status: "ok",
      lastSentAt: null,
    });
    assert.equal((await loadLastPayMe(RECEIPT, { client: null })).status, "error");
  });

  test("US-3.5-T-1: AC7 migration defines the tables, already-paid and finalized checks, atomic cooldown, and service-role-only start_pay_me", () => {
    const migration = readFileSync("supabase/migrations/20261119_pay_me.sql", "utf8");
    const fullSetup = readFileSync("supabase/setup.sql", "utf8");
    // Only the Pay me section, so other RPCs' error codes don't count.
    const start = fullSetup.indexOf("-- 8e. Pay me");
    const end = fullSetup.indexOf("-- 9. Starter Counter Utility");
    assert.ok(start > fullSetup.indexOf("-- 8d. Receipt payments"), "Pay me comes after US 3.4's payments");
    const setup = fullSetup.slice(start, end);

    for (const sql of [migration, setup]) {
      const flat = sql.replace(/\s+/g, " ");
      for (const table of ["push_tokens", "pay_me_nudges"]) {
        assert.match(flat, new RegExp(`create table if not exists public\\.${table}`));
        assert.match(flat, new RegExp(`alter table public\\.${table} enable row level security`));
        assert.match(flat, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
      }
      // US 3.4 owns receipt_payments; Pay me only reads it.
      assert.ok(!flat.includes("create table if not exists public.receipt_payments"));
      assert.ok(!flat.includes("set_receipt_paid"));

      for (const fn of [
        "register_push_token(p_token text, p_platform text)",
        "unregister_push_token(p_token text)",
        "start_pay_me(p_receipt_id text, p_user_id uuid)",
      ]) {
        assert.ok(flat.includes(`create or replace function public.${fn}`), fn);
      }

      assert.ok(flat.includes("'NOT_UPLOADER'"));
      assert.ok(flat.includes("'NOT_FINALIZED'"));
      assert.ok(flat.includes("v_receipt.status <> 'finalized'"));

      // Who owes: members with a claim over $0, not the uploader, not marked
      // paid or confirmed in US 3.4's receipt_payments.
      assert.ok(flat.includes("c.user_id is not null"));
      assert.ok(flat.includes("c.user_id <> v_receipt.created_by"));
      assert.ok(flat.includes("i.amount_cents > 0"));
      assert.ok(flat.includes("p.payer_key = c.user_id::text"));
      assert.ok(flat.includes("p.state in ('paid', 'confirmed')"));
      assert.ok(flat.includes("'NOBODY_OWES'"));

      // The cooldown is claimed atomically, once an hour.
      assert.ok(flat.includes("on conflict (receipt_id) do update"));
      assert.ok(flat.includes("where n.last_sent_at <= now() - interval '1 hour'"));
      assert.ok(flat.includes("'retry_after_seconds'"));

      // Only the service role (the Edge Function) can see push tokens via start_pay_me.
      assert.ok(
        flat.includes(
          "revoke execute on function public.start_pay_me(text, uuid) from public, anon, authenticated"
        )
      );
      assert.ok(flat.includes("grant execute on function public.start_pay_me(text, uuid) to service_role"));
    }
  });
});
