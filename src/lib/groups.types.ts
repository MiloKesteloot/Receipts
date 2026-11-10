/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Group domain and service contracts for User Story 1.4: Join Group
 */

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by?: string;
  created_at?: string;
  role?: "owner" | "member";
}

export interface GroupMembership {
  id: string;
  group_id: string;
  user_id: string;
  role?: "owner" | "member";
  joined_at?: string;
}

export type JoinGroupStatus = "JOINED" | "ALREADY_MEMBER";

export type JoinGroupResult =
  | {
      success: true;
      status: "JOINED";
      group: Group;
      message: string;
    }
  | {
      success: true;
      status: "ALREADY_MEMBER";
      group: Group;
      message: string;
    }
  | {
      success: false;
      error: "INVALID_CODE" | "EMPTY_CODE" | "NOT_SIGNED_IN" | "NETWORK_ERROR";
      message: string;
    };

/**
 * Why leaving or deleting a group failed (User Story 2.4).
 * - NOT_FOUND: the group doesn't exist, or the caller can't see it.
 * - FORBIDDEN: the caller is a member but isn't allowed (non-owner deleting).
 * - OWNER_CANNOT_LEAVE: owners must delete the group (or transfer ownership).
 */
export type GroupActionError =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "OWNER_CANNOT_LEAVE"
  | "NOT_SIGNED_IN"
  | "NETWORK_ERROR";

export type GroupActionResult =
  | {
      success: true;
      group_id: string;
      group_name: string;
      message: string;
    }
  | {
      success: false;
      error: GroupActionError;
      message: string;
    };

export interface GroupService {
  joinGroupByCode(inviteCode: string, userId?: string): Promise<JoinGroupResult>;
  leaveGroup(groupId: string, userId?: string): Promise<GroupActionResult>;
  deleteGroup(groupId: string, userId?: string): Promise<GroupActionResult>;
}
