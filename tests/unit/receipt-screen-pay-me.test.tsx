/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.5, Task 1: the uploader's Pay me card on the receipt screen,
 * its countdown, and who it can nudge (using US 3.4's payment states).
 *
 * Run with:
 *   npm run test:ui -- tests/unit/receipt-screen-pay-me.test.tsx
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import * as receiptRoute from "@/app/(app)/(home)/receipts/[id]";
import type { ItemClaim } from "@/lib/claims";
import { loadLastPayMe, sendPayMe } from "@/lib/pay-me";
import { getPayments } from "@/lib/payments";
import type { PaymentRecord, PaymentState } from "@/lib/settlement";

/** The receipt screen under test (the route's default export). */
const ReceiptScreen = receiptRoute.default;

/** The receipt row the fake Supabase client returns. Tests change it. */
let mockReceiptRow: Record<string, unknown> = {};

/** $15 burger and $5 fries: with $2 tax and $4 tip, a $26 receipt. */
const MOCK_ITEMS = [
  { id: "burger", receipt_id: "r1", name: "Burger", amount_cents: 1500 },
  { id: "fries", receipt_id: "r1", name: "Fries", amount_cents: 500 },
];

/** Alex has the burger and the signed-in user has the fries. */
const MOCK_CLAIMS: ItemClaim[] = [
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
    getClaims: jest.fn(async () => ({ status: "ok" as const, claims: [...MOCK_CLAIMS] })),
  };
});

jest.mock("@/lib/payments", () => ({
  getPayments: jest.fn(),
  markSharePaid: jest.fn(),
  respondToPayment: jest.fn(),
}));

jest.mock("@/lib/pay-me", () => {
  const actual = jest.requireActual<typeof import("@/lib/pay-me")>("@/lib/pay-me");
  return {
    ...actual,
    sendPayMe: jest.fn(),
    loadLastPayMe: jest.fn(),
  };
});

/** Mocked Pay me request. */
const mockSend = sendPayMe as unknown as jest.Mock<typeof sendPayMe>;
/** Mocked load of the last Pay me time. */
const mockLastPayMe = loadLastPayMe as unknown as jest.Mock<typeof loadLastPayMe>;
/** Mocked US 3.4 payments load. */
const mockGetPayments = getPayments as unknown as jest.Mock<typeof getPayments>;
/** Mocked route params hook. */
const mockParams = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Sets the receipt the screen will load.
 * @param overrides Fields to change from a finalized receipt the signed-in user uploaded
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
    status: "finalized",
    ...overrides,
  };
}

/**
 * Sets the US 3.4 payment records the screen loads.
 * @param records Payer key and state pairs
 */
function setPayments(records: [string, PaymentState][]): void {
  const payments: PaymentRecord[] = records.map(([payerKey, state]) => ({
    payerKey,
    state,
    markedPaidAt: state === "paid" ? "2026-11-17T12:00:00Z" : null,
    respondedAt: state === "paid" ? null : "2026-11-17T13:00:00Z",
  }));
  mockGetPayments.mockResolvedValue({ status: "ok", payments });
}

/**
 * Renders the screen and waits for the receipt, claims and payments.
 * @returns The render queries
 */
async function renderReceipt() {
  const screen = await render(<ReceiptScreen />);
  await screen.findByText("Diner");
  await waitFor(() => expect(screen.queryByText("Loading claims…")).toBeNull());
  await waitFor(() => expect(mockGetPayments).toHaveBeenCalledWith("r1"));
  await screen.findByText("Payments");
  return screen;
}

describe("ReceiptScreen: Pay me (US 3.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ id: "r1" });
    setReceipt();
    setPayments([]);
    mockLastPayMe.mockResolvedValue({ status: "ok", lastSentAt: null });
    mockSend.mockResolvedValue({ status: "sent", notifiedCount: 1, owingCount: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("US-3.5-T-1: AC2 the uploader taps Pay me, it sends for this receipt and says how many were notified", async () => {
    const { getByRole, getByText, findByText, queryByRole } = await renderReceipt();

    expect(getByText("1 person still owes you. Pay me sends them a notification.")).toBeTruthy();
    await fireEvent.press(getByRole("button", { name: "Pay me" }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("r1"));
    expect(await findByText("Sent a Pay me to 1 person.")).toBeTruthy();
    // Sending starts the hour-long countdown in place of the button (it may
    // already have ticked once on a slow run).
    expect(getByText(/^Pay me again in (1:00:00|59:5\d)$/)).toBeTruthy();
    expect(queryByRole("button", { name: "Pay me" })).toBeNull();
  });

  it("US-3.5-T-1: AC2 members who didn't upload the receipt don't get a Pay me card", async () => {
    setReceipt({ created_by: "u1" });
    const { queryByRole, queryByTestId } = await renderReceipt();

    expect(queryByTestId("pay-me-card")).toBeNull();
    expect(queryByRole("button", { name: "Pay me" })).toBeNull();
    expect(mockLastPayMe).not.toHaveBeenCalled();
  });

  it("US-3.5-T-1: AC4 a second tap within the hour shows a ticking countdown, and the button returns at zero", async () => {
    mockSend.mockResolvedValueOnce({ status: "cooldown", retryAfterSeconds: 3 });
    const screen = await renderReceipt();

    jest.useFakeTimers();
    await fireEvent.press(screen.getByRole("button", { name: "Pay me" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Pay me again in 0:03")).toBeTruthy();
    expect(screen.getByText("You already sent a Pay me. Try again in 0:03.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pay me" })).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Pay me again in 0:02")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId("pay-me-countdown")).toBeNull();
    expect(screen.getByRole("button", { name: "Pay me" })).toBeTruthy();
  });

  it("US-3.5-T-1: AC4 a Pay me sent earlier shows the countdown as soon as the receipt opens", async () => {
    mockLastPayMe.mockResolvedValue({
      status: "ok",
      lastSentAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    const { findByTestId, getByText, queryByRole } = await renderReceipt();

    expect(await findByTestId("pay-me-countdown")).toBeTruthy();
    expect(mockLastPayMe).toHaveBeenCalledWith("r1");
    expect(getByText(/^Pay me again in (50:00|49:5\d)$/)).toBeTruthy();
    expect(queryByRole("button", { name: "Pay me" })).toBeNull();
  });

  it("US-3.5-T-1: AC5 once everyone left has marked their share paid, there's nobody to nudge", async () => {
    setPayments([["u1", "paid"]]);
    const { findByText, queryByRole } = await renderReceipt();

    expect(
      await findByText("Nobody to nudge: everyone left has marked their share paid, or is a guest.")
    ).toBeTruthy();
    expect(queryByRole("button", { name: "Pay me" })).toBeNull();
  });

  it("US-3.5-T-1: AC5 a share reported not received can still be nudged", async () => {
    setPayments([["u1", "not_received"]]);
    const { getByRole, getByText } = await renderReceipt();

    expect(getByText("1 person still owes you. Pay me sends them a notification.")).toBeTruthy();
    expect(getByRole("button", { name: "Pay me" })).toBeTruthy();
  });

  it("US-3.5-T-1: AC5 a settled receipt shows no Pay me card", async () => {
    setPayments([["u1", "confirmed"]]);
    const { findByText, queryByTestId } = await renderReceipt();

    expect(await findByText("Settled")).toBeTruthy();
    expect(queryByTestId("pay-me-card")).toBeNull();
  });
});
