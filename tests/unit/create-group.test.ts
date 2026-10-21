/// <reference types="node" />
/**
 * User Story 1.2, Task 1.5: edge-case tests for creating a group.
 * Tests the real `src/lib/create-group.ts` (not a copy of it).
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/create-group.test.ts
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. These tests run against the MOCK (`USE_MOCK_GROUPS = true`). They prove
 *    the app-side rules; they don't prove the database enforces them.
 * 2. "The creator is the owner" is a `test.todo`: only the real database
 *    sets the owner, so it can't be tested honestly yet. It belongs with the
 *    DB tasks (1.3 / 1.4) once the team settles how SQL is handled.
 * 3. UI behavior (double-tap guard, share sheet freeze fix) is checked by
 *    hand on a phone and listed in the PR descriptions, not tested here.
 * ==========================================================================
 */

import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";

import {
    createGroup,
    type CreateGroupResult,
    MAX_GROUP_NAME_LENGTH,
    USE_MOCK_GROUPS,
    validateGroupName,
} from "@/lib/create-group";

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
    assert.equal(USE_MOCK_GROUPS, true);
  });

  test("empty name is rejected before anything is created", async () => {
    const result = await createGroup("   ");
    assert.equal(errorOf(result), "EMPTY_NAME");
  });

  test("too-long name is rejected before anything is created", async () => {
    const result = await createGroup("a".repeat(MAX_GROUP_NAME_LENGTH + 1));
    assert.equal(errorOf(result), "NAME_TOO_LONG");
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

  // PLACEHOLDER #2: needs the real database (see header).
  test.todo("the creator is saved as the group's owner");
});
