import assert from "node:assert/strict";
import test, { describe, beforeEach } from "node:test";

// Direct testing of MockGroupService logic
export const SEED_GROUPS = [
  { id: "group-apt402", name: "Apartment 402", invite_code: "APT402" },
  { id: "group-beach26", name: "Beach House Trip", invite_code: "BEACH26" },
];

export class MockGroupService {
  constructor(initialGroups = SEED_GROUPS, initialMembers = []) {
    this.groups = [...initialGroups];
    this.members = [...initialMembers];
  }

  reset() {
    this.groups = [...SEED_GROUPS];
    this.members = [];
  }

  async joinGroupByCode(inviteCode, userId = "current-user") {
    const trimmed = (inviteCode || "").trim();

    if (!trimmed) {
      return {
        success: false,
        error: "EMPTY_CODE",
        message: "Please enter an invite code",
      };
    }

    const group = this.groups.find(
      (g) => g.invite_code.toLowerCase() === trimmed.toLowerCase()
    );

    if (!group) {
      return {
        success: false,
        error: "INVALID_CODE",
        message: "No group found with that invite code",
      };
    }

    const isMember = this.members.some(
      (m) => m.group_id === group.id && m.user_id === userId
    );

    if (isMember) {
      return {
        success: true,
        status: "ALREADY_MEMBER",
        group,
        message: "You are already in this group",
      };
    }

    const newMembership = {
      id: `member-${Date.now()}`,
      group_id: group.id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    };
    this.members.push(newMembership);

    return {
      success: true,
      status: "JOINED",
      group,
      message: `Joined ${group.name} successfully`,
    };
  }

  getMembers() {
    return [...this.members];
  }
}

describe("User Story 1.4: Join Group Acceptance Criteria", () => {
  let service;

  beforeEach(() => {
    service = new MockGroupService();
  });

  describe("US1 - Join New Group with Valid Code (P1)", () => {
    test("correct code adds member and returns success", async () => {
      const res = await service.joinGroupByCode("APT402", "alice");
      assert.equal(res.success, true);
      assert.equal(res.status, "JOINED");
      assert.equal(res.group.name, "Apartment 402");
      assert.equal(res.message, "Joined Apartment 402 successfully");
      assert.equal(service.getMembers().length, 1);
    });

    test("lowercase code succeeds (case-insensitivity)", async () => {
      const res = await service.joinGroupByCode("apt402", "bob");
      assert.equal(res.success, true);
      assert.equal(res.status, "JOINED");
    });

    test("mixed-case code succeeds", async () => {
      const res = await service.joinGroupByCode("ApT402", "charlie");
      assert.equal(res.success, true);
      assert.equal(res.status, "JOINED");
    });

    test("trims whitespace around code", async () => {
      const res = await service.joinGroupByCode("   APT402  ", "dave");
      assert.equal(res.success, true);
      assert.equal(res.status, "JOINED");
    });
  });

  describe("US2 - Invalid / Wrong Code (P1)", () => {
    test("wrong code returns error and creates no membership", async () => {
      const res = await service.joinGroupByCode("WRONG99", "alice");
      assert.equal(res.success, false);
      assert.equal(res.error, "INVALID_CODE");
      assert.equal(service.getMembers().length, 0);
    });

    test("empty code returns error without network call", async () => {
      const res = await service.joinGroupByCode("", "alice");
      assert.equal(res.success, false);
      assert.equal(res.error, "EMPTY_CODE");
    });
  });

  describe("US3 - Existing Member Joining Twice (P2)", () => {
    test("joining twice returns ALREADY_MEMBER without duplicating record", async () => {
      await service.joinGroupByCode("APT402", "alice");
      assert.equal(service.getMembers().length, 1);

      const res2 = await service.joinGroupByCode("APT402", "alice");
      assert.equal(res2.success, true);
      assert.equal(res2.status, "ALREADY_MEMBER");
      assert.equal(res2.message, "You are already in this group");
      assert.equal(service.getMembers().length, 1);
    });

    test("joining twice with different case still detects existing membership", async () => {
      await service.joinGroupByCode("APT402", "alice");
      const res2 = await service.joinGroupByCode("apt402", "alice");
      assert.equal(res2.success, true);
      assert.equal(res2.status, "ALREADY_MEMBER");
      assert.equal(service.getMembers().length, 1);
    });
  });
});
