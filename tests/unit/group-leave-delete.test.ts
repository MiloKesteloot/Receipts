/// <reference types="node" />
/**
 * User Story 2.4 (Leave or delete a group), Task 5: role permissions and
 * edge cases for leaveGroup / deleteGroup, run against the mock service.
 */
import assert from "node:assert/strict";
import test, { afterEach, beforeEach, describe } from "node:test";

import { loadGroupDetail, loadGroupList } from "../../src/lib/group-data";
import {
  deleteGroup,
  leaveGroup,
  MockGroupService,
  SEED_GROUPS,
} from "../../src/lib/groups";
import {
  mockGroupDetails,
  mockGroups,
  mockGuestTokens,
  mockItemClaims,
  mockReceiptItems,
} from "../../src/lib/mock";

/**
 * Options for loading mock group data.
 */
const MOCK_OPTS = { useMock: true, client: null };

/**
 * Snapshot of every shared mock store, so each test starts from the seed.
 */
type MockSnapshot = {
  details: typeof mockGroupDetails;
  groups: typeof mockGroups;
  items: typeof mockReceiptItems;
  claims: typeof mockItemClaims;
  tokens: typeof mockGuestTokens;
};

/**
 * Copies all shared mock stores.
 * @returns Deep copies of the stores
 */
function snapshot(): MockSnapshot {
  return structuredClone({
    details: mockGroupDetails,
    groups: mockGroups,
    items: mockReceiptItems,
    claims: mockItemClaims,
    tokens: mockGuestTokens,
  });
}

/**
 * Puts the shared mock stores back in place, keeping object identity.
 * @param s Snapshot from {@link snapshot}
 */
function restore(s: MockSnapshot): void {
  for (const key of Object.keys(mockGroupDetails)) delete mockGroupDetails[key];
  Object.assign(mockGroupDetails, s.details);
  for (const key of Object.keys(mockReceiptItems)) delete mockReceiptItems[key];
  Object.assign(mockReceiptItems, s.items);
  mockGroups.splice(0, mockGroups.length, ...s.groups);
  mockItemClaims.splice(0, mockItemClaims.length, ...s.claims);
  mockGuestTokens.splice(0, mockGuestTokens.length, ...s.tokens);
}

/**
 * Lists the groups a user belongs to in the mock data.
 * @param userId User id
 * @returns Group ids the user is a member of
 */
function groupIdsFor(userId: string): string[] {
  return Object.entries(mockGroupDetails)
    .filter(([, d]) => d.members.some((m) => m.user_id === userId))
    .map(([id]) => id);
}

describe("User Story 2.4: Leave or delete a group", () => {
  let service: MockGroupService;
  let saved: MockSnapshot;

  beforeEach(() => {
    saved = snapshot();
    service = new MockGroupService(SEED_GROUPS, []);
  });

  afterEach(() => {
    restore(saved);
  });

  describe("a non-owner member leaving", () => {
    test("is removed from the member list and their group list", async () => {
      assert.ok(groupIdsFor("u2").includes("mock-1"));

      const result = await service.leaveGroup("mock-1", "u2");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.group_name, "Apartment 402");
        assert.equal(result.message, "Left Apartment 402");
      }
      const members = mockGroupDetails["mock-1"].members.map((m) => m.user_id);
      assert.deepEqual(members, ["u1", "u3", "current-user"]);
      assert.ok(!groupIdsFor("u2").includes("mock-1"));
      // The alias of the same seed group is updated too.
      assert.ok(!groupIdsFor("u2").includes("group-apt402"));

      const list = await loadGroupList(MOCK_OPTS);
      assert.equal(list.status, "ok");
      if (list.status === "ok") {
        assert.ok(!list.groups.some((g) => g.id === "mock-1"));
      }
    });

    test("leaves a group they joined by invite code", async () => {
      await service.joinGroupByCode("LUNCH123", "user-zoe");
      assert.ok(mockGroups.some((g) => g.id === "mock-3"));

      const result = await service.leaveGroup("mock-3", "user-zoe");

      assert.equal(result.success, true);
      assert.deepEqual(service.getMembers(), []);
      assert.ok(!groupIdsFor("user-zoe").includes("mock-3"));
      assert.ok(!mockGroups.some((g) => g.id === "mock-3"));
      // The group itself still exists for its owner.
      assert.ok(mockGroupDetails["mock-3"]);
    });

    test("does not touch the group's receipts or claims", async () => {
      const claimsBefore = mockItemClaims.length;
      await service.leaveGroup("mock-1", "u3");

      assert.equal(mockGroupDetails["mock-1"].receipts.length, 2);
      assert.equal(mockItemClaims.length, claimsBefore);
    });
  });

  describe("an owner trying to leave", () => {
    test("gets an error saying to delete the group or transfer ownership", async () => {
      const result = await service.leaveGroup("mock-1", "u1");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "OWNER_CANNOT_LEAVE");
        assert.match(result.message, /delete/i);
        assert.match(result.message, /transfer ownership/i);
      }
      const members = mockGroupDetails["mock-1"].members.map((m) => m.user_id);
      assert.deepEqual(members, ["u1", "u2", "u3", "current-user"]);
    });

    test("is refused even as the only member", async () => {
      const result = await service.leaveGroup("mock-3", "u1");

      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "OWNER_CANNOT_LEAVE");
      assert.ok(mockGroupDetails["mock-3"]);
    });
  });

  describe("an owner deleting the group", () => {
    test("removes the group for every member", async () => {
      const result = await service.deleteGroup("mock-1", "u1");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.group_name, "Apartment 402");
        assert.equal(result.message, "Apartment 402 deleted");
      }
      assert.equal(mockGroupDetails["mock-1"], undefined);
      assert.equal(mockGroupDetails["group-apt402"], undefined);
      for (const user of ["u1", "u2", "u3", "current-user"]) {
        assert.ok(!groupIdsFor(user).includes("mock-1"), `${user} still sees it`);
      }
      assert.ok(!mockGroups.some((g) => g.id === "mock-1"));
    });

    test("cascades to receipts, items, claims and guest links", async () => {
      const receiptIds = mockGroupDetails["mock-1"].receipts.map((r) => r.id);
      const itemIds = receiptIds.flatMap((rid) =>
        (mockReceiptItems[rid] ?? []).map((i) => i.id)
      );
      assert.ok(itemIds.length > 0);
      assert.ok(mockItemClaims.some((c) => itemIds.includes(c.item_id)));
      assert.ok(mockGuestTokens.some((t) => receiptIds.includes(t.receipt_id)));

      await service.deleteGroup("mock-1", "u1");

      for (const rid of receiptIds) assert.equal(mockReceiptItems[rid], undefined);
      assert.ok(!mockItemClaims.some((c) => itemIds.includes(c.item_id)));
      assert.ok(
        !mockItemClaims.some(
          (c) => c.receipt_id !== undefined && receiptIds.includes(c.receipt_id)
        )
      );
      assert.ok(!mockGuestTokens.some((t) => receiptIds.includes(t.receipt_id)));
    });

    test("leaves other groups' receipts and claims alone", async () => {
      const claimsBefore = mockItemClaims.length;
      const result = await service.deleteGroup("mock-3", "u1");

      assert.equal(result.success, true);
      assert.ok(mockGroupDetails["mock-1"]);
      assert.ok(mockReceiptItems.r1);
      assert.equal(mockItemClaims.length, claimsBefore);
    });

    test("stops the invite code from working", async () => {
      await service.deleteGroup("mock-2", "u2");

      const join = await service.joinGroupByCode("K7Q2XPLM", "user-new");
      assert.equal(join.success, false);
      if (!join.success) assert.equal(join.error, "INVALID_CODE");
    });
  });

  describe("a non-owner trying to delete", () => {
    test("a member is rejected as forbidden and nothing is deleted", async () => {
      const claimsBefore = mockItemClaims.length;
      const result = await service.deleteGroup("mock-1", "u2");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "FORBIDDEN");
        assert.match(result.message, /only the group owner/i);
      }
      assert.ok(mockGroupDetails["mock-1"]);
      assert.equal(mockGroupDetails["mock-1"].members.length, 4);
      assert.equal(mockItemClaims.length, claimsBefore);
      assert.ok(mockReceiptItems.r1);
    });

    test("a non-member is told the group doesn't exist", async () => {
      const result = await service.deleteGroup("mock-1", "stranger");

      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_FOUND");
      assert.ok(mockGroupDetails["mock-1"]);
    });
  });

  describe("a group ID that doesn't exist", () => {
    for (const badId of ["does-not-exist", "", "00000000-0000-0000-0000-000000000000"]) {
      test(`leave and delete fail gracefully for ${JSON.stringify(badId)}`, async () => {
        const left = await service.leaveGroup(badId, "u1");
        const deleted = await service.deleteGroup(badId, "u1");

        assert.equal(left.success, false);
        assert.equal(deleted.success, false);
        if (!left.success) assert.equal(left.error, "NOT_FOUND");
        if (!deleted.success) assert.equal(deleted.error, "NOT_FOUND");
      });
    }

    test("the exported leaveGroup/deleteGroup also resolve without throwing", async () => {
      const left = await leaveGroup("does-not-exist", "u1");
      const deleted = await deleteGroup("does-not-exist", "u1");

      assert.equal(left.success, false);
      assert.equal(deleted.success, false);
    });

    test("a non-member leaving an existing group gets NOT_FOUND", async () => {
      const result = await service.leaveGroup("mock-1", "stranger");

      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_FOUND");
    });
  });

  describe("after a group is deleted", () => {
    beforeEach(async () => {
      const result = await service.deleteGroup("mock-1", "u1");
      assert.equal(result.success, true);
    });

    test("loading it returns forbidden (shown as Group not found)", async () => {
      const result = await loadGroupDetail("mock-1", MOCK_OPTS);
      assert.equal(result.status, "forbidden");
    });

    test("it is gone from the group list", async () => {
      const list = await loadGroupList(MOCK_OPTS);
      assert.equal(list.status, "ok");
      if (list.status === "ok") {
        assert.ok(!list.groups.some((g) => g.id === "mock-1"));
      }
    });

    test("deleting or leaving it again returns NOT_FOUND", async () => {
      const again = await service.deleteGroup("mock-1", "u1");
      const leave = await service.leaveGroup("mock-1", "u2");

      assert.equal(again.success, false);
      assert.equal(leave.success, false);
      if (!again.success) assert.equal(again.error, "NOT_FOUND");
      if (!leave.success) assert.equal(leave.error, "NOT_FOUND");
    });
  });
});
