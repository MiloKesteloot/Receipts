/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable jsdoc/require-param-description */
/**
 * User Story 3.2: an owner removes members from their group.
 * Covers the owner rule, which members can be picked, the per-user RPC
 * calls, and the mock-mode path.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOT_CONFIGURED, type GroupSummary } from "@/lib/group-data";
import {
  CANNOT_REMOVE_OWNER_MESSAGE,
  CANNOT_REMOVE_SELF_MESSAGE,
  isGroupOwner,
  loadOwnedGroups,
  NOT_OWNER_MESSAGE,
  removableMembers,
  removeGroupMembers,
  SIGNED_OUT_MESSAGE,
  type GroupMembersClient,
  type MemberLike,
  type RpcClient,
} from "@/lib/group-members";

type DbError = { code?: string; message: string } | null;
type RpcReply = { data: unknown; error: DbError };

/**
 * Builds a fake client whose remove_group_member call answers per user.
 * @param replyFor Returns the reply for a target user id
 * @returns The fake client and a log of the rpc calls it received
 */
function rpcClient(replyFor: (userId: string) => RpcReply) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(replyFor(String(args.p_target_user_id)));
    },
  };
  return { client, calls };
}

/**
 * Builds a fake client whose owned-groups query returns the given result.
 * @param result The data and error to return
 * @param result.data
 * @param result.error
 * @returns The fake client and a log of the calls it received
 */
function ownedClient(result: { data: GroupSummary[] | null; error: DbError }) {
  const calls: string[] = [];
  const client: GroupMembersClient = {
    from(table) {
      calls.push(`from:${table}`);
      return {
        select(cols) {
          calls.push(`select:${cols}`);
          return {
            eq(col, value) {
              calls.push(`eq:${col}=${value}`);
              return {
                order(col2) {
                  calls.push(`order:${col2}`);
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

/** Successful RPC reply. */
const OK: RpcReply = { data: { success: true, message: "Member removed successfully" }, error: null };

/** Members of a server group: owner "o", members "a" and "b". */
const MEMBERS: MemberLike[] = [
  { user_id: "o", role: "owner" },
  { user_id: "a", role: "member" },
  { user_id: "b", role: "member" },
];

/**
 * Builds a group detail for the owner checks.
 * @param createdBy Creator id
 * @param members Members list
 * @returns A minimal group detail
 */
function detailOf(createdBy: string, members: MemberLike[]) {
  return { group: { created_by: createdBy }, members };
}

describe("isGroupOwner", () => {
  it("is true when the user's member row has role owner", () => {
    assert.equal(isGroupOwner(detailOf("someone-else", MEMBERS), "o"), true);
  });

  it("is true when the user created the group", () => {
    const members: MemberLike[] = [{ user_id: "c", role: "member" }];
    assert.equal(isGroupOwner(detailOf("c", members), "c"), true);
  });

  it("is false for a regular member", () => {
    assert.equal(isGroupOwner(detailOf("o", MEMBERS), "a"), false);
  });

  it("is false when the user is unknown or the group hasn't loaded", () => {
    assert.equal(isGroupOwner(detailOf("o", MEMBERS), undefined), false);
    assert.equal(isGroupOwner(null, "o"), false);
    assert.equal(isGroupOwner(undefined, "o"), false);
  });
});

describe("removableMembers", () => {
  it("leaves out the owner and the current user", () => {
    assert.deepEqual(
      removableMembers(MEMBERS, "o").map((m) => m.user_id),
      ["a", "b"]
    );
    const withSecondOwner: MemberLike[] = [...MEMBERS, { user_id: "o2", role: "owner" }];
    assert.deepEqual(
      removableMembers(withSecondOwner, "a").map((m) => m.user_id),
      ["b"]
    );
  });
});

describe("removeGroupMembers", () => {
  it("calls the RPC once per user, in order, and reports all removed", async () => {
    const { client, calls } = rpcClient(() => OK);
    const r = await removeGroupMembers("g1", ["a", "b"], "o", {
      client,
      members: MEMBERS,
    });
    assert.deepEqual(r, { removed: ["a", "b"], failed: [] });
    assert.deepEqual(calls, [
      { fn: "remove_group_member", args: { p_group_id: "g1", p_target_user_id: "a" } },
      { fn: "remove_group_member", args: { p_group_id: "g1", p_target_user_id: "b" } },
    ]);
  });

  it("treats success:false as a failure and keeps the server message", async () => {
    const { client } = rpcClient((id) =>
      id === "b"
        ? { data: { success: false, message: NOT_OWNER_MESSAGE }, error: null }
        : OK
    );
    const r = await removeGroupMembers("g1", ["a", "b"], "o", {
      client,
      members: MEMBERS,
    });
    assert.deepEqual(r, {
      removed: ["a"],
      failed: [{ userId: "b", message: NOT_OWNER_MESSAGE }],
    });
  });

  it("treats an RPC error as a failure and keeps its message", async () => {
    const { client } = rpcClient((id) =>
      id === "a" ? { data: null, error: { code: "42501", message: "Not signed in" } } : OK
    );
    const r = await removeGroupMembers("g1", ["a", "b"], "o", {
      client,
      members: MEMBERS,
    });
    assert.deepEqual(r, {
      removed: ["b"],
      failed: [{ userId: "a", message: "Not signed in" }],
    });
  });

  it("a thrown network error fails that user without throwing", async () => {
    const client: RpcClient = {
      rpc() {
        throw new Error("network down");
      },
    };
    const r = await removeGroupMembers("g1", ["a"], "o", {
      client,
      members: MEMBERS,
    });
    assert.deepEqual(r, {
      removed: [],
      failed: [{ userId: "a", message: "network down" }],
    });
  });

  it("never sends the caller or an owner to the RPC", async () => {
    const { client, calls } = rpcClient(() => OK);
    const members: MemberLike[] = [...MEMBERS, { user_id: "o2", role: "owner" }];
    const r = await removeGroupMembers("g1", ["o", "o2", "a", "a"], "o", {
      client,
      members,
    });
    assert.deepEqual(
      calls.map((c) => c.args.p_target_user_id),
      ["a"]
    );
    assert.deepEqual(r.removed, ["a"]);
    assert.deepEqual(r.failed, [
      { userId: "o", message: CANNOT_REMOVE_SELF_MESSAGE },
      { userId: "o2", message: CANNOT_REMOVE_OWNER_MESSAGE },
    ]);
  });

  it("missing client fails everyone with the setup message", async () => {
    const r = await removeGroupMembers("g1", ["a"], "o", {
      client: null,
    });
    assert.deepEqual(r, {
      removed: [],
      failed: [{ userId: "a", message: NOT_CONFIGURED }],
    });
  });
});

describe("loadOwnedGroups", () => {
  it("server mode queries groups created by the user, sorted by name", async () => {
    const rows = [{ id: "g1", name: "Alpha" }];
    const { client, calls } = ownedClient({ data: rows, error: null });
    const r = await loadOwnedGroups("o", { client });
    assert.deepEqual(calls, [
      "from:groups",
      "select:id, name",
      "eq:created_by=o",
      "order:name",
    ]);
    assert.deepEqual(r, { status: "ok", groups: rows });
  });

  it("server error surfaces its message", async () => {
    const { client } = ownedClient({ data: null, error: { message: "boom" } });
    assert.deepEqual(await loadOwnedGroups("o", { client }), {
      status: "error",
      message: "boom",
    });
  });

  it("no signed-in user is an error, with no query sent", async () => {
    const { client, calls } = ownedClient({ data: [], error: null });
    assert.deepEqual(await loadOwnedGroups(undefined, { client }), {
      status: "error",
      message: SIGNED_OUT_MESSAGE,
    });
    assert.deepEqual(calls, []);
  });

  it("empty owned groups returns ok with empty list", async () => {
    const { client } = ownedClient({ data: [], error: null });
    const r = await loadOwnedGroups("u2", { client });
    assert.deepEqual(r, {
      status: "ok",
      groups: [],
    });
  });
});
