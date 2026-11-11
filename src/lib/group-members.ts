/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.2: an owner removes members from their group.
 *
 * Only the group owner can remove members. The UI hides the controls from
 * everyone else, but the real check is on the server: real mode always goes
 * through the `remove_group_member` RPC, which re-checks the caller's role.
 * Mock mode applies the same owner check in memory.
 */
import { NOT_CONFIGURED, type GroupSummary } from "@/lib/group-data";
import { mockGroupDetails } from "@/lib/mock";

type DbError = { code?: string; message: string } | null;

/** The member fields the owner checks need. */
export type MemberLike = {
  user_id: string;
  role: "owner" | "member";
};

/** The group detail fields the owner checks need. */
export type OwnershipDetail = {
  group: { created_by: string };
  members: readonly MemberLike[];
};

/**
 * The slice of the Supabase client loadOwnedGroups uses. It is separate from
 * GroupsClient in group-data.ts because the owned-groups query needs `.eq()`.
 */
export type GroupMembersClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        order(
          column: string
        ): PromiseLike<{ data: GroupSummary[] | null; error: DbError }>;
      };
    };
  };
};

/** The slice of the Supabase client removeGroupMembers uses. */
export type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: DbError }>;
};

/** Mock flag and Supabase client, like LoadOptions in group-data.ts. */
export type GroupMembersOptions = {
  useMock: boolean;
  client: GroupMembersClient | null | undefined;
};

/**
 * Options for removeGroupMembers. Passing the group's members lets real mode
 * skip owner ids before calling the server.
 */
export type RemoveMembersOptions = {
  useMock: boolean;
  client: RpcClient | null | undefined;
  members?: readonly MemberLike[];
};

export type OwnedGroupsResult =
  | { status: "ok"; groups: GroupSummary[] }
  | { status: "error"; message: string };

export type RemoveFailure = { userId: string; message: string };

export type RemoveMembersResult = {
  removed: string[];
  failed: RemoveFailure[];
};

/** Shown when someone who isn't the owner tries to remove members. */
export const NOT_OWNER_MESSAGE = "Only group owners can remove members";

/** Shown when the owner (or another owner) is picked for removal. */
export const CANNOT_REMOVE_OWNER_MESSAGE = "The group owner can't be removed";

/** Shown when the caller picked themselves. */
export const CANNOT_REMOVE_SELF_MESSAGE = "You can't remove yourself";

/** Shown when there is no signed-in user to load groups for. */
export const SIGNED_OUT_MESSAGE = "Sign in to manage your groups";

/**
 * Turns a thrown value into a readable message.
 * @param e The caught value
 * @returns A message safe to show on screen
 */
const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong";

/**
 * Whether the user owns the group: their member row has role "owner", or
 * they created the group. Every screen uses this, so the rule lives in one
 * place.
 * @param detail The loaded group, or null/undefined while it loads
 * @param currentUserId Signed-in user id, or undefined when unknown
 * @returns True only when the user is known and owns the group
 */
export function isGroupOwner(
  detail: OwnershipDetail | null | undefined,
  currentUserId: string | undefined
): boolean {
  if (!detail || currentUserId === undefined || currentUserId === "") {
    return false;
  }
  const me = detail.members.find((m) => m.user_id === currentUserId);
  return me?.role === "owner" || detail.group.created_by === currentUserId;
}

/**
 * The members the current user may pick for removal: everyone except
 * themselves and anyone with role "owner".
 * @param members The group's members
 * @param currentUserId Signed-in user id
 * @returns The removable members, in their original order
 */
export function removableMembers<T extends MemberLike>(
  members: readonly T[],
  currentUserId: string | undefined
): T[] {
  return members.filter(
    (m) => m.user_id !== currentUserId && m.role !== "owner"
  );
}

/**
 * Loads the groups the user owns, sorted by name, for the "Remove members"
 * picker.
 * @param userId Signed-in user id, or undefined when signed out
 * @param opts Mock flag and Supabase client
 * @returns The owned groups, or an error message
 */
export async function loadOwnedGroups(
  userId: string | undefined,
  opts: GroupMembersOptions
): Promise<OwnedGroupsResult> {
  if (userId === undefined || userId === "") {
    return { status: "error", message: SIGNED_OUT_MESSAGE };
  }

  if (opts.useMock) {
    const groups = Object.values(mockGroupDetails)
      .filter((d) => isGroupOwner(d, userId))
      .map((d) => ({ id: d.group.id, name: d.group.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { status: "ok", groups };
  }
  if (!opts.client) return { status: "error", message: NOT_CONFIGURED };

  try {
    const { data, error } = await opts.client
      .from("groups")
      .select("id, name")
      .eq("created_by", userId)
      .order("name");
    if (error) return { status: "error", message: error.message };
    return { status: "ok", groups: data ?? [] };
  } catch (e) {
    return { status: "error", message: messageOf(e) };
  }
}

/**
 * Splits the requested ids into ones that may be sent and ones that are
 * refused up front (the caller, or anyone with role "owner").
 * @param userIds Ids the caller picked
 * @param currentUserId Signed-in user id
 * @param members The group's members, when known
 * @returns Ids to send, and the refused ids with a reason
 */
function screenTargets(
  userIds: readonly string[],
  currentUserId: string | undefined,
  members: readonly MemberLike[] | undefined
): { allowed: string[]; refused: RemoveFailure[] } {
  const ownerIds = new Set(
    (members ?? []).filter((m) => m.role === "owner").map((m) => m.user_id)
  );
  const allowed: string[] = [];
  const refused: RemoveFailure[] = [];

  for (const userId of new Set(userIds)) {
    if (userId === currentUserId) {
      refused.push({ userId, message: CANNOT_REMOVE_SELF_MESSAGE });
    } else if (ownerIds.has(userId)) {
      refused.push({ userId, message: CANNOT_REMOVE_OWNER_MESSAGE });
    } else {
      allowed.push(userId);
    }
  }
  return { allowed, refused };
}

/**
 * Removes the members from the group in memory. Only the owner may do it.
 * The members array is edited in place so other importers see the change.
 * @param groupId Group id
 * @param userIds Ids already screened by screenTargets
 * @param currentUserId Signed-in user id
 * @returns Who was removed and who wasn't
 */
function removeMockMembers(
  groupId: string,
  userIds: readonly string[],
  currentUserId: string | undefined
): RemoveMembersResult {
  const detail = mockGroupDetails[groupId];
  if (!detail || !isGroupOwner(detail, currentUserId)) {
    return {
      removed: [],
      failed: userIds.map((userId) => ({ userId, message: NOT_OWNER_MESSAGE })),
    };
  }

  const removed: string[] = [];
  const failed: RemoveFailure[] = [];
  for (const userId of userIds) {
    const index = detail.members.findIndex((m) => m.user_id === userId);
    if (index === -1) {
      failed.push({ userId, message: "Not a member of this group" });
    } else {
      detail.members.splice(index, 1);
      removed.push(userId);
    }
  }
  return { removed, failed };
}

/**
 * Removes members from a group, one `remove_group_member` RPC call per user,
 * in order. The server re-checks that the caller is the owner. The caller and
 * any owner are never sent; they come back in `failed`. Never throws.
 * @param groupId Group id
 * @param userIds Members to remove
 * @param currentUserId Signed-in user id
 * @param opts Mock flag, Supabase client, and optionally the group's members
 * @returns Ids that were removed, and the ones that failed with the reason
 */
export async function removeGroupMembers(
  groupId: string,
  userIds: readonly string[],
  currentUserId: string | undefined,
  opts: RemoveMembersOptions
): Promise<RemoveMembersResult> {
  const members = opts.useMock
    ? mockGroupDetails[groupId]?.members
    : opts.members;
  const { allowed, refused } = screenTargets(userIds, currentUserId, members);

  if (opts.useMock) {
    const result = removeMockMembers(groupId, allowed, currentUserId);
    return { removed: result.removed, failed: [...refused, ...result.failed] };
  }

  const client = opts.client;
  if (!client) {
    return {
      removed: [],
      failed: [
        ...refused,
        ...allowed.map((userId) => ({ userId, message: NOT_CONFIGURED })),
      ],
    };
  }

  const removed: string[] = [];
  const failed: RemoveFailure[] = [...refused];
  for (const userId of allowed) {
    try {
      const { data, error } = await client.rpc("remove_group_member", {
        p_group_id: groupId,
        p_target_user_id: userId,
      });
      const reply = data as { success?: boolean; message?: string } | null;
      if (error) {
        failed.push({ userId, message: error.message });
      } else if (!reply || reply.success !== true) {
        failed.push({
          userId,
          message: reply?.message ?? "Couldn't remove this member",
        });
      } else {
        removed.push(userId);
      }
    } catch (e) {
      failed.push({ userId, message: messageOf(e) });
    }
  }
  return { removed, failed };
}
