/**
 * Group domain and service contracts for User Story 1.4: Join Group
 */

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_at?: string;
}

export interface GroupMembership {
  id: string;
  group_id: string;
  user_id: string;
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
      error: "INVALID_CODE" | "EMPTY_CODE" | "NETWORK_ERROR";
      message: string;
    };

export interface GroupService {
  joinGroupByCode(inviteCode: string, userId: string): Promise<JoinGroupResult>;
}
