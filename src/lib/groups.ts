import {
  Group,
  GroupMembership,
  GroupService,
  JoinGroupResult,
} from "./groups.types";
import { supabase } from "./supabase";

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

export class MockGroupService implements GroupService {
  private groups: Group[];
  private members: GroupMembership[];

  constructor(
    initialGroups: Group[] = SEED_GROUPS,
    initialMembers: GroupMembership[] = []
  ) {
    this.groups = [...initialGroups];
    this.members = [...initialMembers];
  }

  reset(
    initialGroups: Group[] = SEED_GROUPS,
    initialMembers: GroupMembership[] = []
  ) {
    this.groups = [...initialGroups];
    this.members = [...initialMembers];
  }

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

  getMembers(): GroupMembership[] {
    return [...this.members];
  }

  getGroups(): Group[] {
    return [...this.groups];
  }
}

export class SupabaseGroupService implements GroupService {
  async joinGroupByCode(
    inviteCode: string,
    _userId?: string
  ): Promise<JoinGroupResult> {
    if (!supabase) {
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
      const { data, error } = await supabase.rpc("join_group", {
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
    } catch (err: any) {
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: err?.message || "An unexpected error occurred.",
      };
    }
  }
}

export const mockGroupService = new MockGroupService();
export const supabaseGroupService = new SupabaseGroupService();

// [TEAMMATE EDIT AREA]: Group creation (US 1.2) - wire up createGroup or register newly created groups with mock service here. Can be removed once implemented.
export function registerMockGroup(group: Group) {
  mockGroupService.getGroups().push(group);
}

export async function joinGroup(
  inviteCode: string,
  userId: string = "current-user"
): Promise<JoinGroupResult> {
  if (supabase) {
    const result = await supabaseGroupService.joinGroupByCode(inviteCode, userId);
    // Fall back to mock service if sign-in is not yet present or network is unavailable
    if (!result.success && (result.error === "NETWORK_ERROR" || result.error === "NOT_SIGNED_IN")) {
      return mockGroupService.joinGroupByCode(inviteCode, userId);
    }
    return result;
  }
  return mockGroupService.joinGroupByCode(inviteCode, userId);
}
