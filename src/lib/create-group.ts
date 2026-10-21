/**
 * User Story 1.2 (Create a group): the app-side "create group" call.
 *
 * Screens call `createGroup(name)` and never talk to Supabase directly, so
 * if the database function changes, only this file needs updating.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. `USE_MOCK_GROUPS = true` — the app uses the fake in-memory version
 *    below instead of the real database. Flip to `false` once BOTH:
 *      a) sign-in exists (or anonymous sign-in is enabled), because the
 *         real `create_group` refuses users who aren't signed in, and
 *      b) the team confirms `create_group` is in the shared database.
 * 2. `createGroupMock` — fake groups live only in memory and vanish when
 *    the app reloads. Nobody else can see or join them.
 * 3. `createGroupInDatabase` — written to match `create_group` in our SQL,
 *    but NOT yet tested against the real database (blocked by 1a/1b).
 * 4. This file is separate from Kellar's `groups.ts` (US 1.4) on purpose,
 *    until his work is on main. Then `createGroup` should move into his
 *    `GroupService` in a small follow-up PR.
 * ==========================================================================
 */

import { SUPABASE } from "@/lib/supabase";

/**
 * PLACEHOLDER (see #1 above): true = fake in-memory groups, false = real database.
 */
export const USE_MOCK_GROUPS = true;

/**
 * Longest allowed group name. Must match the 50-character check in the
 * database's `groups` table and `create_group` function.
 */
export const MAX_GROUP_NAME_LENGTH = 50;

/**
 * Characters allowed in invite codes: uppercase, without look-alikes
 * (no 0/O, 1/I/L). Same alphabet as `create_group` in the database.
 */
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Length of every invite code (team decision: 8 characters).
 */
const INVITE_CODE_LENGTH = 8;

/**
 * A group as the app sees it (camelCase; the database uses snake_case).
 */
export interface CreatedGroup {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
}

/**
 * Reasons creating a group can fail.
 */
export type CreateGroupError =
  | "EMPTY_NAME"
  | "NAME_TOO_LONG"
  | "NOT_SIGNED_IN"
  | "NETWORK_ERROR";

/**
 * Result of `createGroup`. Same `success` / `error` / `message` shape the
 * database function returns, so the two stay easy to compare.
 */
export type CreateGroupResult =
  | { success: true; group: CreatedGroup; message: string }
  | { success: false; error: CreateGroupError; message: string };

/**
 * A group row exactly as the database returns it. Database column names are
 * snake_case, which the team's lint rule would reject, so it's switched off
 * for this one type only.
 */
interface GroupRow {
  /* eslint-disable @typescript-eslint/naming-convention */
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * What the `create_group` database function returns.
 */
type CreateGroupResponse =
  | { success: true; group: GroupRow; message: string }
  | { success: false; error: "EMPTY_NAME" | "NAME_TOO_LONG"; message: string };

/**
 * Checks a group name the same way the database does: trims spaces, then
 * requires 1 to 50 characters. The screen uses this to show errors early;
 * the database still checks again, so this is for speed, not security.
 * @param name The name the user typed
 * @returns A failed result if the name is invalid, or null if it's fine
 */
export function validateGroupName(name: string): CreateGroupResult | null {
  const trimmed = name.trim();

  if (trimmed === "") {
    return {
      success: false,
      error: "EMPTY_NAME",
      message: "Please enter a group name",
    };
  }

  // Array.from counts emoji as one character, like the database does.
  if (Array.from(trimmed).length > MAX_GROUP_NAME_LENGTH) {
    return {
      success: false,
      error: "NAME_TOO_LONG",
      message: `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer`,
    };
  }

  return null;
}

/**
 * Creates a group with the user as owner and returns its invite code.
 * This is the only function screens should call.
 * @param name The group name the user typed
 * @returns The new group, or the reason it failed
 */
export async function createGroup(name: string): Promise<CreateGroupResult> {
  const invalid = validateGroupName(name);
  if (invalid) return invalid;

  return USE_MOCK_GROUPS
    ? createGroupMock(name.trim())
    : createGroupInDatabase(name.trim());
}

/**
 * PLACEHOLDER (see #2 above): pretends to create a group, without a
 * database. Waits briefly so the loading spinner is visible, like a real
 * network call would be.
 * @param name An already-validated, trimmed group name
 * @returns A fake group with a random invite code
 */
async function createGroupMock(name: string): Promise<CreateGroupResult> {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const group: CreatedGroup = {
    id: `mock-${Date.now()}`,
    name,
    inviteCode: generateMockInviteCode(),
    createdAt: new Date().toISOString(),
  };

  return { success: true, group, message: `Created ${name}` };
}

/**
 * PLACEHOLDER (part of #2 above): makes a random code from the same
 * alphabet as the database. It does not check for duplicates; the real
 * database does that.
 * @returns An 8-character invite code
 */
function generateMockInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length);
    code += INVITE_CODE_ALPHABET[index];
  }
  return code;
}

/**
 * PLACEHOLDER (see #3 above, untested): creates the group in Supabase by
 * calling the `create_group` database function.
 * @param name An already-validated, trimmed group name
 * @returns The new group, or the reason it failed
 */
async function createGroupInDatabase(name: string): Promise<CreateGroupResult> {
  if (!SUPABASE) {
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: "The app isn't connected to the database (check .env)",
    };
  }

  try {
    const { data, error } = await SUPABASE.rpc("create_group", {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      p_name: name,
    });

    if (error) {
      // 42501 is what create_group raises when nobody is signed in.
      if (error.code === "42501") {
        return {
          success: false,
          error: "NOT_SIGNED_IN",
          message: "Please sign in to create a group",
        };
      }
      return { success: false, error: "NETWORK_ERROR", message: error.message };
    }

    const response = data as CreateGroupResponse;
    if (!response.success) return response;

    return {
      success: true,
      message: response.message,
      group: {
        id: response.group.id,
        name: response.group.name,
        inviteCode: response.group.invite_code,
        createdAt: response.group.created_at,
      },
    };
  } catch {
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: "Couldn't reach the server. Check your connection.",
    };
  }
}
