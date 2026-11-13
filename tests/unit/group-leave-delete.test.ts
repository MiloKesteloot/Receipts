/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 2.4 (Leave or delete a group): tests for leaveGroup, deleteGroup,
 * and renameGroup using Supabase mocks.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  deleteGroup,
  leaveGroup,
  renameGroup,
} from "../../src/lib/groups";
import type { GroupActionResult } from "../../src/lib/groups.types";
import type { SUPABASE } from "../../src/lib/supabase";

/** Options for fake group action client. */
type FakeGroupActionOptions = {
  rpcHandler?: (
    fn: string,
    args: Record<string, unknown>
  ) => {
    data: GroupActionResult | null;
    error: { code?: string; message: string } | null;
  };
  updateHandler?: (
    payload: Record<string, unknown>,
    eqId: string
  ) => {
    data: { id: string; name: string } | null;
    error: { code?: string; message: string } | null;
  };
};

/**
 * Creates a fake Supabase client for group leave/delete/rename actions.
 * @param options RPC and update handlers
 * @returns Fake client and call logs
 */
function createFakeGroupActionClient(options: FakeGroupActionOptions) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const updateCalls: { payload: Record<string, unknown>; eqId: string }[] = [];

  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (options.rpcHandler) {
        return Promise.resolve(options.rpcHandler(fn, args));
      }
      return Promise.resolve({ data: null, error: null });
    },
    from() {
      return {
        update(payload: Record<string, unknown>) {
          return {
            eq(col: string, val: string) {
              return {
                select() {
                  return {
                    maybeSingle() {
                      updateCalls.push({ payload, eqId: val });
                      if (options.updateHandler) {
                        return Promise.resolve(options.updateHandler(payload, val));
                      }
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
  } as unknown as typeof SUPABASE;

  return { client, rpcCalls, updateCalls };
}

describe("User Story 2.4: Leave or delete a group", () => {
  describe("leaving a group", () => {
    test("a non-owner member can leave successfully", async () => {
      const { client, rpcCalls } = createFakeGroupActionClient({
        rpcHandler: (fn, args) => ({
          data: {
            success: true,
            group_id: String(args.p_group_id),
            group_name: "Apartment 402",
            message: "Left Apartment 402",
          },
          error: null,
        }),
      });

      const result = await leaveGroup("group-1", client);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.group_name, "Apartment 402");
        assert.equal(result.message, "Left Apartment 402");
      }
      assert.deepEqual(rpcCalls, [{ fn: "leave_group", args: { p_group_id: "group-1" } }]);
    });

    test("an owner leaving gets OWNER_CANNOT_LEAVE error", async () => {
      const { client } = createFakeGroupActionClient({
        rpcHandler: () => ({
          data: {
            success: false,
            error: "OWNER_CANNOT_LEAVE",
            message: "Group owners cannot leave a group. Please delete the group or transfer ownership.",
          },
          error: null,
        }),
      });

      const result = await leaveGroup("group-1", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "OWNER_CANNOT_LEAVE");
        assert.match(result.message, /transfer ownership/i);
      }
    });

    test("empty group ID returns NOT_FOUND without calling RPC", async () => {
      const { client, rpcCalls } = createFakeGroupActionClient({});
      const result = await leaveGroup("", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NOT_FOUND");
      }
      assert.equal(rpcCalls.length, 0);
    });

    test("unauthenticated call with 42501 returns NOT_SIGNED_IN", async () => {
      const { client } = createFakeGroupActionClient({
        rpcHandler: () => ({
          data: null,
          error: { code: "42501", message: "Not signed in" },
        }),
      });

      const result = await leaveGroup("group-1", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NOT_SIGNED_IN");
      }
    });
  });

  describe("deleting a group", () => {
    test("the owner can delete the group", async () => {
      const { client, rpcCalls } = createFakeGroupActionClient({
        rpcHandler: (fn, args) => ({
          data: {
            success: true,
            group_id: String(args.p_group_id),
            group_name: "Apartment 402",
            message: "Apartment 402 deleted",
          },
          error: null,
        }),
      });

      const result = await deleteGroup("group-1", client);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.group_name, "Apartment 402");
        assert.equal(result.message, "Apartment 402 deleted");
      }
      assert.deepEqual(rpcCalls, [{ fn: "delete_group", args: { p_group_id: "group-1" } }]);
    });

    test("non-owner deleting is rejected with FORBIDDEN", async () => {
      const { client } = createFakeGroupActionClient({
        rpcHandler: () => ({
          data: {
            success: false,
            error: "FORBIDDEN",
            message: "Only the group owner can delete this group",
          },
          error: null,
        }),
      });

      const result = await deleteGroup("group-1", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "FORBIDDEN");
        assert.match(result.message, /only the group owner/i);
      }
    });

    test("empty group ID returns NOT_FOUND", async () => {
      const { client, rpcCalls } = createFakeGroupActionClient({});
      const result = await deleteGroup("", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NOT_FOUND");
      }
      assert.equal(rpcCalls.length, 0);
    });
  });

  describe("renaming a group", () => {
    test("allows owner to rename group", async () => {
      const { client, updateCalls } = createFakeGroupActionClient({
        updateHandler: (payload, id) => ({
          data: { id, name: String(payload.name) },
          error: null,
        }),
      });

      const result = await renameGroup("group-1", "  Apartment 402 Lounge  ", client);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.group_name, "Apartment 402 Lounge");
        assert.equal(result.message, "Group renamed to Apartment 402 Lounge");
      }
      assert.deepEqual(updateCalls, [
        { payload: { name: "Apartment 402 Lounge" }, eqId: "group-1" },
      ]);
    });

    test("rejects empty group name without query", async () => {
      const { client, updateCalls } = createFakeGroupActionClient({});
      const result = await renameGroup("group-1", "   ", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EMPTY_NAME");
      }
      assert.equal(updateCalls.length, 0);
    });

    test("rejects too long group name (>50 chars) without query", async () => {
      const { client, updateCalls } = createFakeGroupActionClient({});
      const result = await renameGroup("group-1", "a".repeat(51), client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NAME_TOO_LONG");
      }
      assert.equal(updateCalls.length, 0);
    });

    test("non-owner rename returns FORBIDDEN on 42501 error", async () => {
      const { client } = createFakeGroupActionClient({
        updateHandler: () => ({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
      });

      const result = await renameGroup("group-1", "New Name", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "FORBIDDEN");
        assert.match(result.message, /only the group owner/i);
      }
    });

    test("missing group on rename returns FORBIDDEN", async () => {
      const { client } = createFakeGroupActionClient({
        updateHandler: () => ({
          data: null,
          error: null,
        }),
      });

      const result = await renameGroup("missing-group", "New Name", client);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "FORBIDDEN");
      }
    });

    test("missing client returns NETWORK_ERROR", async () => {
      const result = await renameGroup("g1", "Name", null as unknown as typeof SUPABASE);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NETWORK_ERROR");
      }
    });
  });
});
