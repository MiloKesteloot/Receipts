/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable jsdoc/require-param-description */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  loadGroupDetail,
  loadGroupList,
  NOT_CONFIGURED,
  type GroupDetail,
  type GroupsClient,
  type GroupSummary,
} from "@/lib/group-data";

type DbError = { code?: string; message: string } | null;

/**
 * Builds a fake client whose groups query returns the given result.
 * @param result The data and error to return
 * @param result.data
 * @param result.error
 * @returns The fake client and a log of the calls it received
 */
function listClient(result: {
  data: GroupSummary[] | null;
  error: DbError;
}) {
  const calls: string[] = [];
  const client: GroupsClient = {
    from(table) {
      calls.push(`from:${table}`);
      return {
        select(cols) {
          calls.push(`select:${cols}`);
          return {
            order(col) {
              calls.push(`order:${col}`);
              return Promise.resolve(result);
            },
          };
        },
      };
    },
    rpc() {
      throw new Error("rpc not expected");
    },
  };
  return { client, calls };
}

/**
 * Builds a fake client whose rpc call returns the given result.
 * @param result The data and error to return from rpc
 * @param result.data
 * @param result.error
 * @returns The fake client and a log of the rpc calls it received
 */
function rpcClient(result: { data: unknown; error: DbError }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: GroupsClient = {
    from() {
      throw new Error("from not expected");
    },
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
  return { client, calls };
}

/**
 * Fake client whose every call throws, to simulate a network failure.
 */
const THROWING_CLIENT: GroupsClient = {
  /** Always throws, simulating a network failure. */
  from() {
    throw new Error("network down");
  },
  /** Always throws, simulating a network failure. */
  rpc() {
    throw new Error("network down");
  },
};

describe("Task 1.1: groups page lists my groups", () => {
  it("server mode queries the groups table, sorted by name", async () => {
    const rows = [
      { id: "g1", name: "Alpha" },
      { id: "g2", name: "Beta" },
    ];
    const { client, calls } = listClient({ data: rows, error: null });
    const r = await loadGroupList({ client });
    assert.deepEqual(calls, ["from:groups", "select:id, name", "order:name"]);
    assert.deepEqual(r, { status: "ok", groups: rows });
  });

  it("returns group ids and names for list keys and route params", async () => {
    const rows = [
      { id: "g1", name: "Alpha" },
      { id: "g2", name: "Beta" },
    ];
    const { client } = listClient({ data: rows, error: null });
    const r = await loadGroupList({ client });
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.groups.length, 2);
    assert.equal(new Set(r.groups.map((g) => g.id)).size, 2);
    for (const g of r.groups) {
      assert.ok(g.id.length > 0, "id is needed to open the group");
      assert.ok(g.name.length > 0);
    }
  });
});

describe("Task 1.2: group page shows members, join code, receipts", () => {
  const detailPayload: GroupDetail = {
    group: {
      id: "g1",
      name: "Apartment 402",
      invite_code: "APT402XY",
      created_by: "u1",
      created_at: "2026-10-01T00:00:00Z",
    },
    members: [
      {
        user_id: "u1",
        display_name: "Alex",
        role: "owner",
        joined_at: "2026-10-01T00:00:00Z",
      },
      {
        user_id: "u2",
        display_name: "Sam",
        role: "member",
        joined_at: "2026-10-02T00:00:00Z",
      },
    ],
    receipts: [
      {
        id: "r1",
        title: "Costco",
        total_cents: 8423,
        created_at: "2026-10-05T00:00:00Z",
      },
    ],
  };

  it("returns members, a join code and a receipts array", async () => {
    const { client } = rpcClient({ data: detailPayload, error: null });
    const r = await loadGroupDetail("g1", { client });
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.ok(r.detail.members.length > 0);
    assert.equal(r.detail.group.invite_code, "APT402XY");
    assert.ok(Array.isArray(r.detail.receipts));
  });

  it("detail matches the requested group id and name", async () => {
    const { client } = rpcClient({ data: detailPayload, error: null });
    const r = await loadGroupDetail("g1", { client });
    if (r.status !== "ok") return assert.fail("expected ok");
    assert.equal(r.detail.group.id, "g1");
    assert.equal(r.detail.group.name, "Apartment 402");
  });

  it("group detail specifies member roles including owner", async () => {
    const { client } = rpcClient({ data: detailPayload, error: null });
    const r = await loadGroupDetail("g1", { client });
    if (r.status !== "ok") return assert.fail("expected ok");
    const owners = r.detail.members.filter((m) => m.role === "owner");
    assert.equal(owners.length, 1);
  });
});

describe("Task 1.3: loading, empty and error states", () => {
  it("list: empty server result is ok with no groups (empty state)", async () => {
    const { client } = listClient({ data: [], error: null });
    assert.deepEqual(await loadGroupList({ client }), {
      status: "ok",
      groups: [],
    });
  });

  it("list: null data is treated as empty, not a crash", async () => {
    const { client } = listClient({ data: null, error: null });
    assert.deepEqual(await loadGroupList({ client }), {
      status: "ok",
      groups: [],
    });
  });

  it("list: server error surfaces its message", async () => {
    const { client } = listClient({ data: null, error: { message: "boom" } });
    assert.deepEqual(await loadGroupList({ client }), {
      status: "error",
      message: "boom",
    });
  });

  it("list: a thrown network error becomes an error state", async () => {
    const r = await loadGroupList({ client: THROWING_CLIENT });
    assert.deepEqual(r, { status: "error", message: "network down" });
  });

  it("list: missing client explains how to configure", async () => {
    const r = await loadGroupList({ client: null });
    assert.deepEqual(r, { status: "error", message: NOT_CONFIGURED });
  });

  it("detail: non-403 server error is an error, not forbidden", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "500", message: "server exploded" },
    });
    const r = await loadGroupDetail("g1", { client });
    assert.deepEqual(r, { status: "error", message: "server exploded" });
  });

  it("detail: a thrown network error becomes an error state", async () => {
    const r = await loadGroupDetail("g1", { client: THROWING_CLIENT });
    assert.deepEqual(r, { status: "error", message: "network down" });
  });

  it("detail: missing client explains how to configure", async () => {
    const r = await loadGroupDetail("g1", { client: undefined });
    assert.deepEqual(r, { status: "error", message: NOT_CONFIGURED });
  });
});

describe("Task 1.4: get_group returns members and receipts for a member", () => {
  const payload: GroupDetail = {
    group: {
      id: "g1",
      name: "Flat",
      invite_code: "ABCD1234",
      created_by: "u1",
      created_at: "2026-10-01T00:00:00Z",
    },
    members: [
      {
        user_id: "u1",
        display_name: "Alex",
        role: "owner",
        joined_at: "2026-10-01T00:00:00Z",
      },
    ],
    receipts: [
      {
        id: "r1",
        title: "Costco",
        total_cents: 8423,
        created_at: "2026-10-05T00:00:00Z",
      },
    ],
  };

  it("calls the get_group RPC with the group id", async () => {
    const { client, calls } = rpcClient({ data: payload, error: null });
    await loadGroupDetail("g1", { client });
    assert.deepEqual(calls, [{ fn: "get_group", args: { p_group_id: "g1" } }]);
  });

  it("returns the server's members, join code and receipts unchanged", async () => {
    const { client } = rpcClient({ data: payload, error: null });
    const r = await loadGroupDetail("g1", { client });
    assert.deepEqual(r, { status: "ok", detail: payload });
  });
});

describe("Task 1.5: a non-member is refused", () => {
  it("server code 42501 maps to forbidden", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "42501", message: "not a member" },
    });
    const r = await loadGroupDetail("g1", { client });
    assert.deepEqual(r, { status: "forbidden" });
  });

  it("forbidden result carries no group data", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "42501", message: "not a member" },
    });
    const r = await loadGroupDetail("g1", { client });
    assert.ok(!("detail" in r));
  });
});