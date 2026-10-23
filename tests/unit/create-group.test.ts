/// <reference types="node" />
/**
 * User Story 1.2, Task 1.5: edge-case tests for creating a group.
 * Tests the real `src/lib/create-group.ts` (not a copy of it).
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/create-group.test.ts
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. These tests run against the MOCK (the team's `USE_MOCK = true`). They
 *    prove the app-side rules; they don't prove the database enforces them.
 * 2. "The creator is the owner" is tested against the mock only. The
 *    database version stays a `test.todo` until it can be tested for real;
 *    it belongs with the DB tasks (1.3 / 1.4) once the team settles how SQL
 *    is handled.
 * 3. UI behavior (double-tap guard, share sheet freeze fix, modal can't
 *    close while sharing) is checked by hand on a phone and listed in the
 *    PR descriptions, not tested here.
 * 4. Creating a mock group changes shared in-memory data (`mockGroups`,
 *    `mockGroupDetails`, Kellar's mock join service). `afterEach` puts all
 *    three back, so tests pass in any order. Remove that with the mock.
 * ==========================================================================
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

import {
    createGroup,
    type CreatedGroup,
    type CreateGroupResult,
    MAX_GROUP_NAME_LENGTH,
    MOCK_CURRENT_USER_ID,
    validateGroupName,
} from "@/lib/create-group";
import { joinGroup, MOCK_GROUP_SERVICE } from "@/lib/groups";
import { mockGroupDetails, mockGroups, USE_MOCK } from "@/lib/mock";

/**
 * Valid invite code: 8 characters, uppercase, no look-alikes (0/O, 1/I/L).
 * Same pattern as the database's `groups.invite_code` check.
 */
const INVITE_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

/**
 * How long the mock pretends the network takes (see create-group.ts).
 */
const MOCK_DELAY_MS = 600;

/**
 * PLACEHOLDER #4: the shared mock data as it was before each test.
 */
const SAVED = {
  groups: [...mockGroups],
  detailIds: new Set(Object.keys(mockGroupDetails)),
};

/**
 * Gets the error code from a result, or null if it succeeded / was valid.
 * @param result A result from `validateGroupName` or `createGroup`
 * @returns The error code, or null
 */
function errorOf(result: CreateGroupResult | null): string | null {
  return result && !result.success ? result.error : null;
}

/**
 * Calls `createGroup` without actually waiting for the mock's fake delay.
 * @param name The group name to try
 * @returns Whatever `createGroup` returns
 */
async function createGroupInstantly(name: string) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = createGroup(name);
    mock.timers.tick(MOCK_DELAY_MS);
    return await pending;
  } finally {
    mock.timers.reset();
  }
}

/**
 * Creates a group that must succeed, and returns it.
 * @param name The group name
 * @returns The new group
 */
async function createGroupOrFail(name: string): Promise<CreatedGroup> {
  const result = await createGroupInstantly(name);
  if (!result.success) assert.fail(`createGroup failed: ${result.message}`);
  return result.group;
}

beforeEach(() => {
  SAVED.groups = [...mockGroups];
  SAVED.detailIds = new Set(Object.keys(mockGroupDetails));
});

// PLACEHOLDER #4: undo whatever the test added to the shared mock data.
afterEach(() => {
  mockGroups.splice(0, mockGroups.length, ...SAVED.groups);
  for (const id of Object.keys(mockGroupDetails)) {
    if (!SAVED.detailIds.has(id)) delete mockGroupDetails[id];
  }
  MOCK_GROUP_SERVICE.reset();
});

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
      "NAME_TOO_LONG",
    );
  });
});

describe("US 1.2: createGroup", () => {
  test("tests are running against the mock (see PLACEHOLDER #1)", () => {
    assert.equal(USE_MOCK, true);
  });

  test("empty name is rejected before anything is created", async () => {
    const before = mockGroups.length;
    const result = await createGroup("   ");
    assert.equal(errorOf(result), "EMPTY_NAME");
    assert.equal(mockGroups.length, before);
  });

  test("too-long name is rejected before anything is created", async () => {
    const before = mockGroups.length;
    const result = await createGroup("a".repeat(MAX_GROUP_NAME_LENGTH + 1));
    assert.equal(errorOf(result), "NAME_TOO_LONG");
    assert.equal(mockGroups.length, before);
  });

  test("valid name creates a group with the trimmed name", async () => {
    const result = await createGroupInstantly("  Apartment 402  ");
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.group.name, "Apartment 402");
  });

  test("invite codes are 8 characters with no look-alikes", async () => {
    for (let i = 0; i < 200; i++) {
      const result = await createGroupInstantly("Apartment 402");
      assert.equal(result.success, true);
      if (result.success) {
        assert.match(result.group.inviteCode, INVITE_CODE_PATTERN);
      }
    }
  });

  test("each new group gets its own ID and invite code", async () => {
    const first = await createGroupOrFail("Same Name");
    const second = await createGroupOrFail("Same Name");
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.inviteCode, second.inviteCode);
  });

  // PLACEHOLDER #2: needs the real database (see header).
  test.todo("the database saves the creator as the group's owner");
});

describe("US 1.2: created groups work with the rest of the app (mock)", () => {
  test("a new group appears in the Home list", async () => {
    const group = await createGroupOrFail("Apartment 402");
    assert.ok(mockGroups.some((g) => g.id === group.id && g.name === group.name));
  });

  test("someone else can join it with its invite code", async () => {
    const group = await createGroupOrFail("Road Trip");
    const result = await joinGroup(group.inviteCode.toLowerCase(), "user-roommate");

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.status, "JOINED");
      assert.equal(result.group.id, group.id);
      assert.equal(result.group.invite_code, group.inviteCode);
    }
  });

  // PLACEHOLDER #2: mock version of the owner rule.
  test("the creator is the owner, so joining their own group says already a member", async () => {
    const group = await createGroupOrFail("Office Lunch");
    const result = await joinGroup(group.inviteCode, MOCK_CURRENT_USER_ID);

    assert.equal(result.success, true);
    if (result.success) assert.equal(result.status, "ALREADY_MEMBER");
  });

  test("its group page has data, with the creator as the only member and owner", async () => {
    const group = await createGroupOrFail("Beach House");
    const detail = mockGroupDetails[group.id];

    assert.ok(detail, "group page would show 'not a member'");
    assert.equal(detail.group.name, group.name);
    assert.equal(detail.group.invite_code, group.inviteCode);
    assert.equal(detail.group.created_by, MOCK_CURRENT_USER_ID);
    assert.deepEqual(
      detail.members.map((m) => [m.user_id, m.role]),
      [[MOCK_CURRENT_USER_ID, "owner"]],
    );
    assert.deepEqual(detail.receipts, []);
  });

  test("shared mock data starts clean (checks afterEach)", () => {
    assert.ok(mockGroups.every((g) => !g.id.startsWith("mock-created-")));
    assert.ok(
      Object.keys(mockGroupDetails).every((id) => !id.startsWith("mock-created-")),
    );
    assert.ok(
      MOCK_GROUP_SERVICE.getGroups().every((g) => !g.id.startsWith("mock-created-")),
    );
  });
});
