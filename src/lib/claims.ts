/**
 * User Story 2.3 (Claim receipt items), Task 2: claiming and unclaiming items,
 * plus splitting a shared item's price between the people who claimed it.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. TODO(US 2.3 Task 1): the real (non-mock) versions of `claimItem`,
 *    `unclaimItem` and `getClaims` aren't written. They return an error until
 *    the team settles the claims table and its functions, then call those.
 * 2. `mockItemClaims` (in `mock.ts`) keeps claims in memory, so they vanish
 *    when the app reloads. Remove it when `USE_MOCK` is turned off. Kellar's
 *    US 2.5 branch adds a store with the same name and more fields; merge the
 *    two when the shared table's shape is decided.
 * 3. `mockUserId` stands in for the signed-in user and defaults to
 *    `MOCK_CURRENT_USER_ID`. The real functions will use the session's user
 *    on the server instead, so remove this option once sign-in exists.
 *    The seeded mock groups don't list `MOCK_CURRENT_USER_ID` as a member
 *    yet, so it gets "forbidden" there until Task 3 sets up the mock data.
 * 4. `groupId` is only used for the mock's membership check, because mock
 *    receipts don't have items to look a group up from yet. It's trusted as
 *    given and isn't checked against the item. The real functions will find
 *    the item's group on the server, so remove it then.
 * ==========================================================================
 */

import { MOCK_CURRENT_USER_ID } from "@/lib/create-group";
import { mockGroupDetails, mockItemClaims } from "@/lib/mock";

export type ItemClaim = {
  itemId: string;
  userId: string;
};

export type CentsShare = {
  userId: string;
  cents: number;
};

export type ClaimOptions = {
  useMock: boolean;
  /** PLACEHOLDER #3: who is acting in mock mode. */
  mockUserId?: string;
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
 * PLACEHOLDER #1: what the real paths return until they are written.
 */
const SERVER_NOT_SET_UP = "Claims on the server are not set up yet.";

/**
 * PLACEHOLDER #2 and #4: checks membership in the mock data. An unknown group
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
 * @param groupId The group the item belongs to (PLACEHOLDER #4)
 * @param itemId The item to claim
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #3)
 * @returns Ok, "forbidden" for non-members, or an error message
 */
export async function claimItem(
  groupId: string,
  itemId: string,
  options: ClaimOptions
): Promise<ClaimActionResult> {
  // TODO(US 2.3 Task 1), PLACEHOLDER #1: call the real claim function.
  if (!options.useMock) return { status: "error", message: SERVER_NOT_SET_UP };

  const userId = mockMemberId(groupId, options);
  if (userId === null) return { status: "forbidden" };

  const alreadyClaimed = mockItemClaims.some(
    (claim) => claim.item_id === itemId && claim.user_id === userId
  );
  if (!alreadyClaimed) {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- database column names
    mockItemClaims.push({ item_id: itemId, user_id: userId });
  }
  return { status: "ok" };
}

/**
 * Removes the current user's claim on an item. Unclaiming an item they haven't
 * claimed changes nothing and isn't an error.
 * @param groupId The group the item belongs to (PLACEHOLDER #4)
 * @param itemId The item to unclaim
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #3)
 * @returns Ok, "forbidden" for non-members, or an error message
 */
export async function unclaimItem(
  groupId: string,
  itemId: string,
  options: ClaimOptions
): Promise<ClaimActionResult> {
  // TODO(US 2.3 Task 1), PLACEHOLDER #1: call the real unclaim function.
  if (!options.useMock) return { status: "error", message: SERVER_NOT_SET_UP };

  const userId = mockMemberId(groupId, options);
  if (userId === null) return { status: "forbidden" };

  const index = mockItemClaims.findIndex(
    (claim) => claim.item_id === itemId && claim.user_id === userId
  );
  if (index !== -1) mockItemClaims.splice(index, 1);
  return { status: "ok" };
}

/**
 * Loads everyone's claims on the given items.
 * @param groupId The group the items belong to (PLACEHOLDER #4)
 * @param itemIds The items to load claims for
 * @param options Claim options
 * @param options.useMock True to use the local mock data
 * @param options.mockUserId Who is acting in mock mode (PLACEHOLDER #3)
 * @returns The claims, "forbidden" for non-members, or an error message
 */
export async function getClaims(
  groupId: string,
  itemIds: string[],
  options: ClaimOptions
): Promise<GetClaimsResult> {
  // TODO(US 2.3 Task 1), PLACEHOLDER #1: read from the real claims table.
  if (!options.useMock) return { status: "error", message: SERVER_NOT_SET_UP };

  if (mockMemberId(groupId, options) === null) return { status: "forbidden" };

  const claims = mockItemClaims
    .filter((claim) => itemIds.includes(claim.item_id))
    .map((claim) => ({ itemId: claim.item_id, userId: claim.user_id }));
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
