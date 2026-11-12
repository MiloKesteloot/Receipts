/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { joinGroup, SupabaseGroupService } from "@/lib/groups";
import type { JoinGroupResult } from "@/lib/groups.types";
import type { SUPABASE } from "@/lib/supabase";

/**
 * Creates a fake Supabase client for testing group joining.
 * @param handler RPC response handler
 * @returns Fake client and call log
 */
function createFakeGroupClient(handler: (args: Record<string, unknown>) => {
  data: JoinGroupResult | null;
  error: { code?: string; message: string } | null;
}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(handler(args));
    },
    } as unknown as typeof SUPABASE;

  return { client, calls };
}

describe("User Story 1.4: Join Group via Invite Code", () => {
  const successGroup = {
    id: "group-apt402",
    name: "Apartment 402",
    invite_code: "APT402",
  };

  describe("US1 - Join New Group with Valid Invite Code (P1)", () => {
    test("successfully joins group with exact code and calls join_group RPC", async () => {
      const { client, calls } = createFakeGroupClient(() => ({
        data: {
          success: true,
          status: "JOINED",
          group: successGroup,
          message: "Joined Apartment 402 successfully",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("APT402");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "JOINED");
        assert.equal(result.group.name, "Apartment 402");
        assert.equal(result.group.invite_code, "APT402");
        assert.equal(result.message, "Joined Apartment 402 successfully");
      }
      assert.deepEqual(calls, [{ fn: "join_group", args: { p_invite_code: "APT402" } }]);
    });

    test("accepts lowercase code variant (case-insensitivity)", async () => {
      const { client, calls } = createFakeGroupClient(() => ({
        data: {
          success: true,
          status: "JOINED",
          group: successGroup,
          message: "Joined Apartment 402 successfully",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("apt402");

      assert.equal(result.success, true);
      assert.equal(calls[0].args.p_invite_code, "APT402");
    });

    test("accepts mixed case code variant", async () => {
      const { client, calls } = createFakeGroupClient(() => ({
        data: {
          success: true,
          status: "JOINED",
          group: successGroup,
          message: "Joined Apartment 402 successfully",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("aPt402");

      assert.equal(result.success, true);
      assert.equal(calls[0].args.p_invite_code, "APT402");
    });

    test("trims leading and trailing whitespace", async () => {
      const { client, calls } = createFakeGroupClient(() => ({
        data: {
          success: true,
          status: "JOINED",
          group: successGroup,
          message: "Joined Apartment 402 successfully",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("   APT402   ");

      assert.equal(result.success, true);
      assert.equal(calls[0].args.p_invite_code, "APT402");
    });
  });

  describe("US2 - Handle Invalid or Wrong Invite Code (P1)", () => {
    test("returns error when code does not match any group", async () => {
      const { client } = createFakeGroupClient(() => ({
        data: {
          success: false,
          error: "INVALID_CODE",
          message: "No group found with that invite code",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("INVALID999");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_CODE");
        assert.match(result.message, /no group found/i);
      }
    });

    test("returns validation error when code is empty string without calling RPC", async () => {
      const { client, calls } = createFakeGroupClient(() => ({ data: null, error: null }));
      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EMPTY_CODE");
        assert.match(result.message, /enter an invite code/i);
      }
      assert.equal(calls.length, 0);
    });

    test("returns validation error when code is whitespace only", async () => {
      const { client, calls } = createFakeGroupClient(() => ({ data: null, error: null }));
      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("    ");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EMPTY_CODE");
      }
      assert.equal(calls.length, 0);
    });
  });

  describe("US3 - Existing Member Joining Twice (P2)", () => {
    test("returns ALREADY_MEMBER when user is already in group", async () => {
      const { client } = createFakeGroupClient(() => ({
        data: {
          success: true,
          status: "ALREADY_MEMBER",
          group: successGroup,
          message: "You are already in this group",
        },
        error: null,
      }));

      const service = new SupabaseGroupService(client);
      const result = await service.joinGroupByCode("APT402");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "ALREADY_MEMBER");
        assert.equal(result.group.name, "Apartment 402");
        assert.equal(result.message, "You are already in this group");
      }
    });

    test("handles unconfigured client gracefully", async () => {
      const result = await joinGroup("APT402", null as unknown as typeof SUPABASE);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "NETWORK_ERROR");
        assert.match(result.message, /not configured/i);
      }
    });
  });
});

