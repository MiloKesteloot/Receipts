/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReceiptDraft } from "@/lib/receipt-form";
import { deleteReceipt, saveReceipt } from "@/lib/receipts";
import type { SUPABASE } from "@/lib/supabase";

/** Group ID used in tests. */
const GROUP_ID = "group-1";

/** Valid draft fixture. */
const VALID_DRAFT: ReceiptDraft = {
  store: "Corner Market",
  items: [{ id: "a", name: "Milk", price: "5.00" }],
  tax: "0.50",
  tip: "",
};

/** Options for creating fake receipts client. */
type FakeReceiptsClientOptions = {
  userId?: string | null;
  insertReceiptResult?: { data: unknown; error: unknown };
  updateReceiptResult?: { data: unknown; error: unknown };
  deleteReceiptResult?: { error: unknown };
  insertItemsResult?: { error: unknown };
};

/** Shape for test insert/update payloads. */
type FakePayload = {
  title?: string;
  total_cents?: number;
  status?: string;
  draft_data?: unknown;
  length?: number;
  [key: string]: unknown;
};

/**
 * Creates a fake Supabase client for testing saveReceipt and deleteReceipt.
 * @param options Responses for insert, update, and delete calls
 * @returns Fake client and call records
 */
function createFakeReceiptsClient(options?: FakeReceiptsClientOptions) {
  const insertCalls: { table: string; payload: FakePayload }[] = [];
  const updateCalls: { table: string; payload: FakePayload; eqId: string }[] = [];
  const deleteCalls: { table: string; filters: Record<string, string> }[] = [];

  const client = {
    auth: {
      getUser() {
        return Promise.resolve({
          data: {
            user: options?.userId === null ? null : { id: options?.userId ?? "u1" },
          },
        });
      },
    },
    from(table: string) {
      return {
        insert(payload: FakePayload) {
          insertCalls.push({ table, payload });
          return {
            select() {
              return {
                single() {
                  if (options?.insertReceiptResult) {
                    return Promise.resolve(options.insertReceiptResult);
                  }
                  const singlePayload = Array.isArray(payload) ? payload[0] : payload;
                  return Promise.resolve({
                    data: {
                      id: "new-r1",
                      title: singlePayload?.title,
                      total_cents: singlePayload?.total_cents,
                      status: singlePayload?.status,
                      created_at: "2026-10-01T00:00:00Z",
                      draft_data: singlePayload?.draft_data,
                    },
                    error: null,
                  });
                },
              };
            },
            then(resolve: (value: unknown) => void) {
              return Promise.resolve(
                options?.insertItemsResult ?? { error: null }
              ).then(resolve);
            },
          };
        },
        update(payload: FakePayload) {
          return {
            eq(_c1: string, v1: string) {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        single() {
                          updateCalls.push({ table, payload, eqId: v1 });
                          if (options?.updateReceiptResult) {
                            return Promise.resolve(options.updateReceiptResult);
                          }
                          return Promise.resolve({
                            data: {
                              id: v1,
                              title: payload.title,
                              total_cents: payload.total_cents,
                              status: payload.status,
                              created_at: "2026-10-01T00:00:00Z",
                              draft_data: payload.draft_data,
                            },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        delete() {
          const filters: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              filters[col] = val;
              return chain;
            },
            then(resolve: (value: unknown) => void) {
              deleteCalls.push({ table, filters });
              return Promise.resolve(
                options?.deleteReceiptResult ?? { error: null }
              ).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  } as unknown as typeof SUPABASE;

  return { client, insertCalls, updateCalls, deleteCalls };
}

describe("saveReceipt (US 2.1 Task 3) with Supabase mock", () => {
  it("submits a receipt and inserts receipt and item records", async () => {
    const { client, insertCalls } = createFakeReceiptsClient();
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { client });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.receipt.status, "submitted");
    assert.equal(result.receipt.title, "Corner Market");
    assert.equal(result.receipt.total_cents, 550);

    assert.equal(insertCalls.length, 2);
    assert.equal(insertCalls[0].table, "receipts");
    assert.equal(insertCalls[0].payload.title, "Corner Market");
    assert.equal(insertCalls[1].table, "receipt_items");
    assert.equal(insertCalls[1].payload.length, 1);
  });

  it("saves a draft and records draft_data", async () => {
    const { client, insertCalls } = createFakeReceiptsClient();
    const result = await saveReceipt(
      GROUP_ID,
      { ...VALID_DRAFT, store: "Draft Store" },
      "draft",
      { client }
    );

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.receipt.status, "draft");
    assert.equal(result.receipt.title, "Draft Store");
    assert.equal(insertCalls[0].payload.status, "draft");
    assert.ok(insertCalls[0].payload.draft_data);
  });

  it("returns the validation message and saves nothing on invalid input", async () => {
    const { client, insertCalls } = createFakeReceiptsClient();
    const result = await saveReceipt(
      GROUP_ID,
      { ...VALID_DRAFT, store: "" },
      "submitted",
      { client }
    );

    assert.deepEqual(result, { status: "error", message: "Enter a store name." });
    assert.equal(insertCalls.length, 0);
  });

  it("returns error when not signed in", async () => {
    const { client } = createFakeReceiptsClient({ userId: null });
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { client });

    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /sign in/i);
    }
  });

  it("returns error when Supabase client is unconfigured", async () => {
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", {
      client: null as unknown as typeof SUPABASE,
    });

    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /not configured/i);
    }
  });

  it("updates an existing draft when existingId is provided", async () => {
    const { client, updateCalls } = createFakeReceiptsClient();
    const result = await saveReceipt(
      GROUP_ID,
      { ...VALID_DRAFT, store: "Updated Store" },
      "submitted",
      { client, existingId: "existing-draft-1" }
    );

    assert.equal(result.status, "ok");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].eqId, "existing-draft-1");
    assert.equal(updateCalls[0].payload.title, "Updated Store");
  });

  it("surfaces database error from insert", async () => {
    const { client } = createFakeReceiptsClient({
      insertReceiptResult: { data: null, error: { message: "DB timeout" } },
    });
    const result = await saveReceipt(GROUP_ID, VALID_DRAFT, "submitted", { client });

    assert.deepEqual(result, { status: "error", message: "DB timeout" });
  });

  it("deletes a saved draft", async () => {
    const { client, deleteCalls } = createFakeReceiptsClient();
    const result = await deleteReceipt(GROUP_ID, "draft-1", { client });

    assert.deepEqual(result, { status: "ok" });
    assert.equal(deleteCalls.length, 1);
    assert.equal(deleteCalls[0].filters.id, "draft-1");
    assert.equal(deleteCalls[0].filters.group_id, GROUP_ID);
    assert.equal(deleteCalls[0].filters.status, "draft");
  });

  it("surfaces database error on delete", async () => {
    const { client } = createFakeReceiptsClient({
      deleteReceiptResult: { error: { message: "Cannot delete" } },
    });
    const result = await deleteReceipt(GROUP_ID, "draft-1", { client });

    assert.deepEqual(result, { status: "error", message: "Cannot delete" });
  });

  it("deleteReceipt returns error when Supabase client is unconfigured", async () => {
    const result = await deleteReceipt(GROUP_ID, "draft-1", {
      client: null as unknown as typeof SUPABASE,
    });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /not configured/i);
    }
  });
});
