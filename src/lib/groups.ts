/* eslint-disable @typescript-eslint/naming-convention */

import {
  mockGroupDetails,
  mockGroups,
  mockGuestTokens,
  mockItemClaims,
  mockReceiptItems,
  USE_MOCK,
} from "./mock";
import { SUPABASE } from "./supabase";
import type {
  Group,
  GroupActionError,
  GroupActionResult,
  GroupMembership,
  GroupService,
  JoinGroupResult,
} from "./groups.types";

/**
 * The seed data has two ids for the same "Apartment 402" group, and joining
 * one joins both. Leaving and deleting treat them the same way.
 * @param groupId Group id
 * @returns The id plus any alias ids
 */
function mockAliasIds(groupId: string): string[] {
  if (groupId === "mock-1") return ["mock-1", "group-apt402"];
  if (groupId === "group-apt402") return ["group-apt402", "mock-1"];
  return [groupId];
}

/**
 * Removes every element matching a predicate from an array, in place, so
 * shared mock arrays keep their identity for other importers.
 * @param list Array to edit
 * @param shouldRemove Returns true for elements to drop
 */
function removeWhere<T>(list: T[], shouldRemove: (value: T) => boolean): void {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (shouldRemove(list[i])) list.splice(i, 1);
  }
}

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
 * Initial seed groups for development and testing.
 */
export const SEED_GROUPS: Group[] = [
  {
    id: "group-apt402",
    name: "Apartment 402",
    invite_code: "APT402",
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-1",
    name: "Apartment 402",
    invite_code: "JEW5SW2M",
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-2",
    name: "Road Trip 2026",
    invite_code: "K7Q2XPLM",
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-3",
    name: "Office Lunch Crew",
    invite_code: "LUNCH123",
    created_at: new Date().toISOString(),
  },
  {
    id: "group-beach26",
    name: "Beach House Trip",
    invite_code: "BEACH26",
    created_at: new Date().toISOString(),
  },
];


/**
 * In-memory Mock Group Service for development and offline testing.
 */
export class MockGroupService implements GroupService {
  private groups: Group[];
  private members: GroupMembership[];

  /**
   * Initializes mock groups and memberships.
   * @param initialGroups Initial seed groups
   * @param initialMembers Initial memberships
   */
  constructor(
    initialGroups: Group[] = SEED_GROUPS,
    initialMembers: GroupMembership[] = []
  ) {
    this.groups = [...initialGroups];
    this.members = [...initialMembers];
  }

  /**
   * Resets mock data to seed values.
   * @param initialGroups Groups to reset to
   * @param initialMembers Memberships to reset to
   */
  reset(
    initialGroups: Group[] = SEED_GROUPS,
    initialMembers: GroupMembership[] = []
  ): void {
    this.groups = [...initialGroups];
    this.members = [...initialMembers];
  }

  /**
   * Joins a group by invite code in memory.
   * @param inviteCode The 8-character invite code
   * @param userId The user ID joining the group
   * @returns Join result with status and group data
   */
  async joinGroupByCode(
    inviteCode: string,
    userId: string = "current-user"
  ): Promise<JoinGroupResult> {
    const trimmed = (inviteCode || "").trim().toUpperCase();

    if (!trimmed) {
      return {
        success: false,
        error: "EMPTY_CODE",
        message: "Please enter an invite code",
      };
    }

    const group = this.groups.find(
      (g) =>
        g.invite_code.toUpperCase() === trimmed ||
        (trimmed === "APT402" && (g.id === "group-apt402" || g.id === "mock-1")) ||
        (trimmed === "TSAPT402" && (g.id === "group-apt402" || g.id === "mock-1"))
    );

    if (!group) {
      return {
        success: false,
        error: "INVALID_CODE",
        message: "No group found with that invite code",
      };
    }

    const isMemberInService = this.members.some(
      (m) => m.group_id === group.id && m.user_id === userId
    );
    const isMemberInMock = mockGroupDetails[group.id]?.members?.some(
      (m: { user_id: string }) => m.user_id === userId
    );

    if (isMemberInService || isMemberInMock) {
      return {
        success: true,
        status: "ALREADY_MEMBER",
        group,
        message: "You are already in this group",
      };
    }

    const newMembership: GroupMembership = {
      id: `member-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      group_id: group.id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    };
    this.members.push(newMembership);

    // Sync with mockGroupDetails so the group page shows the new member
    const targetIds = [group.id];
    if (group.id === "mock-1") targetIds.push("group-apt402");
    if (group.id === "group-apt402") targetIds.push("mock-1");

    for (const tid of targetIds) {
      if (mockGroupDetails[tid]) {
        const alreadyMember = mockGroupDetails[tid].members.some(
          (m: { user_id: string }) => m.user_id === userId
        );
        if (!alreadyMember) {
          mockGroupDetails[tid].members.push({
            user_id: userId,
            display_name: "You",
            role: "member",
            joined_at: new Date().toISOString(),
          });
        }
      }
    }

    // Ensure it appears in mockGroups list
    if (!mockGroups.some((g) => g.id === group.id || (group.id === "group-apt402" && g.id === "mock-1"))) {
      mockGroups.push({ id: group.id, name: group.name });
    }

    return {
      success: true,
      status: "JOINED",
      group,
      message: `Joined ${group.name} successfully`,
    };
  }

  /**
   * Leaves a group in memory (US 2.4). Owners are refused so the group is
   * never left without an owner; they have to delete it instead.
   * @param groupId Group to leave
   * @param userId User leaving the group
   * @returns The left group's name, or why it failed
   */
  async leaveGroup(
    groupId: string,
    userId: string = "current-user"
  ): Promise<GroupActionResult> {
    const detail = mockGroupDetails[groupId];
    if (!detail) return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);

    const member = detail.members.find((m) => m.user_id === userId);
    const isOwner =
      member?.role === "owner" || detail.group.created_by === userId;

    if (!member && !isOwner) {
      return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);
    }
    if (isOwner) {
      return actionFailure(
        "OWNER_CANNOT_LEAVE",
        "Owners can't leave their group. Delete the group or transfer ownership instead."
      );
    }

    const ids = mockAliasIds(groupId);
    for (const id of ids) {
      const target = mockGroupDetails[id];
      if (target) {
        target.members = target.members.filter((m) => m.user_id !== userId);
      }
    }
    this.members = this.members.filter(
      (m) => !(ids.includes(m.group_id) && m.user_id === userId)
    );
    // mockGroups is the signed-in device user's group list.
    removeWhere(mockGroups, (g) => ids.includes(g.id));

    return {
      success: true,
      group_id: groupId,
      group_name: detail.group.name,
      message: `Left ${detail.group.name}`,
    };
  }

  /**
   * Deletes a group in memory for everyone (US 2.4), along with its
   * memberships, receipts, items, claims and guest links. Only the owner
   * can delete it.
   * @param groupId Group to delete
   * @param userId User asking to delete it
   * @returns The deleted group's name, or why it failed
   */
  async deleteGroup(
    groupId: string,
    userId: string = "current-user"
  ): Promise<GroupActionResult> {
    const detail = mockGroupDetails[groupId];
    if (!detail) return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);

    const member = detail.members.find((m) => m.user_id === userId);
    const isOwner =
      member?.role === "owner" || detail.group.created_by === userId;

    if (!isOwner) {
      return member
        ? actionFailure("FORBIDDEN", "Only the group owner can delete this group")
        : actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);
    }

    const ids = mockAliasIds(groupId);
    const receiptIds = new Set<string>();
    for (const id of ids) {
      for (const r of mockGroupDetails[id]?.receipts ?? []) receiptIds.add(r.id);
      delete mockGroupDetails[id];
    }

    // Keep receipts another remaining group still lists (shared seed data).
    for (const other of Object.values(mockGroupDetails)) {
      for (const r of other.receipts) receiptIds.delete(r.id);
    }

    const itemIds = new Set<string>();
    for (const rid of receiptIds) {
      for (const item of mockReceiptItems[rid] ?? []) itemIds.add(item.id);
      delete mockReceiptItems[rid];
    }
    removeWhere(
      mockItemClaims,
      (c) =>
        itemIds.has(c.item_id) ||
        (c.receipt_id !== undefined && receiptIds.has(c.receipt_id))
    );
    removeWhere(mockGuestTokens, (t) => receiptIds.has(t.receipt_id));

    removeWhere(mockGroups, (g) => ids.includes(g.id));
    this.groups = this.groups.filter((g) => !ids.includes(g.id));
    this.members = this.members.filter((m) => !ids.includes(m.group_id));

    return {
      success: true,
      group_id: groupId,
      group_name: detail.group.name,
      message: `${detail.group.name} deleted`,
    };
  }

  /**
   * Renames a group (mock implementation). Only the group owner may rename it.
   * @param groupId Group to rename
   * @param name New group name
   * @param userId ID of user requesting the rename
   * @returns Result with updated group name or failure reason
   */
  async renameGroup(
    groupId: string,
    name: string,
    userId: string = "current-user"
  ): Promise<GroupActionResult> {
    const detail = mockGroupDetails[groupId];
    if (!detail) {
      return actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);
    }

    const member = detail.members.find((m) => m.user_id === userId);
    const isOwner =
      member?.role === "owner" || detail.group.created_by === userId;

    if (!isOwner) {
      return member
        ? actionFailure("FORBIDDEN", "Only the group owner can rename this group")
        : actionFailure("NOT_FOUND", GROUP_NOT_FOUND_MESSAGE);
    }

    const validation = validateGroupRename(name);
    if (!validation.valid) {
      return actionFailure(validation.error, validation.message);
    }

    const ids = mockAliasIds(groupId);
    for (const id of ids) {
      if (mockGroupDetails[id]) {
        mockGroupDetails[id].group.name = validation.trimmed;
      }
    }
    for (const g of mockGroups) {
      if (ids.includes(g.id)) {
        g.name = validation.trimmed;
      }
    }
    for (const g of this.groups) {
      if (ids.includes(g.id)) {
        g.name = validation.trimmed;
      }
    }

    return {
      success: true,
      group_id: groupId,
      group_name: validation.trimmed,
      message: `Group renamed to ${validation.trimmed}`,
    };
  }

  /**
   * Gets current in-memory memberships.
   * @returns List of memberships
   */
  getMembers(): GroupMembership[] {
    return [...this.members];
  }

  /**
   * Adds a group to the in-memory list so it can be joined by its code.
   * @param group The group to add
   */
  addGroup(group: Group): void {
    this.groups.push(group);
  }

  /**
   * Gets current in-memory groups.
   * @returns List of groups
   */
  getGroups(): Group[] {
    return [...this.groups];
  }
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
 * Shared in-memory group service instance.
 */
export const MOCK_GROUP_SERVICE = new MockGroupService();

/**
 * Shared Supabase group service instance.
 */
export const SUPABASE_GROUP_SERVICE = new SupabaseGroupService();

/**
 * Registers a newly created group (US 1.2) with the mock service so it can
 * be joined by its invite code.
 * @param group Newly created group
 */
export function registerMockGroup(group: Group): void {
  MOCK_GROUP_SERVICE.addGroup(group);
}

/**
 * Primary joinGroup export: Uses Supabase when configured, otherwise falls back to MockGroupService.
 * @param inviteCode Invite code entered by user
 * @param userId User ID of the joining member
 * @returns Join result with group data or error
 */
export async function joinGroup(
  inviteCode: string,
  userId: string = "current-user"
): Promise<JoinGroupResult> {
  if (USE_MOCK) {
    return MOCK_GROUP_SERVICE.joinGroupByCode(inviteCode, userId);
  }
  if (SUPABASE) {
    const result = await SUPABASE_GROUP_SERVICE.joinGroupByCode(inviteCode);
    if (!result.success && (result.error === "NETWORK_ERROR" || result.error === "NOT_SIGNED_IN")) {
      return MOCK_GROUP_SERVICE.joinGroupByCode(inviteCode, userId);
    }
    return result;
  }
  return MOCK_GROUP_SERVICE.joinGroupByCode(inviteCode, userId);
}


/**
 * Leaves a group (US 2.4). Uses mock data when USE_MOCK is on (or Supabase
 * isn't configured), otherwise the leave_group RPC. Unlike joinGroup, this
 * never falls back to mock data after a server error, so a failed leave is
 * never reported as a success.
 * @param groupId Group to leave
 * @param userId User leaving (only used by the mock; the server uses auth)
 * @returns The left group's name, or why it failed
 */
export async function leaveGroup(
  groupId: string,
  userId: string = "current-user"
): Promise<GroupActionResult> {
  if (USE_MOCK || !SUPABASE) {
    return MOCK_GROUP_SERVICE.leaveGroup(groupId, userId);
  }
  return SUPABASE_GROUP_SERVICE.leaveGroup(groupId);
}

/**
 * Deletes a group for every member (US 2.4). Only the owner can do this.
 * Same mock/Supabase choice as leaveGroup.
 * @param groupId Group to delete
 * @param userId User deleting (only used by the mock; the server uses auth)
 * @returns The deleted group's name, or why it failed
 */
export async function deleteGroup(
  groupId: string,
  userId: string = "current-user"
): Promise<GroupActionResult> {
  if (USE_MOCK || !SUPABASE) {
    return MOCK_GROUP_SERVICE.deleteGroup(groupId, userId);
  }
  return SUPABASE_GROUP_SERVICE.deleteGroup(groupId);
}

/**
 * Renames a group. Only the owner can do this.
 * Same mock/Supabase choice as leaveGroup and deleteGroup.
 * @param groupId Group to rename
 * @param name New group name
 * @param userId User renaming (only used by the mock; the server uses auth)
 * @returns The updated group name, or why it failed
 */
export async function renameGroup(
  groupId: string,
  name: string,
  userId: string = "current-user"
): Promise<GroupActionResult> {
  if (USE_MOCK || !SUPABASE) {
    return MOCK_GROUP_SERVICE.renameGroup(groupId, name, userId);
  }
  return SUPABASE_GROUP_SERVICE.renameGroup(groupId, name);
}
