/**
 * User Story 2.3 (Claim receipt items), Task 2: claiming and unclaiming items,
 * plus splitting a shared item's price between the people who claimed it.
 *
 * Real mode writes to `item_claims` directly. Row Level Security decides who
 * may claim: only members of the receipt's group (see the
 * `item_claims_member_only` migration). A blocked write comes back as 42501,
 * which these functions report as "forbidden".
 *
 * Guest claims (US 2.5, made through the share link) are loaded too, so they
 * count when an item's price is split. A guest has no user id, so each one is
 * keyed by `guestClaimKey(name)`. Members can't claim or unclaim for a guest.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. `mockItemClaims` (in `mock.ts`) keeps claims in memory, so they vanish
 *    when the app reloads. Remove it when `USE_MOCK` is turned off.
 * 2. `mockUserId` stands in for the signed-in user in mock mode and defaults
 *    to `MOCK_CURRENT_USER_ID`. Real requests use the session's user.
 * 3. `groupId` is only used for the mock's membership check. It's trusted as
 *    given and isn't checked against the item. The server finds the item's
 *    group itself.
 * ==========================================================================
 */

// TODO(remove-mock): Remove MOCK_CURRENT_USER_ID and `@/lib/mock` imports once offline mock mode is deleted.
import { MOCK_CURRENT_USER_ID } from "@/lib/create-group";
import { mockGroupDetails, mockItemClaims } from "@/lib/mock";
import { SUPABASE } from "@/lib/supabase";

/**
 * One person's claim on one item. `userId` is the member's id, or
 * `guestClaimKey(name)` for a guest, so splitting treats both the same way.
 */
export type ItemClaim = {
  itemId: string;
  userId: string;
  /** Set only on guest claims: the name the guest typed. */
  guestName?: string;
};

type DbError = { code?: string; message: string } | null;

/* eslint-disable @typescript-eslint/naming-convention -- database column names */
/** A row of `item_claims` as `getClaims` selects it. */
type ClaimRow = {
  item_id: string;
  user_id: string | null;
  guest_name: string | null;
};

/** A stored claim from the database or the mock store. */
type StoredClaim = {
  item_id: string;
  user_id?: string | null;
  guest_name?: string | null;
};

/** A receipt item as loaded, before its price is checked. */
type LoadedItem = { id: string; amount_cents: unknown };
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The slice of the Supabase client claiming uses, so tests can pass a fake.
 */
export type ClaimsClient = {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null } }>;
  };
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: DbError }>;
    delete(): {
      eq(
        column: string,
        value: string
      ): {
        eq(column: string, value: string): PromiseLike<{ error: DbError }>;
      };
    };
    select(columns: string): {
      in(
        column: string,
        values: string[]
      ): PromiseLike<{ data: ClaimRow[] | null; error: DbError }>;
    };
  };
};

/** Prefix that marks a claim key as a guest's rather than a member's. */
const GUEST_KEY_PREFIX = "guest:";

/**
 * The key a guest's claims are split under. Names are matched the same way
 * the database does it (trimmed, ignoring case), so "Casey " and "casey" are
 * one person.
 * @param guestName The name the guest typed
 * @returns A key that can't collide with a member's user id
 */
export function guestClaimKey(guestName: string): string {
  return `${GUEST_KEY_PREFIX}${guestName.trim().toLowerCase()}`;
}

/**
 * Whether a claim key belongs to a guest.
 * @param key A key from `ItemClaim.userId`
 * @returns True for guest keys
 */
export function isGuestClaimKey(key: string): boolean {
  return key.startsWith(GUEST_KEY_PREFIX);
}

/**
 * Turns a database or mock claim row into an `ItemClaim`.
 * @param row The stored claim
 * @param row.item_id The claimed item
 * @param row.user_id The member who claimed it, if any
 * @param row.guest_name The guest who claimed it, if any
 * @returns The claim, or null if the row has no claimant
 */
function toItemClaim(row: StoredClaim): ItemClaim | null {
  if (typeof row.user_id === "string" && row.user_id !== "") {
    return { itemId: row.item_id, userId: row.user_id };
  }
  const guestName = row.guest_name?.trim();
  if (guestName) {
    return {
      itemId: row.item_id,
      userId: guestClaimKey(guestName),
      guestName,
    };
  }
  return null;
}

export type CentsShare = {
  userId: string;
  cents: number;
};

/**
 * The parts of a receipt item that claiming needs. Build these with
 * `toClaimableItems`: `splitCents` throws on an invalid price, so a bad one
 * would otherwise crash a render.
 */
export type ClaimableItem = {
  id: string;
  priceCents: number;
};

/**
 * Checks that a price is a whole, non-negative number of cents.
 * @param value The price as loaded (Postgres bigint can arrive as a string)
 * @returns The price in cents, or null if it isn't valid
 */
export function toWholeCents(value: unknown): number | null {
  const cents = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof cents === "number" && Number.isInteger(cents) && cents >= 0
    ? cents
    : null;
}

/**
 * Turns loaded receipt items into claimable items, leaving out any with an
 * invalid price so they can't break the split.
 * @param rows The items as loaded
 * @returns The claimable items, and the ids of items that were left out
 */
export function toClaimableItems(
  rows: readonly LoadedItem[]
): { items: ClaimableItem[]; invalidIds: string[] } {
  const items: ClaimableItem[] = [];
  const invalidIds: string[] = [];
  for (const row of rows) {
    const priceCents = toWholeCents(row.amount_cents);
    if (priceCents === null) invalidIds.push(row.id);
    else items.push({ id: row.id, priceCents });
  }
  return { items, invalidIds };
}

export type ItemShares = {
  /** True when two or more people have claimed the item. */
  isShared: boolean;
  /** Everyone who claimed the item, in user id order. */
  claimedBy: string[];
  /** Each person's share, in user id order. Empty if nobody claimed it. */
  shares: CentsShare[];
};

export type MyTotal = {
  /** The sum of my share of every item I claimed. */
  totalCents: number;
  /** How many items I claimed, shared or not. */
  claimedCount: number;
};

export type ClaimOptions = {
  // TODO(remove-mock): Remove `useMock` and `mockUserId` options once offline mock mode is deleted.
  useMock: boolean;
  /** PLACEHOLDER #2: who is acting in mock mode. */
  mockUserId?: string;
  /** Supabase client for real mode. Defaults to the app's client. */
  client?: ClaimsClient | null;
};

export type ClaimActionResult =
  | { status: "ok" }
  | { status: "forbidden" }
  | { status: "error"; message: string };

export type GetClaimsResult =
  | { status: "ok"; claims: ItemClaim[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

/**
 * What the real paths return when there is no Supabase client.
 */
export const SERVER_NOT_SET_UP = "Claims on the server are not set up yet.";

/** Postgres "insufficient privilege", e.g. a Row Level Security refusal. */
const FORBIDDEN_CODE = "42501";

/** Postgres "unique violation": the claim already exists. */
const DUPLICATE_CODE = "23505";

/**
 * Picks the client for real mode.
 * @param options Claim options
 * @returns The client, or null when Supabase isn't configured
 */
function clientFor(options: ClaimOptions): ClaimsClient | null {
  if (options.client !== undefined) return options.client;
  // The full client's types are too deep to check against this narrow type
  // (TS2589), so it's cast through unknown.
  return SUPABASE as unknown as ClaimsClient | null;
}

/**
 * Turns a thrown value into a readable message.
 * @param err The caught value
 * @returns A message safe to show on screen
 */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Network error occurred.";
}

// TODO(remove-mock): Delete mockMemberId once offline mock mode is removed.
/**
 * PLACEHOLDER #1 and #3: checks membership in the mock data. An unknown group
 * behaves like "not a member", the same as `loadGroupDetail`.
 * @param groupId The group the item belongs to
 * @param options Claim options
 * @returns The acting user's id, or null if they aren't a member
 */
function mockMemberId(groupId: string, options: ClaimOptions): string | null {
  const userId = options.mockUserId ?? MOCK_CURRENT_USER_ID;
  const isMember = mockGroupDetails[groupId]?.members.some(
    (member) => member.user_id === userId
  );
  return isMember ? userId : null;
}

/**
 * Claims an item for the current user. Claiming it again changes nothing.
 * @param groupId The group the item belongs to (PLACEHOLDER #3)
 * @param itemId The item to claim
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #2)
 * @param options.client Supabase client for real mode
 * @returns Ok, "forbidden" for non-members, or an error message
 */
export async function claimItem(
  groupId: string,
  itemId: string,
  options: ClaimOptions
): Promise<ClaimActionResult> {
  // TODO(remove-mock): Unwrap `if (!options.useMock)` and delete the mock branch below once mock mode is deleted.
  if (!options.useMock) {
    const client = clientFor(options);
    if (!client) return { status: "error", message: SERVER_NOT_SET_UP };

    try {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return { status: "forbidden" };

      const { error } = await client.from("item_claims").insert({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        item_id: itemId,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        user_id: user.id,
      });

      if (error) {
        if (error.code === FORBIDDEN_CODE) return { status: "forbidden" };
        // Already claimed (e.g. a second device): the claim is there, so ok.
        if (error.code === DUPLICATE_CODE) return { status: "ok" };
        return { status: "error", message: error.message };
      }
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", message: messageOf(err) };
    }
  }

  const userId = mockMemberId(groupId, options);
  if (userId === null) return { status: "forbidden" };

  const alreadyClaimed = mockItemClaims.some(
    (claim) => claim.item_id === itemId && claim.user_id === userId
  );
  if (!alreadyClaimed) {
    const name = mockGroupDetails[groupId]?.members.find(
      (member) => member.user_id === userId
    )?.display_name;
    /* eslint-disable @typescript-eslint/naming-convention -- database column names */
    mockItemClaims.push({
      item_id: itemId,
      user_id: userId,
      // The guest web page shows this name next to the claim.
      ...(name ? { display_name: name } : {}),
    });
    /* eslint-enable @typescript-eslint/naming-convention */
  }
  return { status: "ok" };
}

/**
 * Removes the current user's claim on an item. Unclaiming an item they haven't
 * claimed changes nothing and isn't an error.
 * @param groupId The group the item belongs to (PLACEHOLDER #3)
 * @param itemId The item to unclaim
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #2)
 * @param options.client Supabase client for real mode
 * @returns Ok, "forbidden" for non-members, or an error message
 */
export async function unclaimItem(
  groupId: string,
  itemId: string,
  options: ClaimOptions
): Promise<ClaimActionResult> {
  // TODO(remove-mock): Unwrap `if (!options.useMock)` and delete the mock branch below once mock mode is deleted.
  if (!options.useMock) {
    const client = clientFor(options);
    if (!client) return { status: "error", message: SERVER_NOT_SET_UP };

    try {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return { status: "forbidden" };

      // Only ever the signed-in member's own row, never a guest's.
      const { error } = await client
        .from("item_claims")
        .delete()
        .eq("item_id", itemId)
        .eq("user_id", user.id);

      if (error) {
        if (error.code === FORBIDDEN_CODE) return { status: "forbidden" };
        return { status: "error", message: error.message };
      }
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", message: messageOf(err) };
    }
  }

  const userId = mockMemberId(groupId, options);
  if (userId === null) return { status: "forbidden" };

  const index = mockItemClaims.findIndex(
    (claim) => claim.item_id === itemId && claim.user_id === userId
  );
  if (index !== -1) mockItemClaims.splice(index, 1);
  return { status: "ok" };
}

/**
 * Loads everyone's claims on the given items: members' and guests'. Guest
 * claims carry `guestName` and a `guestClaimKey` as their `userId`.
 * @param groupId The group the items belong to (PLACEHOLDER #3)
 * @param itemIds The items to load claims for
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #2)
 * @param options.client Supabase client for real mode
 * @returns The claims, "forbidden" for non-members, or an error message
 */
export async function getClaims(
  groupId: string,
  itemIds: string[],
  options: ClaimOptions
): Promise<GetClaimsResult> {
  // TODO(remove-mock): Unwrap `if (!options.useMock)` and delete the mock branch below once mock mode is deleted.
  if (!options.useMock) {
    const client = clientFor(options);
    if (!client) return { status: "error", message: SERVER_NOT_SET_UP };
    if (itemIds.length === 0) return { status: "ok", claims: [] };

    try {
      const { data, error } = await client
        .from("item_claims")
        .select("item_id, user_id, guest_name")
        .in("item_id", itemIds);

      if (error) {
        if (error.code === FORBIDDEN_CODE) return { status: "forbidden" };
        return { status: "error", message: error.message };
      }

      const claims = (data ?? [])
        .map(toItemClaim)
        .filter((claim): claim is ItemClaim => claim !== null);
      return { status: "ok", claims };
    } catch (err: unknown) {
      return { status: "error", message: messageOf(err) };
    }
  }

  if (mockMemberId(groupId, options) === null) return { status: "forbidden" };

  const claims = mockItemClaims
    .filter((claim) => itemIds.includes(claim.item_id))
    .map(toItemClaim)
    .filter((claim): claim is ItemClaim => claim !== null);
  return { status: "ok", claims };
}

/**
 * Splits a price evenly in whole cents, so the shares always add up to exactly
 * the price. Leftover cents go one each to the first people in user id order.
 * That order doesn't depend on who claimed first, so the same people always
 * get the same shares.
 * @param totalCents The price in whole cents
 * @param userIds The people sharing the item
 * @returns One share per person in user id order, or nothing if there's no one
 * @throws {RangeError} If the price isn't a whole, non-negative number of cents
 */
export function splitCents(totalCents: number, userIds: string[]): CentsShare[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError(`Invalid price in cents: ${totalCents}`);
  }

  // The default sort compares character codes, so it doesn't vary by locale.
  const people = [...new Set(userIds)].sort();
  if (people.length === 0) return [];

  const baseCents = Math.floor(totalCents / people.length);
  const leftoverCents = totalCents % people.length;
  // Leftover cents always go to the lowest user ids, so the same person can
  // pay the extra cent every time. Revisit (e.g. rotate by item) if that bothers anyone.
  return people.map((userId, i) => ({
    userId,
    cents: baseCents + (i < leftoverCents ? 1 : 0),
  }));
}

/**
 * Works out who claimed an item and what each of them pays.
 * @param item The item
 * @param claims Claims to look through. Claims on other items are ignored, so
 *   it's fine to pass every claim on the receipt.
 * @returns Whether it's shared, who claimed it, and each person's share
 */
export function getItemShares(
  item: ClaimableItem,
  claims: ItemClaim[]
): ItemShares {
  const userIds = claims
    .filter((claim) => claim.itemId === item.id)
    .map((claim) => claim.userId);
  const shares = splitCents(item.priceCents, userIds);

  return {
    isShared: shares.length >= 2,
    claimedBy: shares.map((share) => share.userId),
    shares,
  };
}

/**
 * Adds up what one person pays, using each item's shares from `getItemShares`,
 * so the total always equals the sum of their shares.
 * @param items The items to total
 * @param claims Claims on those items. Claims on other items are ignored.
 * @param userId The person to total for
 * @returns Their total in cents and how many of the items they claimed
 */
export function getMyTotal(
  items: ClaimableItem[],
  claims: ItemClaim[],
  userId: string
): MyTotal {
  let totalCents = 0;
  let claimedCount = 0;

  for (const item of items) {
    const myShare = getItemShares(item, claims).shares.find(
      (share) => share.userId === userId
    );
    if (myShare) {
      totalCents += myShare.cents;
      claimedCount += 1;
    }
  }

  return { totalCents, claimedCount };
}
