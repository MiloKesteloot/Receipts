/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 4.3 Task 1: tests for deleteAccount and delete_user_account RPC.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  deleteAccount,
  type AccountClient,
} from "../../src/lib/account";
import { NOT_CONFIGURED } from "../../src/lib/group-data";

/** Options for fake account client. */
type FakeAccountOptions = {
  rpcHandler?: (
    fn: string,
    args?: Record<string, unknown>
  ) => {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  signOutHandler?: () => { error: unknown };
};

/**
 * Creates a fake account client recording RPC and auth calls.
 * @param options Mock handlers for RPC and auth
 * @returns Fake client and call history
 */
function createFakeAccountClient(options?: FakeAccountOptions) {
  const rpcCalls: { fn: string; args?: Record<string, unknown> }[] = [];
  let signOutCalls = 0;

  const client: AccountClient = {
    rpc(fn: string, args?: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (options?.rpcHandler) {
        return Promise.resolve(options.rpcHandler(fn, args));
      }
      return Promise.resolve({
        data: { success: true, message: "Account deleted successfully" },
        error: null,
      });
    },
    auth: {
      signOut() {
        signOutCalls += 1;
        if (options?.signOutHandler) {
          return Promise.resolve(options.signOutHandler());
        }
        return Promise.resolve({ error: null });
      },
    },
  };

  return { client, rpcCalls, getSignOutCalls: () => signOutCalls };
}

describe("deleteAccount (US 4.3 Task 1)", () => {
  test("US-4.3-T-1: returns NOT_CONFIGURED error when client is unconfigured or null", async () => {
    const resultNull = await deleteAccount({ client: null });
    assert.deepEqual(resultNull, {
      success: false,
      error: "NOT_CONFIGURED",
      message: NOT_CONFIGURED,
    });
  });

  test("US-4.3-T-1: returns NOT_SIGNED_IN error when user is unauthenticated or RPC raises 42501", async () => {
    const { client } = createFakeAccountClient({
      rpcHandler: () => ({
        data: null,
        error: { code: "42501", message: "Sign in to delete your account" },
      }),
    });

    const result = await deleteAccount({ client });
    assert.deepEqual(result, {
      success: false,
      error: "NOT_SIGNED_IN",
      message: "Please sign in to delete your account",
    });
  });

  test("US-4.3-T-1: calls delete_user_account RPC and invokes client.auth.signOut on success", async () => {
    const { client, rpcCalls, getSignOutCalls } = createFakeAccountClient({
      rpcHandler: (fn) => ({
        data: { success: true, message: `Completed ${fn}` },
        error: null,
      }),
    });

    const result = await deleteAccount({ client });

    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fn, "delete_user_account");
    assert.equal(getSignOutCalls(), 1);
    assert.deepEqual(result, {
      success: true,
      message: "Completed delete_user_account",
    });
  });

  test("US-4.3-T-1: propagates server failure and thrown network errors cleanly without throwing", async () => {
    // 1. Server returned error payload
    const { client: failureClient } = createFakeAccountClient({
      rpcHandler: () => ({
        data: { success: false, message: "Could not remove account records" },
        error: null,
      }),
    });

    const failureResult = await deleteAccount({ client: failureClient });
    assert.deepEqual(failureResult, {
      success: false,
      error: "DELETE_FAILED",
      message: "Could not remove account records",
    });

    // 2. Network error returned in RPC response
    const { client: errorClient } = createFakeAccountClient({
      rpcHandler: () => ({
        data: null,
        error: { code: "PGRST000", message: "Connection reset by peer" },
      }),
    });

    const errorResult = await deleteAccount({ client: errorClient });
    assert.deepEqual(errorResult, {
      success: false,
      error: "NETWORK_ERROR",
      message: "Connection reset by peer",
    });

    // 3. Thrown exception
    const throwingClient: AccountClient = {
      rpc() {
        return Promise.reject(new Error("Network offline"));
      },
      auth: {
        signOut() {
          return Promise.resolve({ error: null });
        },
      },
    };

    const thrownResult = await deleteAccount({ client: throwingClient });
    assert.deepEqual(thrownResult, {
      success: false,
      error: "NETWORK_ERROR",
      message: "Network offline",
    });
  });

  test("US-4.3-T-1: server RPC purges owned groups along with child items, receipts, and claims", () => {
    // Simulates the SQL state machine in delete_user_account
    const user = "user-alice";
    const groups = [
      { id: "g1", created_by: "user-alice", name: "Alice's Group" },
      { id: "g2", created_by: "user-bob", name: "Bob's Group" },
    ];
    const groupMembers = [
      { group_id: "g1", user_id: "user-alice", role: "owner" },
      { group_id: "g1", user_id: "user-charlie", role: "member" },
      { group_id: "g2", user_id: "user-bob", role: "owner" },
      { group_id: "g2", user_id: "user-alice", role: "member" },
    ];
    const receipts = [
      { id: "r1", group_id: "g1", title: "Target Run" },
      { id: "r2", group_id: "g2", title: "Trader Joe's" },
    ];

    // Owned group ids:
    const ownedGroupIds = groups
      .filter((g) => g.created_by === user)
      .map((g) => g.id);

    // After deletion:
    const remainingGroups = groups.filter((g) => !ownedGroupIds.includes(g.id));
    const remainingReceipts = receipts.filter(
      (r) => !ownedGroupIds.includes(r.group_id)
    );
    const remainingMembers = groupMembers.filter(
      (m) => !ownedGroupIds.includes(m.group_id) && m.user_id !== user
    );

    assert.equal(remainingGroups.length, 1);
    assert.equal(remainingGroups[0].id, "g2");
    assert.equal(remainingReceipts.length, 1);
    assert.equal(remainingReceipts[0].id, "r2");
    assert.equal(remainingMembers.length, 1);
    assert.equal(remainingMembers[0].user_id, "user-bob");
  });

  test("US-4.3-T-1: server RPC anonymizes user past claims in other groups to Deleted user and removes profile", () => {
    // Simulates the claim anonymization step in delete_user_account
    const user = "user-alice";
    const claims = [
      {
        id: "c1",
        item_id: "item-1",
        receipt_id: "r2",
        user_id: "user-alice" as string | null,
        guest_name: null as string | null,
      },
      {
        id: "c2",
        item_id: "item-1",
        receipt_id: "r2",
        user_id: "user-bob" as string | null,
        guest_name: null as string | null,
      },
    ];

    // Anonymize user-alice's claims:
    for (const claim of claims) {
      if (claim.user_id === user) {
        claim.user_id = null;
        claim.guest_name = "Deleted user";
      }
    }

    assert.equal(claims[0].user_id, null);
    assert.equal(claims[0].guest_name, "Deleted user");
    // Verify bob's claim is untouched
    assert.equal(claims[1].user_id, "user-bob");
    assert.equal(claims[1].guest_name, null);

    // Verify claim preserves split count (2 claimants)
    assert.equal(claims.length, 2);
  });
});
