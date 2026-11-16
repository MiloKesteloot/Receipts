/* eslint-disable @typescript-eslint/naming-convention -- database column names */
import {
  guestClaimKey,
  splitCents,
  toWholeCents,
} from "@/lib/claims";
import { NOT_CONFIGURED } from "@/lib/group-data";
import { SUPABASE } from "@/lib/supabase";

type DbError = { code?: string; message: string } | null;

/**
 * Identity inputs used to resolve a user's greeting display name.
 */
export type UserIdentityInput = {
  fullName?: string | null;
  name?: string | null;
  profileDisplayName?: string | null;
  email?: string | null;
};

/**
 * Auth user fields accepted by `loadHomeOverview` to avoid an extra `getUser` call
 * when the caller already holds the active session user.
 */
export type HomeOverviewUser = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  name?: string | null;
};

/**
 * Summary of the newest submitted receipt in a group.
 */
export type LatestReceiptSummary = {
  id: string;
  title: string;
  totalCents: number;
  createdAt: string;
};

/**
 * Group card view model displayed on the Home screen.
 */
export type HomeGroupSummary = {
  id: string;
  name: string;
  memberCount: number;
  latestReceipt: LatestReceiptSummary | null;
};

/**
 * Aggregated user balance totals across submitted receipts, in whole cents.
 */
export type HomeBalanceSummary = {
  owedToMeCents: number;
  iOweCents: number;
};

/**
 * Full Home screen data payload returned by `loadHomeOverview`.
 */
export type HomeOverview = {
  displayName: string;
  groups: HomeGroupSummary[];
  balances: HomeBalanceSummary;
};

/**
 * Database row shape for `groups`.
 */
export type OverviewGroupRow = {
  id: string;
  name: string;
};

/**
 * Database row shape for `group_members`.
 */
export type OverviewMemberRow = {
  group_id: string;
  user_id: string;
};

/**
 * Database row shape for `receipts`.
 */
export type OverviewReceiptRow = {
  id: string;
  group_id: string;
  title: string;
  total_cents: unknown;
  status?: string | null;
  created_at: string;
  created_by: string;
};

/**
 * Database row shape for `receipt_items`.
 */
export type OverviewItemRow = {
  id: string;
  receipt_id: string;
  amount_cents: unknown;
};

/**
 * Database row shape for `item_claims`.
 */
export type OverviewClaimRow = {
  item_id: string;
  user_id: string | null;
  guest_name: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type QueryResponse<T> = PromiseLike<{ data: T[] | null; error: DbError }>;

/**
 * Narrow Supabase client interface required by `loadHomeOverview` so unit tests
 * can inject a lightweight fake client.
 */
export type HomeOverviewClient = {
  auth: {
    getUser(): PromiseLike<{
      data: {
        user: {
          id: string;
          email?: string | null;
          user_metadata?: {
            full_name?: string | null;
            name?: string | null;
          } | null;
        } | null;
      };
      error?: DbError;
    }>;
  };
  from(table: string): {
    select(columns: string): {
      order(column: string): QueryResponse<Record<string, unknown>>;
      in(
        column: string,
        values: string[]
      ): QueryResponse<Record<string, unknown>>;
    };
  };
};

/**
 * Options for `loadHomeOverview`.
 */
export type HomeOverviewOptions = {
  client?: HomeOverviewClient | null;
  user?: HomeOverviewUser | null;
};

/**
 * Result returned by `loadHomeOverview`.
 */
export type HomeOverviewResult =
  | { status: "ok"; overview: HomeOverview }
  | { status: "error"; message: string };

/** Error returned when loading Home overview while signed out. */
const SIGNED_OUT_MESSAGE = "Please sign in to view your overview.";

/** Fallback greeting name when user has no metadata, profile name, or email prefix. */
const DEFAULT_GREETING_NAME = "there";

/**
 * Returns a trimmed non-empty string or null.
 * @param value Candidate string value
 * @returns Trimmed text or null
 */
function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extracts the non-empty local part before `@` from an email address.
 * @param email Candidate email address
 * @returns Email prefix or null
 */
function emailPrefix(email: string | null | undefined): string | null {
  const cleaned = trimmedOrNull(email);
  if (!cleaned) return null;
  const atIndex = cleaned.indexOf("@");
  if (atIndex <= 0) return null;
  return trimmedOrNull(cleaned.slice(0, atIndex));
}

/**
 * Resolves the greeting name for the signed-in user using the app's fallback chain:
 * `fullName` -> `name` -> `profileDisplayName` -> email local part -> `"there"`.
 * @param input Available user name and email fields
 * @returns Display name safe for greeting copy
 */
export function resolveDisplayName(input: UserIdentityInput): string {
  return (
    trimmedOrNull(input.fullName) ??
    trimmedOrNull(input.name) ??
    trimmedOrNull(input.profileDisplayName) ??
    emailPrefix(input.email) ??
    DEFAULT_GREETING_NAME
  );
}

/**
 * Compares two receipt records so the newest receipt sorts first.
 * Falls back to ISO string / id ordering when timestamps parse identically.
 * @param a First receipt
 * @param b Second receipt
 * @returns Negative if `a` should come before `b`
 */
function compareReceiptsNewestFirst(
  a: OverviewReceiptRow,
  b: OverviewReceiptRow
): number {
  const timeA = Date.parse(a.created_at);
  const timeB = Date.parse(b.created_at);
  if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.created_at !== b.created_at) {
    return b.created_at.localeCompare(a.created_at);
  }
  return b.id.localeCompare(a.id);
}

/**
 * Builds sorted group card view models containing unique member counts and the
 * newest submitted receipt per group.
 * @param groups User's groups
 * @param members Membership rows across those groups
 * @param receipts Receipt rows across those groups
 * @returns Group summary cards sorted alphabetically by group name
 */
export function buildGroupOverviewCards(
  groups: readonly OverviewGroupRow[],
  members: readonly OverviewMemberRow[],
  receipts: readonly OverviewReceiptRow[]
): HomeGroupSummary[] {
  const membersByGroup = new Map<string, Set<string>>();
  for (const row of members) {
    const existing = membersByGroup.get(row.group_id);
    if (existing) existing.add(row.user_id);
    else membersByGroup.set(row.group_id, new Set([row.user_id]));
  }

  const latestByGroup = new Map<string, OverviewReceiptRow>();
  for (const receipt of receipts) {
    if (receipt.status !== "submitted") continue;
    const currentLatest = latestByGroup.get(receipt.group_id);
    if (
      !currentLatest ||
      compareReceiptsNewestFirst(receipt, currentLatest) < 0
    ) {
      latestByGroup.set(receipt.group_id, receipt);
    }
  }

  return [...groups]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const latest = latestByGroup.get(group.id);
      return {
        id: group.id,
        name: group.name,
        memberCount: membersByGroup.get(group.id)?.size ?? 0,
        latestReceipt: latest
          ? {
              id: latest.id,
              title: latest.title,
              totalCents: toWholeCents(latest.total_cents) ?? 0,
              createdAt: latest.created_at,
            }
          : null,
      };
    });
}

/**
 * Maps a raw claim row to its split-cents claimant key (`user_id` or `guest:...`).
 * @param row Raw `item_claims` row
 * @returns Claimant key or null when neither member nor guest is set
 */
function claimantKeyForRow(row: OverviewClaimRow): string | null {
  const userId = trimmedOrNull(row.user_id);
  if (userId) return userId;
  const guestName = trimmedOrNull(row.guest_name);
  return guestName ? guestClaimKey(guestName) : null;
}

/**
 * Calculates gross amounts owed to the current user and owed by the current user
 * across all `submitted` receipts using deterministic exact-cent splits (`splitCents`).
 * Draft receipts, unclaimed items, and items with invalid prices contribute `0`.
 * @param currentUserId Signed-in user ID
 * @param receipts Group receipt rows
 * @param items Receipt item rows
 * @param claims Item claim rows (member and guest claims)
 * @returns Total `owedToMeCents` and `iOweCents` in whole cents
 */
export function calculateUserBalances(
  currentUserId: string,
  receipts: readonly OverviewReceiptRow[],
  items: readonly OverviewItemRow[],
  claims: readonly OverviewClaimRow[]
): HomeBalanceSummary {
  const payerByReceipt = new Map<string, string>();
  for (const receipt of receipts) {
    if (receipt.status === "submitted") {
      payerByReceipt.set(receipt.id, receipt.created_by);
    }
  }

  const claimantsByItem = new Map<string, string[]>();
  for (const claim of claims) {
    const key = claimantKeyForRow(claim);
    if (!key) continue;
    const list = claimantsByItem.get(claim.item_id);
    if (list) list.push(key);
    else claimantsByItem.set(claim.item_id, [key]);
  }

  let owedToMeCents = 0;
  let iOweCents = 0;

  for (const item of items) {
    const payerId = payerByReceipt.get(item.receipt_id);
    if (!payerId) continue;

    const priceCents = toWholeCents(item.amount_cents);
    if (priceCents === null) continue;

    const claimants = claimantsByItem.get(item.id);
    if (!claimants || claimants.length === 0) continue;

    const shares = splitCents(priceCents, claimants);
    if (payerId === currentUserId) {
      for (const share of shares) {
        if (share.userId !== currentUserId) {
          owedToMeCents += share.cents;
        }
      }
    } else {
      const myShare = shares.find((share) => share.userId === currentUserId);
      if (myShare) {
        iOweCents += myShare.cents;
      }
    }
  }

  return { owedToMeCents, iOweCents };
}

/**
 * Turns a caught error into a safe UI message.
 * @param err Caught value
 * @returns Human-readable error string
 */
function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Reads rows from a Supabase table or throws if PostgREST returns an error.
 * @param response Awaited Supabase query result
 * @returns Non-null array of typed rows
 */
async function unwrapRows<Row>(
  response: QueryResponse<Record<string, unknown>>
): Promise<Row[]> {
  const { data, error } = await response;
  if (error) {
    throw new Error(error.message || "Failed to load Home overview.");
  }
  return (data ?? []) as unknown as Row[];
}

/**
 * Resolves the active user identity from explicit options or `client.auth.getUser()`.
 * @param client Active HomeOverviewClient
 * @param explicitUser Optional caller-supplied user identity
 * @returns User identity or null when signed out
 */
async function resolveActiveUser(
  client: HomeOverviewClient,
  explicitUser?: HomeOverviewUser | null
): Promise<HomeOverviewUser | null> {
  if (explicitUser) return explicitUser;
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error) {
    throw new Error(error.message || SIGNED_OUT_MESSAGE);
  }
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name,
    name: user.user_metadata?.name,
  };
}

/**
 * Loads the signed-in user's display name, group summary cards, and balance totals.
 * @param options Optional Supabase client override and pre-resolved user identity
 * @returns Overview data on success, or an error message on failure
 */
export async function loadHomeOverview(
  options?: HomeOverviewOptions
): Promise<HomeOverviewResult> {
  const client =
    options?.client !== undefined
      ? options.client
      : (SUPABASE as unknown as HomeOverviewClient | null);

  if (!client) {
    return { status: "error", message: NOT_CONFIGURED };
  }

  try {
    const activeUser = await resolveActiveUser(client, options?.user);
    if (!activeUser) {
      return { status: "error", message: SIGNED_OUT_MESSAGE };
    }

    const [groups, profileRows] = await Promise.all([
      unwrapRows<OverviewGroupRow>(
        client.from("groups").select("id, name").order("name")
      ),
      unwrapRows<ProfileRow>(
        client.from("profiles").select("id, display_name").in("id", [activeUser.id])
      ),
    ]);

    const displayName = resolveDisplayName({
      fullName: activeUser.fullName,
      name: activeUser.name,
      profileDisplayName: profileRows[0]?.display_name,
      email: activeUser.email,
    });

    if (groups.length === 0) {
      return {
        status: "ok",
        overview: {
          displayName,
          groups: [],
          balances: { owedToMeCents: 0, iOweCents: 0 },
        },
      };
    }

    const groupIds = groups.map((g) => g.id);
    const [members, receipts] = await Promise.all([
      unwrapRows<OverviewMemberRow>(
        client
          .from("group_members")
          .select("group_id, user_id")
          .in("group_id", groupIds)
      ),
      unwrapRows<OverviewReceiptRow>(
        client
          .from("receipts")
          .select("id, group_id, title, total_cents, status, created_at, created_by")
          .in("group_id", groupIds)
      ),
    ]);

    const submittedReceiptIds = receipts
      .filter((r) => r.status === "submitted")
      .map((r) => r.id);

    let items: OverviewItemRow[] = [];
    let claims: OverviewClaimRow[] = [];
    if (submittedReceiptIds.length > 0) {
      items = await unwrapRows<OverviewItemRow>(
        client
          .from("receipt_items")
          .select("id, receipt_id, amount_cents")
          .in("receipt_id", submittedReceiptIds)
      );

      const itemIds = items.map((item) => item.id);
      if (itemIds.length > 0) {
        claims = await unwrapRows<OverviewClaimRow>(
          client
            .from("item_claims")
            .select("item_id, user_id, guest_name")
            .in("item_id", itemIds)
        );
      }
    }

    return {
      status: "ok",
      overview: {
        displayName,
        groups: buildGroupOverviewCards(groups, members, receipts),
        balances: calculateUserBalances(activeUser.id, receipts, items, claims),
      },
    };
  } catch (err: unknown) {
    return { status: "error", message: errorMessageOf(err) };
  }
}
