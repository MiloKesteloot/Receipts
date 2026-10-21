/// <reference types="node" />
import assert from "node:assert/strict";
import test, { beforeEach, describe } from "node:test";
import { MockGroupService, SEED_GROUPS } from "../../src/lib/groups";

describe("User Story 1.4: Join Group via Invite Code", () => {
  let service: MockGroupService;

  beforeEach(() => {
    service = new MockGroupService(SEED_GROUPS, []);
  });

  describe("US1 - Join New Group with Valid Invite Code (P1)", () => {
    test("successfully joins group with exact code and adds member", async () => {
      const result = await service.joinGroupByCode("APT402", "user-alice");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "JOINED");
        assert.equal(result.group.name, "Apartment 402");
        assert.equal(result.group.invite_code, "APT402");
        assert.equal(result.message, "Joined Apartment 402 successfully");
      }

      const members = service.getMembers();
      assert.equal(members.length, 1);
      assert.equal(members[0].user_id, "user-alice");
      assert.equal(members[0].group_id, "group-apt402");
    });

    test("accepts lowercase code variant (case-insensitivity)", async () => {
      const result = await service.joinGroupByCode("apt402", "user-bob");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "JOINED");
        assert.equal(result.group.name, "Apartment 402");
      }
    });

    test("accepts mixed case code variant", async () => {
      const result = await service.joinGroupByCode("aPt402", "user-charlie");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "JOINED");
      }
    });

    test("trims leading and trailing whitespace", async () => {
      const result = await service.joinGroupByCode("   APT402   ", "user-dave");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.status, "JOINED");
      }
    });
  });

  describe("US2 - Handle Invalid or Wrong Invite Code (P1)", () => {
    test("returns error when code does not match any group", async () => {
      const result = await service.joinGroupByCode("INVALID999", "user-alice");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "INVALID_CODE");
        assert.match(result.message, /no group found/i);
      }

      // Assert no membership created
      assert.equal(service.getMembers().length, 0);
    });

    test("returns validation error when code is empty string", async () => {
      const result = await service.joinGroupByCode("", "user-alice");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EMPTY_CODE");
        assert.match(result.message, /enter an invite code/i);
      }
    });

    test("returns validation error when code is whitespace only", async () => {
      const result = await service.joinGroupByCode("    ", "user-alice");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "EMPTY_CODE");
      }
    });
  });

  describe("US3 - Existing Member Joining Twice (P2)", () => {
    test("returns ALREADY_MEMBER without duplicating membership records", async () => {
      // First join
      const firstJoin = await service.joinGroupByCode("APT402", "user-alice");
      assert.equal(firstJoin.success, true);
      assert.equal(service.getMembers().length, 1);

      // Second join with same code and user
      const secondJoin = await service.joinGroupByCode("APT402", "user-alice");
      assert.equal(secondJoin.success, true);
      if (secondJoin.success) {
        assert.equal(secondJoin.status, "ALREADY_MEMBER");
        assert.equal(secondJoin.group.name, "Apartment 402");
        assert.equal(secondJoin.message, "You are already in this group");
      }

      // Assert still exactly 1 membership
      assert.equal(service.getMembers().length, 1);
    });

    test("joining twice with case difference still detects existing membership", async () => {
      await service.joinGroupByCode("APT402", "user-alice");
      const repeatJoin = await service.joinGroupByCode("apt402", "user-alice");

      assert.equal(repeatJoin.success, true);
      if (repeatJoin.success) {
        assert.equal(repeatJoin.status, "ALREADY_MEMBER");
      }
      assert.equal(service.getMembers().length, 1);
    });
  });
});
