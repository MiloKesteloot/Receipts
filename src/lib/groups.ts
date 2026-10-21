/* eslint-disable @typescript-eslint/naming-convention */

import { SUPABASE } from "./supabase";
import {
  Group,
  GroupMembership,
  GroupService,
  JoinGroupResult,
} from "./groups.types";

/**
 * Initial seed groups for development and testing.
 */
export const SEED_GROUPS: Group[] = [
  {
    id: "group-apt402",
    name: "Apartment 402",
    invite_code: "tsAPT402",
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
      (g) => g.invite_code.toUpperCase() === trimmed
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

    const newMembership: GroupMembership = {
      id: `member-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

  /**
   * Gets current in-memory memberships.
   * @returns List of memberships
   */
  getMembers(): GroupMembership[] {
    return [...this.members];
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
 * [TEAMMATE EDIT AREA]: Group creation (US 1.2) - wire up createGroup or register newly created groups with mock service here. Can be removed once implemented.
 * @param group Newly created group
 */
export function registerMockGroup(group: Group): void {
  MOCK_GROUP_SERVICE.getGroups().push(group);
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
  if (SUPABASE) {
    const result = await SUPABASE_GROUP_SERVICE.joinGroupByCode(inviteCode);
    if (!result.success && (result.error === "NETWORK_ERROR" || result.error === "NOT_SIGNED_IN")) {
      return MOCK_GROUP_SERVICE.joinGroupByCode(inviteCode, userId);
    }
    return result;
  }
  return MOCK_GROUP_SERVICE.joinGroupByCode(inviteCode, userId);
}
