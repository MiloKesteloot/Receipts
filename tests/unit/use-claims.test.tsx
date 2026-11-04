/**
 * User Story 2.3, Task 3: the `useClaims` hook.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/use-claims.test.tsx
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. Requests run against the mock in `claims.ts`, wrapped so a test can make
 *    one fail or stay unfinished. The real paths aren't written yet.
 * 2. Claims go in the shared `mockItemClaims`, so `afterEach` empties it.
 *    Remove that with the mock.
 * ==========================================================================
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import {
  claimItem,
  type ClaimActionResult,
  type ClaimableItem,
  getClaims,
  type GetClaimsResult,
  unclaimItem,
} from "@/lib/claims";
import { mockItemClaims } from "@/lib/mock";
import { CLAIM_FORBIDDEN_MESSAGE, useClaims } from "@/lib/use-claims";

jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("@/lib/claims", () => {
  const actual = jest.requireActual<typeof import("@/lib/claims")>("@/lib/claims");
  return {
    ...actual,
    claimItem: jest.fn(actual.claimItem),
    unclaimItem: jest.fn(actual.unclaimItem),
    getClaims: jest.fn(actual.getClaims),
  };
});

/**
 * Mocked claim request, wrapping the real mock-mode function.
 */
const MOCK_CLAIM = claimItem as unknown as jest.Mock<
  () => Promise<ClaimActionResult>
>;

/**
 * Mocked unclaim request, wrapping the real mock-mode function.
 */
const MOCK_UNCLAIM = unclaimItem as unknown as jest.Mock<
  () => Promise<ClaimActionResult>
>;

/**
 * Mocked claims load, wrapping the real mock-mode function.
 */
const MOCK_GET_CLAIMS = getClaims as unknown as jest.Mock<
  () => Promise<GetClaimsResult>
>;

/**
 * Apartment 402, whose members are u1, u2 and u3.
 */
const GROUP_ID = "mock-1";

/**
 * The acting user.
 */
const USER_ID = "u1";

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
  });

  afterEach(() => {
    mockItemClaims.length = 0;
  });

  it("loads existing claims, then derives shares and my total", async () => {
    mockItemClaims.push(
      /* eslint-disable @typescript-eslint/naming-convention -- database column names */
      { item_id: "milk", user_id: "u1" },
      { item_id: "milk", user_id: "u2" }
      /* eslint-enable @typescript-eslint/naming-convention */
    );

    const result = await renderClaims();

    expect(result.current.loading).toBe(false);
    expect(result.current.sharesByItem.milk.isShared).toBe(true);
    expect(result.current.sharesByItem.eggs.claimedBy).toEqual([]);
    expect(result.current.myTotal).toEqual({ totalCents: 250, claimedCount: 1 });
  });

  it("claims an item", async () => {
    const result = await renderClaims();

    await act(() => result.current.toggle("milk"));

    expect(MOCK_CLAIM).toHaveBeenCalledTimes(1);
    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.myTotal).toEqual({ totalCents: 500, claimedCount: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("unclaims an item I've already claimed", async () => {
    const result = await renderClaims();
    await act(() => result.current.toggle("milk"));

    await act(() => result.current.toggle("milk"));

    expect(MOCK_UNCLAIM).toHaveBeenCalledTimes(1);
    expect(result.current.claims).toEqual([]);
    expect(result.current.myTotal).toEqual({ totalCents: 0, claimedCount: 0 });
    expect(mockItemClaims).toEqual([]);
  });

  it("updates immediately, before the request finishes", async () => {
    const result = await renderClaims();
    const request = deferred<ClaimActionResult>();
    MOCK_CLAIM.mockReturnValueOnce(request.promise);

    await act(async () => {
      void result.current.toggle("milk");
    });

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.inFlightItemIds.has("milk")).toBe(true);

    await act(async () => request.resolve({ status: "ok" }));

    expect(result.current.inFlightItemIds.has("milk")).toBe(false);
  });

  it("rolls back a failed claim and shows the request's message", async () => {
    const result = await renderClaims();
    MOCK_CLAIM.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.myTotal.totalCents).toBe(0);
    expect(result.current.error).toBe("Network down");
    expect(result.current.inFlightItemIds.size).toBe(0);
  });

  it("rolls back a failed unclaim", async () => {
    const result = await renderClaims();
    await act(() => result.current.toggle("milk"));
    MOCK_UNCLAIM.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
    expect(result.current.error).toBe("Network down");
  });

  it("rolls back when the request throws", async () => {
    const result = await renderClaims();
    MOCK_CLAIM.mockRejectedValueOnce(new Error("boom"));

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.error).not.toBeNull();
  });

  it("rolls back when forbidden, with its own message", async () => {
    const result = await renderClaims();
    MOCK_CLAIM.mockResolvedValueOnce({ status: "forbidden" });

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBe(CLAIM_FORBIDDEN_MESSAGE);
  });

  it("clears the error on the next tap", async () => {
    const result = await renderClaims();
    MOCK_CLAIM.mockResolvedValueOnce(FAILED);
    await act(() => result.current.toggle("milk"));

    await act(() => result.current.toggle("milk"));

    expect(result.current.error).toBeNull();
  });

  it("sends one request for a double tap", async () => {
    const result = await renderClaims();
    const request = deferred<ClaimActionResult>();
    MOCK_CLAIM.mockReturnValueOnce(request.promise);

    await act(async () => {
      void result.current.toggle("milk");
      void result.current.toggle("milk");
    });
    await act(async () => {
      void result.current.toggle("milk");
    });

    expect(MOCK_CLAIM).toHaveBeenCalledTimes(1);
    expect(MOCK_UNCLAIM).not.toHaveBeenCalled();
    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);

    await act(async () => request.resolve({ status: "ok" }));
    expect(result.current.claims).toEqual([{ itemId: "milk", userId: USER_ID }]);
  });

  it("a failure on one item doesn't affect a claim on another", async () => {
    const result = await renderClaims();
    const milk = deferred<ClaimActionResult>();
    const eggs = deferred<ClaimActionResult>();
    MOCK_CLAIM.mockReturnValueOnce(milk.promise).mockReturnValueOnce(eggs.promise);

    await act(async () => {
      void result.current.toggle("milk");
      void result.current.toggle("eggs");
    });
    expect(result.current.inFlightItemIds.size).toBe(2);

    await act(async () => eggs.resolve({ status: "ok" }));
    await act(async () => milk.resolve(FAILED));

    expect(result.current.claims).toEqual([{ itemId: "eggs", userId: USER_ID }]);
    expect(result.current.error).toBe("Network down");
    expect(result.current.myTotal).toEqual({ totalCents: 300, claimedCount: 1 });
  });

  it("rolling back doesn't touch someone else's claim on the same item", async () => {
    mockItemClaims.push(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- database column names
      { item_id: "milk", user_id: "u2" }
    );
    const result = await renderClaims();
    MOCK_CLAIM.mockResolvedValueOnce(FAILED);

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([{ itemId: "milk", userId: "u2" }]);
  });

  it("a slow load doesn't overwrite a newer tap", async () => {
    const load = deferred<GetClaimsResult>();
    MOCK_GET_CLAIMS.mockReturnValueOnce(load.promise);
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
    MOCK_CLAIM.mockReturnValueOnce(request.promise);
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

  it("shows the forbidden message when loading is forbidden", async () => {
    MOCK_GET_CLAIMS.mockResolvedValueOnce({ status: "forbidden" });

    const result = await renderClaims();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(CLAIM_FORBIDDEN_MESSAGE);
  });
});
