/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 2.3, Tasks 3–6: tap-to-claim on the receipt screen, the Shared
 * tag with exact per-person amounts, and the running total bar.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/receipt-screen-claims.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import * as receiptRoute from "@/app/(app)/(home)/receipts/[id]";
import { claimItem, type ClaimActionResult, getClaims, type ItemClaim, unclaimItem } from "@/lib/claims";

/** The receipt screen under test (the route's default export). */
const ReceiptScreen = receiptRoute.default;

/** Seed claims used across tests. */
const SEED_CLAIMS: ItemClaim[] = [
  { itemId: "item-r1-1", userId: "u1" },
  { itemId: "item-r1-2", userId: "u1" },
  { itemId: "item-r1-2", userId: "u2" },
  { itemId: "item-r1-4", userId: "u2" },
  { itemId: "item-r1-6", userId: "u1" },
];

/** Active claims tracked in tests. */
let mockActiveClaims: ItemClaim[] = [];

/** Mock items for receipt r1. */
const MOCK_ITEMS = [
  { id: "item-r1-1", receipt_id: "r1", name: "Paper Towels", amount_cents: 2499 },
  { id: "item-r1-2", receipt_id: "r1", name: "Olive Oil 2L", amount_cents: 1849 },
  { id: "item-r1-3", receipt_id: "r1", name: "Organic Avocados 6ct", amount_cents: 999 },
  { id: "item-r1-4", receipt_id: "r1", name: "Rotisserie Chicken", amount_cents: 499 },
  { id: "item-r1-5", receipt_id: "r1", name: "Sparkling Water 24pk", amount_cents: 1599 },
  { id: "item-r1-6", receipt_id: "r1", name: "Organic Baby Spinach", amount_cents: 978 },
];

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}));

jest.mock("@/lib/supabase", () => {
  const fakeClient = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: "current-user" } } })),
    },
    from: jest.fn((table: string) => {
      if (table === "receipts") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: {
                  id: "r1",
                  title: "Costco run",
                  total_cents: 8423,
                  created_at: "2026-10-05T00:00:00Z",
                  group_id: "mock-1",
                  status: "submitted",
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "receipt_items") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(async () => ({
                data: MOCK_ITEMS,
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    }),
  };
  return { SUPABASE: fakeClient, supabase: fakeClient };
});

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ session: { user: { id: "current-user" } } }),
}));

jest.mock("@/lib/group-data", () => ({
  loadGroupDetail: jest.fn(async () => ({
    status: "ok",
    detail: {
      group: { id: "mock-1", name: "Apartment 402", invite_code: "APT402" },
      members: [
        { user_id: "u1", display_name: "Alex", role: "owner" },
        { user_id: "u2", display_name: "Sam", role: "member" },
        { user_id: "current-user", display_name: "You", role: "member" },
      ],
      receipts: [],
    },
  })),
}));

jest.mock("@/lib/guest-claim", () => {
  const actual = jest.requireActual<typeof import("@/lib/guest-claim")>("@/lib/guest-claim");
  return {
    ...actual,
    createGuestClaimToken: jest.fn(async () => "mock-claim-r1-demo"),
    formatClaimUrl: jest.fn((token: string) => `https://receipts.app/claim/${token}`),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/claims", () => {
  const actual = jest.requireActual<typeof import("@/lib/claims")>("@/lib/claims");
  return {
    ...actual,
    claimItem: jest.fn(async (_gid: string, itemId: string) => {
      mockActiveClaims.push({ itemId, userId: "current-user" });
      return { status: "ok" as const };
    }),
    unclaimItem: jest.fn(async (_gid: string, itemId: string) => {
      mockActiveClaims = mockActiveClaims.filter(
        (c) => !(c.itemId === itemId && c.userId === "current-user")
      );
      return { status: "ok" as const };
    }),
    getClaims: jest.fn(async () => ({
      status: "ok" as const,
      claims: [...mockActiveClaims],
    })),
  };
});

/** Mocked claim request. */
const mockClaim = claimItem as unknown as jest.Mock<typeof claimItem>;

/** Mocked unclaim request. */
const mockUnclaim = unclaimItem as unknown as jest.Mock<typeof unclaimItem>;

/** Mocked route params hook. */
const mockParams = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Renders the screen for r1 and waits for the receipt and claims to load.
 * @returns The render queries
 */
async function renderReceipt() {
  const screen = await render(<ReceiptScreen />);
  await screen.findByText("Costco run");
  await waitFor(() => expect(screen.queryByText("Loading claims…")).toBeNull());
  return screen;
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

describe("ReceiptScreen: claiming items (US 2.3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveClaims = [...SEED_CLAIMS];
    mockParams.mockReturnValue({ id: "r1" });
    mockClaim.mockImplementation(async (_gid: string, itemId: string) => {
      mockActiveClaims.push({ itemId, userId: "current-user" });
      return { status: "ok" };
    });
    mockUnclaim.mockImplementation(async (_gid: string, itemId: string) => {
      mockActiveClaims = mockActiveClaims.filter(
        (c) => !(c.itemId === itemId && c.userId === "current-user")
      );
      return { status: "ok" };
    });
    (getClaims as unknown as jest.Mock).mockImplementation(async () => ({
      status: "ok",
      claims: [...mockActiveClaims],
    }));
  });

  it("shows the real items with who claimed them, and a prompt in the total bar", async () => {
    const { getByText, getByLabelText } = await renderReceipt();

    expect(getByLabelText("Claim Organic Avocados 6ct")).toBeTruthy();
    expect(getByText("Rotisserie Chicken")).toBeTruthy();
    expect(getByText("Sam")).toBeTruthy(); // single claimer: just their name
    expect(getByText("Tap items you bought to claim them")).toBeTruthy();
  });

  it("shows a seeded shared item with the tag, names and exact shares", async () => {
    const { getByLabelText, getByText } = await renderReceipt();

    const oil = getByLabelText("Claim Olive Oil 2L");
    expect(oil).toHaveTextContent(/Shared/);
    // $18.49 split 2 ways: 925 + 924 = 1849.
    expect(getByText("Alex $9.25")).toBeTruthy();
    expect(getByText("Sam $9.24")).toBeTruthy();
    expect(getByLabelText("Alex $9.25 (Member)")).toBeTruthy();
    expect(getByLabelText("Sam $9.24 (Member)")).toBeTruthy();
  });

  it("tapping claims, highlights and updates the total right away", async () => {
    const request = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(request.promise);
    const { getByLabelText, getByText, findByText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));

    // Before the request finishes:
    const row = getByLabelText("Unclaim Organic Avocados 6ct");
    expect(row.props.accessibilityState).toMatchObject({ selected: true, busy: true });
    expect(row).toHaveTextContent(/✓ Mine/);
    expect(getByText("Your total $9.99 · 1 item")).toBeTruthy();

    await act(async () => request.resolve({ status: "ok" }));
    expect(
      getByLabelText("Unclaim Organic Avocados 6ct").props.accessibilityState
    ).toMatchObject({ selected: true, busy: false });
    expect(await findByText("Your total $9.99 · 1 item")).toBeTruthy();
  });

  it("tapping again unclaims", async () => {
    const { getByLabelText, findByText, findByLabelText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));
    await fireEvent.press(await findByLabelText("Unclaim Organic Avocados 6ct"));

    expect(mockUnclaim).toHaveBeenCalledTimes(1);
    expect(await findByLabelText("Claim Organic Avocados 6ct")).toBeTruthy();
    expect(await findByText("Tap items you bought to claim them")).toBeTruthy();
  });

  it("a double tap sends one request", async () => {
    const request = deferred<ClaimActionResult>();
    mockClaim.mockReturnValueOnce(request.promise);
    const { getByLabelText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));
    await fireEvent.press(getByLabelText("Unclaim Organic Avocados 6ct"));
    await act(async () => request.resolve({ status: "ok" }));

    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockUnclaim).not.toHaveBeenCalled();
    expect(getByLabelText("Unclaim Organic Avocados 6ct")).toBeTruthy();
  });

  it("a failed claim rolls back and shows a toast", async () => {
    mockClaim.mockResolvedValueOnce({ status: "error", message: "Network down" });
    const { getByLabelText, findByText, getByText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));

    expect(await findByText("Network down")).toBeTruthy();
    expect(getByLabelText("Claim Organic Avocados 6ct")).toBeTruthy();
    expect(getByText("Tap items you bought to claim them")).toBeTruthy();
  });

  it("a non-member is rolled back with the forbidden message", async () => {
    mockClaim.mockResolvedValueOnce({ status: "forbidden" });
    const { getByLabelText, findByText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));

    expect(await findByText("You're not a member of this group.")).toBeTruthy();
    expect(getByLabelText("Claim Organic Avocados 6ct")).toBeTruthy();
  });

  it("joining a shared item splits it 3 ways to the exact cent", async () => {
    const { getByLabelText, findByText, findByLabelText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Olive Oil 2L"));

    // $18.49 / 3: 617 + 616 + 616 = 1849, extra cent to the first id.
    expect(await findByText("You $6.17")).toBeTruthy();
    expect(await findByText("Alex $6.16")).toBeTruthy();
    expect(await findByText("Sam $6.16")).toBeTruthy();
    expect(await findByLabelText("You $6.17 (You)")).toBeTruthy();
    expect(await findByLabelText("Alex $6.16 (Member)")).toBeTruthy();
    expect(await findByText("Your total $6.17 · 1 item")).toBeTruthy();
  });

  it("a guest's claim counts in the split and in my exact share", async () => {
    mockActiveClaims.push({ itemId: "item-r1-3", userId: "guest:casey", guestName: "Casey" });
    const { getByLabelText, getByText, findByText, findByLabelText } =
      await renderReceipt();
    expect(getByText("Casey (Guest)")).toBeTruthy();
    expect(getByLabelText("Casey (Guest) (Guest)")).toBeTruthy();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));

    // $9.99 / 2: 500 + 499.
    expect(await findByText("You $5.00")).toBeTruthy();
    expect(await findByText("Casey (Guest) $4.99")).toBeTruthy();
    expect(await findByLabelText("You $5.00 (You)")).toBeTruthy();
    expect(await findByLabelText("Casey (Guest) $4.99 (Guest)")).toBeTruthy();
    expect(await findByText("Your total $5.00 · 1 item")).toBeTruthy();
  });

  it("the total bar counts items and adds my shares", async () => {
    const { getByLabelText, findByText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));
    await fireEvent.press(getByLabelText("Claim Olive Oil 2L"));
    await fireEvent.press(getByLabelText("Claim Sparkling Water 24pk"));

    // 999 + 617 + 1599
    expect(await findByText("Your total $32.15 · 3 items")).toBeTruthy();
  });

  it("keeps the guest share-link card without the removed green badge", async () => {
    const { getByText, queryByText } = await renderReceipt();

    expect(getByText("Guest Claim Link")).toBeTruthy();
    expect(queryByText("No account required")).toBeNull();
    expect(getByText("Share Claim Link")).toBeTruthy();
    expect(getByText("Copy Link")).toBeTruthy();
    expect(getByText(/mock-claim-r1-demo/)).toBeTruthy();
  });

  it("renders circular checkboxes beside claimable items", async () => {
    const { getByTestId } = await renderReceipt();

    expect(getByTestId("item-checkbox-item-r1-3")).toBeTruthy();
  });
});
