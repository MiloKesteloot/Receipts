/**
 * User Story 1.2 (Create a group): the app-side "create group" call.
 *
 * Screens call `createGroup(name)` and never talk to Supabase directly, so
 * if the database function changes, only this file needs updating.
 */

import { SUPABASE } from "@/lib/supabase";

/**
 * Longest allowed group name. Must match the 50-character check in the
 * database's `groups` table and `create_group` function.
 */
export const MAX_GROUP_NAME_LENGTH = 50;

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
 * @param client Optional Supabase client override
 * @returns The new group, or the reason it failed
 */
export async function createGroup(
  name: string,
  client = SUPABASE
): Promise<CreateGroupResult> {
  const invalid = validateGroupName(name);
  if (invalid) return invalid;

  return createGroupInDatabase(name.trim(), client);
}

/**
 * Creates the group in Supabase by calling the `create_group` database function.
 * @param name An already-validated, trimmed group name
 * @param client Optional Supabase client override
 * @returns The new group, or the reason it failed
 */
async function createGroupInDatabase(
  name: string,
  client = SUPABASE
): Promise<CreateGroupResult> {
  if (!client) {
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: "The app isn't connected to the database (check .env)",
    };
  }

  try {
    const { data, error } = await client.rpc("create_group", {
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

    const raw = data as (CreateGroupResponse & Record<string, unknown>) | null;
    if (!raw) {
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "No data returned from server.",
      };
    }

    if (raw.success === false) {
      return {
        success: false,
        error: (raw.error as CreateGroupError) || "NETWORK_ERROR",
        message: (raw.message as string) || "Failed to create group",
      };
    }

    const groupObj = (raw.group as GroupRow | undefined) ?? (raw as unknown as GroupRow);

    return {
      success: true,
      message: (raw.message as string) || `Created ${groupObj.name} successfully`,
      group: {
        id: groupObj.id,
        name: groupObj.name,
        inviteCode: groupObj.invite_code,
        createdAt: groupObj.created_at,
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
