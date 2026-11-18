/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.3, Task 3: the Finalize button and the final split breakdown
 * on the receipt screen.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/receipt-screen-finalize.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import * as receiptRoute from "@/app/(app)/(home)/receipts/[id]";
import { claimItem, type ItemClaim, unclaimItem } from "@/lib/claims";
import { finalizeReceipt, type FinalizeReceiptResult } from "@/lib/finalize-receipt";

/** The receipt screen under test (the route's default export). */
const ReceiptScreen = receiptRoute.default;

/** The receipt row the fake Supabase client returns. Tests change it. */
let mockReceiptRow: Record<string, unknown> = {};

/** Claims the fake getClaims returns. Tests change them. */
let mockActiveClaims: ItemClaim[] = [];

/** $15 burger and $5 fries: with $2 tax and $4 tip, a $26 receipt. */
const MOCK_ITEMS = [
  { id: "burger", receipt_id: "r1", name: "Burger", amount_cents: 1500 },
  { id: "fries", receipt_id: "r1", name: "Fries", amount_cents: 500 },
];

/** Alex has the burger and the signed-in user has the fries. */
const ALL_CLAIMED: ItemClaim[] = [
  { itemId: "burger", userId: "u1" },
  { itemId: "fries", userId: "current-user" },
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
              single: jest.fn(async () => ({ data: { ...mockReceiptRow }, error: null })),
            })),
          })),
        };
      }
      if (table === "receipt_items") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(async () => ({ data: MOCK_ITEMS, error: null })),
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
      group: { id: "g1", name: "Dinner club", invite_code: "DIN123" },
      members: [
        { user_id: "u1", display_name: "Alex", role: "owner" },
        { user_id: "current-user", display_name: "Me", role: "member" },
      ],
      receipts: [],
    },
  })),
}));

jest.mock("@/lib/guest-claim", () => {
  const actual = jest.requireActual<typeof import("@/lib/guest-claim")>("@/lib/guest-claim");
  return {
    ...actual,
    createGuestClaimToken: jest.fn(async () => "tok-r1"),
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
    claimItem: jest.fn(async () => ({ status: "ok" as const })),
    unclaimItem: jest.fn(async () => ({ status: "ok" as const })),
    getClaims: jest.fn(async () => ({ status: "ok" as const, claims: [...mockActiveClaims] })),
  };
});

jest.mock("@/lib/finalize-receipt", () => ({
  finalizeReceipt: jest.fn(),
}));

/** Mocked finalize request. */
const mockFinalize = finalizeReceipt as unknown as jest.Mock<typeof finalizeReceipt>;

/** Mocked route params hook. */
const mockParams = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Sets the receipt the screen will load.
 * @param overrides Fields to change from a submitted receipt by the signed-in user
 */
function setReceipt(overrides: Record<string, unknown> = {}): void {
  mockReceiptRow = {
    id: "r1",
    title: "Diner",
    total_cents: 2600,
    tax_cents: 200,
    tip_cents: 400,
    created_at: "2026-11-17T00:00:00Z",
    created_by: "current-user",
    group_id: "g1",
    status: "submitted",
    ...overrides,
  };
}

/**
 * Renders the screen and waits for the receipt and claims to load.
 * @returns The render queries
 */
async function renderReceipt() {
  const screen = await render(<ReceiptScreen />);
  await screen.findByText("Diner");
  await waitFor(() => expect(screen.queryByText("Loading claims…")).toBeNull());
  return screen;
}

describe("ReceiptScreen: finalize and split (US 3.3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ id: "r1" });
    setReceipt();
    mockActiveClaims = [...ALL_CLAIMED];
    mockFinalize.mockResolvedValue({ status: "ok", finalizedAt: "2026-11-17T12:00:00Z" });
  });

  it("US-3.3-T-3: Finalize is disabled for the uploader while items are unclaimed", async () => {
    mockActiveClaims = [{ itemId: "burger", userId: "u1" }];
    const { getByText, getByRole, queryByText } = await renderReceipt();

    expect(getByText("1 item still needs a claim")).toBeTruthy();
    const button = getByRole("button", { name: "Finalize receipt" });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(queryByText("Finalize receipt?")).toBeNull();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("US-3.3-T-3: members who didn't upload the receipt see a waiting message instead of Finalize", async () => {
    setReceipt({ created_by: "u1" });
    const { getByText, queryByText } = await renderReceipt();

    expect(getByText("Waiting for Alex to finalize.")).toBeTruthy();
    expect(queryByText("Finalize receipt")).toBeNull();
  });

  it("US-3.3-T-3: when everything is claimed, Finalize opens the confirm card and only finalizes after confirming", async () => {
    const { getByText, getByRole, queryByText } = await renderReceipt();

    expect(getByText("Every item is claimed.")).toBeTruthy();
    const button = getByRole("button", { name: "Finalize receipt" });
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });

    // Cancel closes the in-app confirm card without finalizing.
    await fireEvent.press(button);
    expect(getByText("Finalize receipt?")).toBeTruthy();
    expect(getByText(/Everyone's share will be locked in/)).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(queryByText("Finalize receipt?")).toBeNull());
    expect(mockFinalize).not.toHaveBeenCalled();

    // Confirming finalizes and closes the card.
    await fireEvent.press(getByRole("button", { name: "Finalize receipt" }));
    await fireEvent.press(getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(mockFinalize).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(queryByText("Finalize receipt?")).toBeNull());
  });

  it("US-3.3-T-3: after finalizing, everyone's items, tax, tip and total add up to the receipt", async () => {
    const { getByRole, findByText, getByText, getByLabelText, queryByText } =
      await renderReceipt();

    await fireEvent.press(getByRole("button", { name: "Finalize receipt" }));
    await fireEvent.press(getByRole("button", { name: "Finalize" }));

    expect(await findByText("Receipt finalized.")).toBeTruthy();
    expect(getByText("Finalized")).toBeTruthy();
    expect(getByText("Final split")).toBeTruthy();
    // Alex ordered 75% of the subtotal, so pays 75% of tax and tip.
    expect(getByLabelText("Alex owes $19.50")).toBeTruthy();
    expect(getByText("Items $15.00 · Tax $1.50 · Tip $3.00")).toBeTruthy();
    expect(getByLabelText("You owe $6.50")).toBeTruthy();
    expect(getByText("Items $5.00 · Tax $0.50 · Tip $1.00")).toBeTruthy();
    // $19.50 + $6.50 = the $26.00 receipt total.
    expect(getByText("Subtotal $20.00 · Tax $2.00 · Tip $4.00")).toBeTruthy();
    expect(getByText("Total $26.00")).toBeTruthy();
    expect(queryByText(/doesn't match the receipt total/)).toBeNull();
    // The uploader paid the bill, so the bar shows what they're owed (US 3.4).
    expect(getByText("You're owed $19.50")).toBeTruthy();
    expect(queryByText("Finalize receipt")).toBeNull();
  });

  it("US-3.3-T-3: a finalized receipt shows the split to members and locks claiming", async () => {
    setReceipt({ status: "finalized", created_by: "u1" });
    const { getByText, getByLabelText, queryByText } = await renderReceipt();

    expect(getByText("Finalized")).toBeTruthy();
    expect(getByLabelText("Alex owes $19.50")).toBeTruthy();
    expect(getByText("You owe $6.50")).toBeTruthy();
    expect(queryByText("Guest Claim Link")).toBeNull();
    expect(queryByText("Finalize receipt")).toBeNull();
    expect(queryByText(/Waiting for/)).toBeNull();

    const fries = getByLabelText("Fries");
    expect(fries.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(fries);
    await fireEvent.press(getByLabelText("Burger"));
    expect(claimItem).not.toHaveBeenCalled();
    expect(unclaimItem).not.toHaveBeenCalled();
  });

  it.each<[string, FinalizeReceiptResult, string]>([
    ["unclaimed on the server", { status: "unclaimed", unclaimedCount: 1 }, "Can't finalize yet: 1 item still needs a claim."],
    [
      "not the uploader",
      { status: "error", error: "NOT_UPLOADER", message: "Only the person who uploaded this receipt can finalize it." },
      "Only the person who uploaded this receipt can finalize it.",
    ],
    ["a network error", { status: "error", error: "NETWORK_ERROR", message: "Network down" }, "Network down"],
  ])("US-3.3-T-3: a failed finalize (%s) shows the error and leaves the receipt claimable", async (_case, result, message) => {
    mockFinalize.mockResolvedValueOnce(result);
    const screen = await renderReceipt();

    await fireEvent.press(screen.getByRole("button", { name: "Finalize receipt" }));
    await fireEvent.press(screen.getByRole("button", { name: "Finalize" }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Finalized")).toBeNull();
    expect(screen.queryByText("Final split")).toBeNull();
    expect(screen.getByLabelText("Unclaim Fries")).toBeTruthy();
    expect(screen.getByText("Guest Claim Link")).toBeTruthy();
  });
});
