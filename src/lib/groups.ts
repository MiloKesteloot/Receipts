/* eslint-disable @typescript-eslint/naming-convention */

import { SUPABASE } from "./supabase";
import type {
  GroupActionError,
  GroupActionResult,
  GroupService,
  JoinGroupResult,
} from "./groups.types";

/**
 * Builds a failed leave/delete result.
 * @param error Machine-readable reason
 * @param message Text to show the user
 * @returns The failure result
 */
function actionFailure(
  error: GroupActionError,
  message: string
): GroupActionResult {
  return { success: false, error, message };
}

/**
 * Message shown when a group doesn't exist or the caller can't see it.
 */
const GROUP_NOT_FOUND_MESSAGE = "Group not found";

/**
 * Longest allowed group name. Matches `groups.name` and `create_group`.
 */
export const MAX_GROUP_NAME_LENGTH = 50;

/**
 * Trims and validates a candidate group name.
 * @param name Raw group name input
 * @returns Validation outcome with trimmed string or failure reason
 */
function validateGroupRename(
  name: string
):
  | { valid: true; trimmed: string }
  | { valid: false; error: "EMPTY_NAME" | "NAME_TOO_LONG"; message: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "EMPTY_NAME",
      message: "Please enter a group name",
    };
  }
  if (Array.from(trimmed).length > MAX_GROUP_NAME_LENGTH) {
    return {
      valid: false,
      error: "NAME_TOO_LONG",
      message: `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, trimmed };
}




/**
 * Supabase-backed Group Service for production database RPC calls.
 */
export class SupabaseGroupService implements GroupService {
  /**
   * Joins a group via Supabase RPC function.
   * @param inviteCode The invite code to join with
   * @returns Join result from server
   */
  async joinGroupByCode(inviteCode: string): Promise<JoinGroupResult> {
    if (!SUPABASE) {
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: "Supabase client is not configured.",
      };
    }

    const trimmed = (inviteCode || "").trim().toUpperCase();
    if (!trimmed) {
      return {
        success: false,
        error: "EMPTY_CODE",
        message: "Please enter an invite code",
      };
    }

    try {
      const { data, error } = await SUPABASE.rpc("join_group", {
        p_invite_code: trimmed,
      });

      if (error) {
        if (error.code === "42501") {
          return {
            success: false,
            error: "NOT_SIGNED_IN",
            message: "Please sign in to join a group",
          };
        }
        return {
          success: false,
          error: "NETWORK_ERROR",
          message: error.message || "Failed to communicate with server.",
        };
      }

      return data as JoinGroupResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: msg,
      };
    }
  }

  /**
   * Leaves a group via the leave_group RPC. The server uses the signed-in
   * user, so no user ID is sent.
   * @param groupId Group to leave
   * @returns The left group's name, or why it failed
   */
  async leaveGroup(groupId: string): Promise<GroupActionResult> {
    return this.callGroupAction("leave_group", groupId);
  }

  /**
   * Deletes a group for everyone via the delete_group RPC (owner only).
   * @param groupId Group to delete
   * @returns The deleted group's name, or why it failed
   */
  async deleteGroup(groupId: string): Promise<GroupActionResult> {
    return this.callGroupAction("delete_group", groupId);
  }

  /**
   * Renames a group via Supabase table update (owner RLS policy enforces permission).
   * @param groupId Group to rename
   * @param name New group name
   * @returns Result with updated group name or failure reason
   */
  async renameGroup(groupId: string, name: string): Promise<GroupActionResult> {
    if (!SUPABASE) {
      return actionFailure("NETWORK_ERROR", "Supabase client is not configured.");
    }
    if (!groupId) return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);

    const validation = validateGroupRename(name);
    if (!validation.valid) {
      return actionFailure(validation.error, validation.message);
    }

    try {
      const { data, error } = await SUPABASE.from("groups")
        .update({ name: validation.trimmed })
        .eq("id", groupId)
        .select("id, name")
        .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          return actionFailure(
            "FORBIDDEN",
            "Only the group owner can rename this group"
          );
        }
        return actionFailure(
          "NETWORK_ERROR",
          error.message || "Failed to communicate with server."
        );
      }

      if (!data) {
        return actionFailure(
          "FORBIDDEN",
          "Group not found or only the owner can rename it"
        );
      }

      const updatedName = (data as { name?: string }).name ?? validation.trimmed;
      return {
        success: true,
        group_id: groupId,
        group_name: updatedName,
        message: `Group renamed to ${updatedName}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      return actionFailure("NETWORK_ERROR", msg);
    }
  }

  /**
   * Calls a leave/delete RPC and turns any failure into a result.
   * @param fn RPC name
   * @param groupId Group id argument
   * @returns The RPC's result, or a failure
   */
  private async callGroupAction(
    fn: "leave_group" | "delete_group",
    groupId: string
  ): Promise<GroupActionResult> {
    if (!SUPABASE) {
      return actionFailure("NETWORK_ERROR", "Supabase client is not configured.");
    }
    if (!groupId) return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);

    try {
      const { data, error } = await SUPABASE.rpc(fn, { p_group_id: groupId });
      if (error) {
        if (error.code === "42501") {
          return actionFailure("NOT_SIGNED_IN", "Please sign in and try again");
        }
        return actionFailure(
          "NETWORK_ERROR",
          error.message || "Failed to communicate with server."
        );
      }
      const result = data as GroupActionResult | null;
      if (!result || typeof result.success !== "boolean") {
        return actionFailure("NETWORK_ERROR", "Unexpected response from server.");
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      return actionFailure("NETWORK_ERROR", msg);
    }
  }
}

/**
 * Shared Supabase group service instance.
 */
export const SUPABASE_GROUP_SERVICE = new SupabaseGroupService();

/**
 * Primary joinGroup export: Joins a group by its invite code via Supabase.
 * @param inviteCode Invite code entered by user
 * @returns Join result with group data or error
 */
export async function joinGroup(
  inviteCode: string
): Promise<JoinGroupResult> {
  return SUPABASE_GROUP_SERVICE.joinGroupByCode(inviteCode);
}

/**
 * Leaves a group (US 2.4) via Supabase leave_group RPC.
 * @param groupId Group to leave
 * @returns The left group's name, or why it failed
 */
export async function leaveGroup(
  groupId: string
): Promise<GroupActionResult> {
  return SUPABASE_GROUP_SERVICE.leaveGroup(groupId);
}

/**
 * Deletes a group for every member (US 2.4). Only the owner can do this.
 * @param groupId Group to delete
 * @returns The deleted group's name, or why it failed
 */
export async function deleteGroup(
  groupId: string
): Promise<GroupActionResult> {
  return SUPABASE_GROUP_SERVICE.deleteGroup(groupId);
}

/**
 * Renames a group. Only the owner can do this.
 * @param groupId Group to rename
 * @param name New group name
 * @returns The updated group name, or why it failed
 */
export async function renameGroup(
  groupId: string,
  name: string
): Promise<GroupActionResult> {
  return SUPABASE_GROUP_SERVICE.renameGroup(groupId, name);
}
