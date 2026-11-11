/**
 * User Story 2.3, Task 3: on the real (non-mock) path, `useClaims` reloads the
 * claims after rolling back a failed tap, because the request may have saved
 * on the server even though its response was lost.
 *
 * Separate from use-claims.test.tsx because it needs `USE_MOCK` off.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/use-claims-refetch.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import {
  claimItem,
  type ClaimActionResult,
  type ClaimableItem,
  getClaims,
  type GetClaimsResult,
} from "@/lib/claims";
import { CLAIM_FORBIDDEN_MESSAGE, useClaims } from "@/lib/use-claims";

// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real SUPABASE export
jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("@/lib/mock", () => ({
  ...jest.requireActual<typeof import("@/lib/mock")>("@/lib/mock"),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real export
  USE_MOCK: false,
}));
jest.mock("@/lib/claims", () => {
  const actual = jest.requireActual<typeof import("@/lib/claims")>("@/lib/claims");
  return {
    ...actual,
    claimItem: jest.fn(),
    unclaimItem: jest.fn(),
    getClaims: jest.fn(),
  };
});

/** Mocked claim request. */
const MOCK_CLAIM = claimItem as unknown as jest.Mock<() => Promise<ClaimActionResult>>;

/** Mocked claims load. */
const MOCK_GET_CLAIMS = getClaims as unknown as jest.Mock<
  () => Promise<GetClaimsResult>
>;

/** The receipt's items. */
const ITEMS: ClaimableItem[] = [{ id: "milk", priceCents: 500 }];

describe("useClaims: refetch after rollback (real path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_GET_CLAIMS.mockResolvedValue({ status: "ok", claims: [] });
  });

  it("reloads after a failed claim and shows what the server has", async () => {
    const { result } = await renderHook(() => useClaims(ITEMS, "g1", "me"));
    await act(async () => {});
    expect(MOCK_GET_CLAIMS).toHaveBeenCalledTimes(1);

    // The claim saved, but its response was lost.
    MOCK_CLAIM.mockResolvedValueOnce({ status: "error", message: "Network down" });
    MOCK_GET_CLAIMS.mockResolvedValueOnce({
      status: "ok",
      claims: [{ itemId: "milk", userId: "me" }],
    });

    await act(() => result.current.toggle("milk"));

    expect(MOCK_GET_CLAIMS).toHaveBeenCalledTimes(2);
    expect(result.current.claims).toEqual([{ itemId: "milk", userId: "me" }]);
    expect(result.current.error).toBe("Network down");
  });

  it("keeps the rollback and the tap's error when the reload also fails", async () => {
    const { result } = await renderHook(() => useClaims(ITEMS, "g1", "me"));
    await act(async () => {});

    MOCK_CLAIM.mockResolvedValueOnce({ status: "forbidden" });
    MOCK_GET_CLAIMS.mockResolvedValueOnce({ status: "error", message: "offline" });

    await act(() => result.current.toggle("milk"));

    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBe(CLAIM_FORBIDDEN_MESSAGE);
  });

  it("doesn't reload after a successful claim", async () => {
    const { result } = await renderHook(() => useClaims(ITEMS, "g1", "me"));
    await act(async () => {});
    MOCK_CLAIM.mockResolvedValueOnce({ status: "ok" });

    await act(() => result.current.toggle("milk"));

    expect(MOCK_GET_CLAIMS).toHaveBeenCalledTimes(1);
  });
});
