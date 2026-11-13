/**
 * User Story 2.3, Task 3: the `useClaims` hook.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/use-claims.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import {
  claimItem,
  type ClaimActionResult,
  type ClaimableItem,
  getClaims,
  type GetClaimsResult,
  type ItemClaim,
  unclaimItem,
} from "@/lib/claims";
import { CLAIM_FORBIDDEN_MESSAGE, useClaims } from "@/lib/use-claims";

/** Test group identifier. */
const GROUP_ID = "group-1";

/** Test user identifier. */
const USER_ID = "u1";

/** In-memory claims tracked during tests. */
let fakeClaims: ItemClaim[] = [];

// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real SUPABASE export
jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("@/lib/claims", () => {
  const actual = jest.requireActual<typeof import("@/lib/claims")>("@/lib/claims");
  return {
    ...actual,
    claimItem: jest.fn(),
    unclaimItem: jest.fn(),
    getClaims: jest.fn(),
  };
});

/**
 * Mocked claim request.
 */
const mockClaim = claimItem as unknown as jest.Mock<typeof claimItem>;

/**
 * Mocked unclaim request.
 */
const mockUnclaim = unclaimItem as unknown as jest.Mock<typeof unclaimItem>;

/**
 * Mocked claims load.
 */
const mockGetClaims = getClaims as unknown as jest.Mock<
  () => Promise<GetClaimsResult>
>;

/**
 * The receipt's items.
 */
const ITEMS: ClaimableItem[] = [
  { id: "milk", priceCents: 500 },
  { id: "eggs", priceCents: 300 },
];

/**
 * A failed request with its own message.
 */
const FAILED: ClaimActionResult = { status: "error", message: "Network down" };

/**
 * Renders the hook and waits for the first load to finish.
 * @returns The hook's latest result
 */
async function renderClaims() {
  const { result } = await renderHook(() => useClaims(ITEMS, GROUP_ID, USER_ID));
  await act(async () => {});
  return result;
}

/**
 * Makes a promise that a test finishes when it chooses.
 * @returns The promise and the function that finishes it
 */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useClaims", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeClaims = [];
    mockGetClaims.mockImplementation(async () => ({
      status: "ok",
      claims: [...fakeClaims],
    }));
    mockClaim.mockImplementation(async (_gid: string, itemId: string) => {
      fakeClaims.push({ itemId, userId: USER_ID });
      return { status: "ok" };
    });
    mockUnclaim.mockImplementation(async (_gid: string, itemId: string) => {
      fakeClaims = fakeClaims.filter(
        (c) => !(c.itemId === itemId && c.userId === USER_ID)
      );
      return { status: "ok" };
    });
  });

  it("loads existing claims, then derives shares and my total", async () => {
    fakeClaims = [
      { itemId: "milk", userId: "u1" },
      { itemId: "milk", userId: "u2" },
    ];

    const result = await renderClaims();

    expect(result.current.loading).toBe(false);
    expect(result.current.sharesByItem.milk.isShared).toBe(true);
    expect(result.current.sharesByItem.eggs.claimedBy).toEqual([]);
    expect(result.current.myTotal).toEqual({ totalCents: 250, claimedCount: 1 });
  });

  it("claims an item", async () => {
    const result = await renderClaims();

    await act(() => result.current.toggle("milk"));

    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.myTotal).toEqual({ totalCents: 500, claimedCount: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("unclaims an item I've already claimed", async () => {
    const result = await renderClaims();
    await act(() => result.current.toggle("milk"));

    await act(() => result.current.toggle("milk"));

    expect(mockUnclaim).toHaveBeenCalledTimes(1);
    expect(result.current.claims).toEqual([]);
    expect(result.current.myTotal).toEqual({ totalCents: 0, claimedCount: 0 });
    expect(fakeClaims).toEqual([]);
  });

  it("updates immediately, before the request finishes", async () => {
    const result = await renderClaims();
    const request = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(request.promise);

    await act(async () => {
      void result.current.toggle("milk");
    });

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.myTotal).toEqual({ totalCents: 500, claimedCount: 1 });
    expect(result.current.inFlightItemIds.has("milk")).toBe(true);

    await act(async () => request.resolve({ status: "ok" }));

    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("rolls back on failure, restores my total, and surfaces the server message", async () => {
    const result = await renderClaims();
    mockClaim.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBe("Network down");
    expect(result.current.myTotal).toEqual({ totalCents: 0, claimedCount: 0 });
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("re-claims if an unclaim fails", async () => {
    const result = await renderClaims();
    await act(() => result.current.toggle("milk"));
    mockUnclaim.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.error).toBe("Network down");
    expect(result.current.myTotal).toEqual({ totalCents: 500, claimedCount: 1 });
  });

  it("a thrown error becomes a friendly failure message", async () => {
    const result = await renderClaims();
    mockClaim.mockRejectedValueOnce(new Error("boom"));

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBe("Couldn't update your claim. Please try again.");
  });

  it("a 42501 forbidden failure explains they aren't in the group", async () => {
    const result = await renderClaims();
    mockClaim.mockResolvedValueOnce({ status: "forbidden" });

    await act(() => result.current.toggle("milk"));

    expect(result.current.error).toBe(CLAIM_FORBIDDEN_MESSAGE);
  });

  it("clears a previous error on the next tap", async () => {
    const result = await renderClaims();
    mockClaim.mockResolvedValueOnce(FAILED);
    await act(() => result.current.toggle("milk"));
    expect(result.current.error).toBe("Network down");

    await act(() => result.current.toggle("eggs"));
    expect(result.current.error).toBeNull();
  });

  it("tapping an in-flight item does nothing (double-tap guard)", async () => {
    const result = await renderClaims();
    const request = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(request.promise);

    await act(async () => {
      void result.current.toggle("milk");
    });
    await act(async () => {
      void result.current.toggle("milk");
    });

    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockUnclaim).not.toHaveBeenCalled();

    await act(async () => request.resolve({ status: "ok" }));
  });

  it("different items can be tapped in quick succession", async () => {
    const result = await renderClaims();
    const milk = deferred<ClaimActionResult>();
    const eggs = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(milk.promise).mockReturnValueOnce(eggs.promise);

    await act(async () => {
      void result.current.toggle("milk");
    });
    await act(async () => {
      void result.current.toggle("eggs");
    });

    expect(result.current.claims).toEqual([
      { itemId: "milk", userId: USER_ID },
      { itemId: "eggs", userId: USER_ID },
    ]);
    expect(result.current.myTotal).toEqual({ totalCents: 800, claimedCount: 2 });
    expect(result.current.inFlightItemIds).toEqual(new Set(["milk", "eggs"]));

    await act(async () => milk.resolve({ status: "ok" }));
    await act(async () => eggs.resolve({ status: "ok" }));
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("a failure on one item doesn't roll back another item's tap", async () => {
    const result = await renderClaims();
    const milk = deferred<ClaimActionResult>();
    const eggs = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(milk.promise).mockReturnValueOnce(eggs.promise);

    await act(async () => {
      void result.current.toggle("milk");
    });
    await act(async () => {
      void result.current.toggle("eggs");
    });
    await act(async () => {
      fakeClaims.push({ itemId: "eggs", userId: USER_ID });
      eggs.resolve({ status: "ok" });
    });
    await act(async () => milk.resolve(FAILED));

    expect(result.current.claims).toEqual([{ itemId: "eggs", userId: USER_ID }]);
    expect(result.current.error).toBe("Network down");
    expect(result.current.myTotal).toEqual({ totalCents: 300, claimedCount: 1 });
  });

  it("rolling back doesn't touch someone else's claim on the same item", async () => {
    fakeClaims = [{ itemId: "milk", userId: "u2" }];
    const result = await renderClaims();
    mockClaim.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: "u2" }]);
  });

  it("a slow load doesn't overwrite a newer tap", async () => {
    const load = deferred<GetClaimsResult>();
    mockGetClaims.mockReturnValueOnce(load.promise);
    const { result } = await renderHook(() => useClaims(ITEMS, GROUP_ID, USER_ID));

    await act(() => result.current.toggle("milk"));
    await act(async () =>
      load.resolve({
        status: "ok",
        claims: [{ itemId: "eggs", userId: "u2" }],
      })
    );

    expect(result.current.claims).toEqual(
      expect.arrayContaining([
        { itemId: "milk", userId: USER_ID },
        { itemId: "eggs", userId: "u2" },
      ])
    );
    expect(result.current.claims).toHaveLength(2);
  });

  it("ignores a late failure from a group the user has left the screen of", async () => {
    const request = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(request.promise);
    const { result, rerender } = await renderHook(
      ({ groupId }: { groupId: string }) => useClaims(ITEMS, groupId, USER_ID),
      { initialProps: { groupId: GROUP_ID } }
    );
    await act(async () => {
      void result.current.toggle("milk");
    });

    await rerender({ groupId: "group-apt402" });
    await act(async () => request.resolve(FAILED));

    expect(result.current.error).toBeNull();
    expect(result.current.claims).toEqual([]);
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("does nothing while the user is unknown, then loads once known", async () => {
    const { result, rerender } = await renderHook(
      ({ userId }: { userId: string | undefined }) =>
        useClaims(ITEMS, GROUP_ID, userId),
      { initialProps: { userId: undefined as string | undefined } }
    );
    await act(() => result.current.toggle("milk"));

    expect(mockGetClaims).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(result.current.claims).toEqual([]);
    expect(result.current.myTotal).toEqual({ totalCents: 0, claimedCount: 0 });

    await rerender({ userId: USER_ID });
    await act(async () => {});
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("does nothing while the group is unknown", async () => {
    const { result } = await renderHook(() => useClaims(ITEMS, undefined, USER_ID));
    await act(() => result.current.toggle("milk"));

    expect(mockGetClaims).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("counts a guest as a sharer but leaves their claim alone", async () => {
    fakeClaims = [{ itemId: "milk", userId: "guest:casey", guestName: "Casey" }];
    const result = await renderClaims();

    await act(() => result.current.toggle("milk"));
    expect(result.current.sharesByItem.milk.isShared).toBe(true);
    expect(result.current.myTotal.totalCents).toBe(250);

    await act(() => result.current.toggle("milk"));
    expect(result.current.claims).toEqual([
      { itemId: "milk", userId: "guest:casey", guestName: "Casey" },
    ]);
  });

  it("refetches claims after a rollback", async () => {
    const result = await renderClaims();
    mockClaim.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(mockGetClaims).toHaveBeenCalledTimes(2); // initial load + refetch after rollback
  });

  it("shows the forbidden message when loading is forbidden", async () => {
    mockGetClaims.mockResolvedValueOnce({ status: "forbidden" });

    const result = await renderClaims();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(CLAIM_FORBIDDEN_MESSAGE);
  });
});
