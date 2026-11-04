/**
 * User Story 2.3, Task 3: the state behind tap-to-claim. Keeps a receipt's
 * claims on screen, updates them right away when an item is tapped, and undoes
 * just that item's change if the request fails.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. `USE_MOCK` picks mock or real claims. The real paths in `claims.ts` aren't
 *    written, so every request fails with an error when it's off. This hook
 *    shouldn't need changes when they are.
 * 2. `userId` is also passed on as `mockUserId`, so the call site can switch
 *    from a mock user to the signed-in user without changing this hook. Real
 *    requests will ignore it and use the session's user on the server.
 * 3. Claims load when the screen opens, and there's no live updating. Other
 *    people's claims appear the next time they load. Revisit if the team wants
 *    Realtime.
 * ==========================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  claimItem,
  type ClaimableItem,
  type ClaimActionResult,
  getClaims,
  getItemShares,
  getMyTotal,
  type ItemClaim,
  type ItemShares,
  type MyTotal,
  unclaimItem,
} from "@/lib/claims";
import { USE_MOCK } from "@/lib/mock";

export type UseClaimsResult = {
  claims: ItemClaim[];
  /** True until the first load for this group and user finishes. */
  loading: boolean;
  /** The latest failure to show, or null. A new tap clears it. */
  error: string | null;
  /** Items with a request in flight. Tapping these does nothing. */
  inFlightItemIds: ReadonlySet<string>;
  /** Each item's shares, by item id. */
  sharesByItem: Record<string, ItemShares>;
  myTotal: MyTotal;
  /** Claims the item, or unclaims it if it's already mine. */
  toggle: (itemId: string) => Promise<void>;
};

/**
 * Shown when the server says the user can't claim in this group.
 */
export const CLAIM_FORBIDDEN_MESSAGE = "You're not a member of this group.";

/**
 * Shown when a request fails without a message of its own.
 */
export const CLAIM_FAILED_MESSAGE = "Couldn't update your claim. Please try again.";

/**
 * Checks whether a person has claimed an item.
 * @param claims The claims to look through
 * @param itemId The item
 * @param userId The person
 * @returns True if they've claimed it
 */
function hasClaim(claims: ItemClaim[], itemId: string, userId: string): boolean {
  return claims.some(
    (claim) => claim.itemId === itemId && claim.userId === userId
  );
}

/**
 * Removes one person's claim on one item, and nothing else.
 * @param claims The current claims
 * @param itemId The item
 * @param userId The person
 * @returns The claims without that one
 */
function withoutClaim(
  claims: ItemClaim[],
  itemId: string,
  userId: string
): ItemClaim[] {
  return claims.filter(
    (claim) => !(claim.itemId === itemId && claim.userId === userId)
  );
}

/**
 * Turns a failed request into the message to show.
 * @param result The failed result
 * @returns The message for that kind of failure
 */
function failureMessage(result: Exclude<ClaimActionResult, { status: "ok" }>): string {
  return result.status === "forbidden" ? CLAIM_FORBIDDEN_MESSAGE : result.message;
}

/**
 * Tracks a receipt's claims and lets the user claim and unclaim its items.
 * @param items The receipt's items
 * @param groupId The group the receipt belongs to
 * @param userId The current user (PLACEHOLDER #2)
 * @returns The claims, a toggle function, and everything derived from them
 */
export function useClaims(
  items: ClaimableItem[],
  groupId: string,
  userId: string
): UseClaimsResult {
  const [claims, setClaims] = useState<ItemClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inFlightItemIds, setInFlightItemIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  // State updates aren't instant, so refs hold the latest values. Fast taps on
  // the same item, or on different items, always see each other's changes.
  const claimsRef = useRef<ItemClaim[]>([]);
  const inFlightRef = useRef(new Set<string>());
  // Items tapped since the current load started. The load's answer may be
  // older than these taps, so it must not overwrite them.
  const tappedRef = useRef(new Set<string>());
  // Changes when the group or user does, so late answers for the old ones are
  // ignored.
  const sessionRef = useRef(0);
  const latestLoadRef = useRef(0);

  // Only reload when the set of items changes, not on every new array.
  const itemIdsKey = JSON.stringify(items.map((item) => item.id));

  /**
   * Updates the claims in both the ref and the state.
   * @param change Builds the new claims from the latest ones
   */
  const updateClaims = useCallback(
    (change: (current: ItemClaim[]) => ItemClaim[]) => {
      claimsRef.current = change(claimsRef.current);
      setClaims(claimsRef.current);
    },
    []
  );

  /**
   * Marks a request as started or finished for an item.
   * @param itemId The item
   * @param inFlight True when the request starts, false when it finishes
   */
  const setItemInFlight = useCallback((itemId: string, inFlight: boolean) => {
    if (inFlight) inFlightRef.current.add(itemId);
    else inFlightRef.current.delete(itemId);
    setInFlightItemIds(new Set(inFlightRef.current));
  }, []);

  // A different group or user starts from nothing.
  useEffect(() => {
    sessionRef.current += 1;
    inFlightRef.current = new Set();
    tappedRef.current = new Set();
    claimsRef.current = [];
    setClaims([]);
    setInFlightItemIds(new Set());
    setError(null);
    setLoading(true);
  }, [groupId, userId]);

  useEffect(() => {
    latestLoadRef.current += 1;
    const loadId = latestLoadRef.current;
    // Requests still in flight are newer than anything this load returns.
    tappedRef.current = new Set(inFlightRef.current);

    /**
     * Loads the claims and merges them in, keeping any newer taps.
     */
    const load = async (): Promise<void> => {
      const itemIds = JSON.parse(itemIdsKey) as string[];
      const options = { useMock: USE_MOCK, mockUserId: userId };
      let result: Awaited<ReturnType<typeof getClaims>>;
      try {
        result = await getClaims(groupId, itemIds, options);
      } catch {
        result = { status: "error", message: CLAIM_FAILED_MESSAGE };
      }
      if (loadId !== latestLoadRef.current) return;

      if (result.status === "ok") {
        const loaded = result.claims;
        const tapped = tappedRef.current;
        updateClaims((current) => [
          ...loaded.filter((claim) => !tapped.has(claim.itemId)),
          ...current.filter((claim) => tapped.has(claim.itemId)),
        ]);
      } else {
        setError(failureMessage(result));
      }
      setLoading(false);
    };

    load();
  }, [groupId, userId, itemIdsKey, updateClaims]);

  const toggle = useCallback(
    async (itemId: string): Promise<void> => {
      // A ref changes immediately, so this also stops a fast double tap.
      if (inFlightRef.current.has(itemId)) return;

      const session = sessionRef.current;
      const wasClaimed = hasClaim(claimsRef.current, itemId, userId);

      setItemInFlight(itemId, true);
      tappedRef.current.add(itemId);
      setError(null);
      updateClaims((current) =>
        wasClaimed
          ? withoutClaim(current, itemId, userId)
          : [...current, { itemId, userId }]
      );

      const send = wasClaimed ? unclaimItem : claimItem;
      const options = { useMock: USE_MOCK, mockUserId: userId };
      let result: ClaimActionResult;
      try {
        result = await send(groupId, itemId, options);
      } catch {
        result = { status: "error", message: CLAIM_FAILED_MESSAGE };
      }
      if (session !== sessionRef.current) return;

      setItemInFlight(itemId, false);
      if (result.status === "ok") return;

      // Undo only this item's change for this user.
      updateClaims((current) =>
        wasClaimed
          ? [...withoutClaim(current, itemId, userId), { itemId, userId }]
          : withoutClaim(current, itemId, userId)
      );
      setError(failureMessage(result));
    },
    [groupId, userId, setItemInFlight, updateClaims]
  );

  const sharesByItem = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.id, getItemShares(item, claims)])
      ),
    [items, claims]
  );
  const myTotal = useMemo(
    () => getMyTotal(items, claims, userId),
    [items, claims, userId]
  );

  return {
    claims,
    loading,
    error,
    inFlightItemIds,
    sharesByItem,
    myTotal,
    toggle,
  };
}
