/* eslint-disable @typescript-eslint/naming-convention */
import { mockGroupDetails, mockGroups } from "@/lib/mock";

export type GroupSummary = { id: string; name: string };

export type Member = {
  user_id: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export type Receipt = {
  id: string;
  title: string;
  total_cents: number;
  created_at: string;
};

export type GroupDetail = {
  group: {
    id: string;
    name: string;
    invite_code: string;
    created_by: string;
    created_at: string;
  };
  members: Member[];
  receipts: Receipt[];
};

type DbError = { code?: string; message: string } | null;

/** The slice of the Supabase client these screens use. */
export type GroupsClient = {
  from(table: string): {
    select(columns: string): {
      order(
        column: string
      ): PromiseLike<{ data: GroupSummary[] | null; error: DbError }>;
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: DbError }>;
};

export type LoadOptions = {
  useMock: boolean;
  client: GroupsClient | null | undefined;
};

export type GroupListResult =
  | { status: "ok"; groups: GroupSummary[] }
  | { status: "error"; message: string };

export type GroupDetailResult =
  | { status: "ok"; detail: GroupDetail }
  | { status: "forbidden" }
  | { status: "error"; message: string };

/**
 * Indicates that Postgres not configured
 */
export const NOT_CONFIGURED = "Add your Supabase URL and key to .env";

/** Postgres "insufficient privilege": not a member, or group doesn't exist. */
export const NOT_MEMBER_CODE = "42501";

/**
 * Turns a thrown value into a readable message.
 * @param e The caught value
 * @returns A message safe to show on screen
 */
const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong";

/**
 * Loads the groups the signed-in user belongs to.
 * @param opts Mock flag and Supabase client
 * @returns The groups, or an error message
 */
export async function loadGroupList(
  opts: LoadOptions
): Promise<GroupListResult> {
  if (opts.useMock) return { status: "ok", groups: [...mockGroups] };
  if (!opts.client) return { status: "error", message: NOT_CONFIGURED };

  try {
    const { data, error } = await opts.client
      .from("groups")
      .select("id, name")
      .order("name");
    if (error) return { status: "error", message: error.message };
    return { status: "ok", groups: data ?? [] };
  } catch (e) {
    return { status: "error", message: messageOf(e) };
  }
}

/**
 * Loads one group's members, join code and receipts. Non-members get "forbidden".
 * @param id Group id
 * @param opts Mock flag and Supabase client
 * @returns The group detail, "forbidden", or an error message
 */
export async function loadGroupDetail(
  id: string,
  opts: LoadOptions
): Promise<GroupDetailResult> {
  if (opts.useMock) {
    const d = mockGroupDetails[id];
    return d
      ? { status: "ok", detail: d as GroupDetail }
      : { status: "forbidden" }; // unknown id behaves like "not a member"
  }
  if (!opts.client) return { status: "error", message: NOT_CONFIGURED };

  try {
    const { data, error } = await opts.client.rpc("get_group", {
      p_group_id: id,
    });
    if (error) {
      if (error.code === NOT_MEMBER_CODE) return { status: "forbidden" };
      return { status: "error", message: error.message };
    }
    return { status: "ok", detail: data as GroupDetail };
  } catch (e) {
    return { status: "error", message: messageOf(e) };
  }
}