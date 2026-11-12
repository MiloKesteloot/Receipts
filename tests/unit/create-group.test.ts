/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 1.2: createGroup and validateGroupName tests with Supabase mocks.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createGroup,
  type CreateGroupResult,
  MAX_GROUP_NAME_LENGTH,
  validateGroupName,
} from "@/lib/create-group";
import type { SUPABASE } from "@/lib/supabase";

/**
 * Extracts error code from a create group result.
 * @param result The result object
 * @returns Error code or null
 */
function errorOf(result: CreateGroupResult | null): string | null {
  return result && !result.success ? result.error : null;
}

/**
 * Creates a fake Supabase client for createGroup testing.
 * @param handler RPC invocation handler
 * @returns Fake client and call log
 */
function createFakeCreateGroupClient(handler: (name: string) => {
  data: unknown;
  error: { code?: string; message: string } | null;
}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(handler(String(args.p_name)));
    },
  } as unknown as typeof SUPABASE;

  return { client, rpcCalls };
}

describe("US 1.2: group name rules", () => {
  test("empty name is rejected", () => {
    assert.equal(errorOf(validateGroupName("")), "EMPTY_NAME");
  });

  test("name with only spaces, tabs or newlines is rejected", () => {
    assert.equal(errorOf(validateGroupName("   ")), "EMPTY_NAME");
    assert.equal(errorOf(validateGroupName("\t\n ")), "EMPTY_NAME");
  });

  test("1-character name is accepted", () => {
    assert.equal(validateGroupName("A"), null);
  });

  test("exactly 50 characters is accepted", () => {
    assert.equal(validateGroupName("a".repeat(MAX_GROUP_NAME_LENGTH)), null);
  });

  test("51 characters is rejected", () => {
    const result = validateGroupName("a".repeat(MAX_GROUP_NAME_LENGTH + 1));
    assert.equal(errorOf(result), "NAME_TOO_LONG");
  });

  test("spaces around the name don't count toward the limit", () => {
    const padded = `  ${"a".repeat(MAX_GROUP_NAME_LENGTH)}  `;
    assert.equal(validateGroupName(padded), null);
  });

  test("emoji count as one character each, like the database", () => {
    assert.equal(validateGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH)), null);
    assert.equal(
      errorOf(validateGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH + 1))),
      "NAME_TOO_LONG"
    );
  });
});

describe("US 1.2: createGroup with Supabase mock", () => {
  test("empty name is rejected before calling database", async () => {
    const { client, rpcCalls } = createFakeCreateGroupClient(() => ({ data: null, error: null }));
    const result = await createGroup("   ", client);
    assert.equal(errorOf(result), "EMPTY_NAME");
    assert.equal(rpcCalls.length, 0);
  });

  test("too-long name is rejected before calling database", async () => {
    const { client, rpcCalls } = createFakeCreateGroupClient(() => ({ data: null, error: null }));
    const result = await createGroup("a".repeat(MAX_GROUP_NAME_LENGTH + 1), client);
    assert.equal(errorOf(result), "NAME_TOO_LONG");
    assert.equal(rpcCalls.length, 0);
  });

  test("valid name calls create_group RPC with trimmed name and returns group", async () => {
    const { client, rpcCalls } = createFakeCreateGroupClient((name) => ({
      data: {
        success: true,
        group: {
          id: "new-g1",
          name,
          invite_code: "APT402XY",
          created_at: "2026-10-01T00:00:00Z",
        },
        message: `Created ${name} successfully`,
      },
      error: null,
    }));

    const result = await createGroup("  Apartment 402  ", client);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.group.name, "Apartment 402");
      assert.equal(result.group.inviteCode, "APT402XY");
      assert.equal(result.group.id, "new-g1");
    }
    assert.deepEqual(rpcCalls, [{ fn: "create_group", args: { p_name: "Apartment 402" } }]);
  });

  test("error code 42501 maps to NOT_SIGNED_IN", async () => {
    const { client } = createFakeCreateGroupClient(() => ({
      data: null,
      error: { code: "42501", message: "Not signed in" },
    }));

    const result = await createGroup("Flat", client);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error, "NOT_SIGNED_IN");
      assert.match(result.message, /sign in/i);
    }
  });

  test("database network or generic error maps to NETWORK_ERROR", async () => {
    const { client } = createFakeCreateGroupClient(() => ({
      data: null,
      error: { message: "Connection reset" },
    }));

    const result = await createGroup("Flat", client);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error, "NETWORK_ERROR");
      assert.equal(result.message, "Connection reset");
    }
  });

  test("database returning success:false maps to error", async () => {
    const { client } = createFakeCreateGroupClient(() => ({
      data: {
        success: false,
        error: "NAME_TOO_LONG",
        message: "Name rejected by server",
      },
      error: null,
    }));

    const result = await createGroup("Flat", client);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error, "NAME_TOO_LONG");
      assert.equal(result.message, "Name rejected by server");
    }
  });

  test("unconfigured client returns NETWORK_ERROR", async () => {
    const result = await createGroup("Flat", null as unknown as typeof SUPABASE);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error, "NETWORK_ERROR");
      assert.match(result.message, /check \.env/i);
    }
  });
});
