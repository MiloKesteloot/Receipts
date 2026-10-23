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
import { mockGroupDetails, mockGroups } from "@/lib/mock";

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

/**
 * Base options for server mode. Spread it and add a fake `client`.
 */
const REAL = { useMock: false } as const;

/**
 * Options for mock mode, where no client is needed.
 */
const MOCK = { useMock: true, client: null } as const;

describe("Task 1.1: groups page lists my groups", () => {
  it("mock mode lists every mock group with an id and name", async () => {
    const r = await loadGroupList(MOCK);
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.groups.length, mockGroups.length);
    for (const g of r.groups) {
      assert.ok(g.id.length > 0, "id is needed to open the group");
      assert.ok(g.name.length > 0);
    }
  });

  it("group ids are unique (used as list keys and route params)", async () => {
    const r = await loadGroupList(MOCK);
    if (r.status !== "ok") return assert.fail("expected ok");
    assert.equal(new Set(r.groups.map((g) => g.id)).size, r.groups.length);
  });

  it("returns a copy, so callers can't mutate the shared mock list", async () => {
    const r = await loadGroupList(MOCK);
    if (r.status !== "ok") return assert.fail("expected ok");
    const before = mockGroups.length;
    r.groups.push({ id: "x", name: "x" });
    assert.equal(mockGroups.length, before);
  });

  it("server mode queries the groups table, sorted by name", async () => {
    const rows = [{ id: "g1", name: "Alpha" }];
    const { client, calls } = listClient({ data: rows, error: null });
    const r = await loadGroupList({ ...REAL, client });
    assert.deepEqual(calls, ["from:groups", "select:id, name", "order:name"]);
    assert.deepEqual(r, { status: "ok", groups: rows });
  });
});

describe("Task 1.2: group page shows members, join code, receipts", () => {
  it("every mock group has members, a join code and a receipts array", async () => {
    for (const g of mockGroups) {
      const r = await loadGroupDetail(g.id, MOCK);
      if (r.status !== "ok") return assert.fail(`${g.id} should load`);
      assert.ok(r.detail.members.length > 0, `${g.id} has members`);
      assert.ok(r.detail.group.invite_code, `${g.id} has a join code`);
      assert.ok(Array.isArray(r.detail.receipts));
    }
  });

  it("detail matches the list entry it was opened from", async () => {
    for (const g of mockGroups) {
      const r = await loadGroupDetail(g.id, MOCK);
      if (r.status !== "ok") return assert.fail("expected ok");
      assert.equal(r.detail.group.id, g.id);
      assert.equal(r.detail.group.name, g.name);
    }
  });

  it("each group has exactly one owner", async () => {
    for (const g of mockGroups) {
      const r = await loadGroupDetail(g.id, MOCK);
      if (r.status !== "ok") return assert.fail("expected ok");
      const owners = r.detail.members.filter((m) => m.role === "owner");
      assert.equal(owners.length, 1, `${g.id} owners`);
    }
  });

  it("receipt list is empty until sprint 2", async () => {
    const r = await loadGroupDetail("mock-2", MOCK);
    if (r.status !== "ok") return assert.fail("expected ok");
    assert.deepEqual(r.detail.receipts, []);
  });
});

describe("Task 1.3: loading, empty and error states", () => {
  it("list: empty server result is ok with no groups (empty state)", async () => {
    const { client } = listClient({ data: [], error: null });
    assert.deepEqual(await loadGroupList({ ...REAL, client }), {
      status: "ok",
      groups: [],
    });
  });

  it("list: null data is treated as empty, not a crash", async () => {
    const { client } = listClient({ data: null, error: null });
    assert.deepEqual(await loadGroupList({ ...REAL, client }), {
      status: "ok",
      groups: [],
    });
  });

  it("list: server error surfaces its message", async () => {
    const { client } = listClient({ data: null, error: { message: "boom" } });
    assert.deepEqual(await loadGroupList({ ...REAL, client }), {
      status: "error",
      message: "boom",
    });
  });

  it("list: a thrown network error becomes an error state", async () => {
    const r = await loadGroupList({ ...REAL, client: THROWING_CLIENT });
    assert.deepEqual(r, { status: "error", message: "network down" });
  });

  it("list: missing client explains how to configure", async () => {
    const r = await loadGroupList({ ...REAL, client: null });
    assert.deepEqual(r, { status: "error", message: NOT_CONFIGURED });
  });

  it("detail: non-403 server error is an error, not forbidden", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "500", message: "server exploded" },
    });
    const r = await loadGroupDetail("g1", { ...REAL, client });
    assert.deepEqual(r, { status: "error", message: "server exploded" });
  });

  it("detail: a thrown network error becomes an error state", async () => {
    const r = await loadGroupDetail("g1", { ...REAL, client: THROWING_CLIENT });
    assert.deepEqual(r, { status: "error", message: "network down" });
  });

  it("detail: missing client explains how to configure", async () => {
    const r = await loadGroupDetail("g1", { ...REAL, client: undefined });
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
    await loadGroupDetail("g1", { ...REAL, client });
    assert.deepEqual(calls, [{ fn: "get_group", args: { p_group_id: "g1" } }]);
  });

  it("returns the server's members, join code and receipts unchanged", async () => {
    const { client } = rpcClient({ data: payload, error: null });
    const r = await loadGroupDetail("g1", { ...REAL, client });
    assert.deepEqual(r, { status: "ok", detail: payload });
  });
});

describe("Task 1.5: a non-member is refused", () => {
  it("server code 42501 maps to forbidden", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "42501", message: "not a member" },
    });
    const r = await loadGroupDetail("g1", { ...REAL, client });
    assert.deepEqual(r, { status: "forbidden" });
  });

  it("forbidden result carries no group data", async () => {
    const { client } = rpcClient({
      data: null,
      error: { code: "42501", message: "not a member" },
    });
    const r = await loadGroupDetail("g1", { ...REAL, client });
    assert.ok(!("detail" in r));
  });

  it("mock mode: an unknown group id is forbidden", async () => {
    assert.deepEqual(await loadGroupDetail("not-my-group", MOCK), {
      status: "forbidden",
    });
  });

  it("mock mode: known ids are still reachable", async () => {
    const id = Object.keys(mockGroupDetails)[0];
    assert.equal((await loadGroupDetail(id, MOCK)).status, "ok");
  });
});