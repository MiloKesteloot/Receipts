/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.4, Task 3: Mark as paid, Confirm / Not received, and the
 * Settled status on the receipt screen.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/receipt-screen-payments.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import * as receiptRoute from "@/app/(app)/(home)/receipts/[id]";
import { guestClaimKey, type ItemClaim } from "@/lib/claims";
import { getPayments, markSharePaid, respondToPayment } from "@/lib/payments";
import type { PaymentRecord, PaymentState } from "@/lib/settlement";

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

/** Alex has the burger ($19.50 in all) and the signed-in user the fries ($6.50). */
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

jest.mock("@/lib/payments", () => ({
  getPayments: jest.fn(),
  markSharePaid: jest.fn(),
  respondToPayment: jest.fn(),
}));

/** Mocked payment functions. */
const mockGetPayments = getPayments as unknown as jest.Mock<typeof getPayments>;
const mockMarkPaid = markSharePaid as unknown as jest.Mock<typeof markSharePaid>;
const mockRespond = respondToPayment as unknown as jest.Mock<typeof respondToPayment>;

/** Mocked route params hook. */
const mockParams = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Builds a payment record.
 * @param payerKey Whose payment
 * @param state Its state
 * @returns The record
 */
function payment(payerKey: string, state: PaymentState): PaymentRecord {
  return { payerKey, state, markedPaidAt: "2026-11-18T10:00:00Z", respondedAt: null };
}

/**
 * Sets the finalized receipt the screen will load.
 * @param uploader Who uploaded it
 */
function setReceipt(uploader: string): void {
  mockReceiptRow = {
    id: "r1",
    title: "Diner",
    total_cents: 2600,
    tax_cents: 200,
    tip_cents: 400,
    created_at: "2026-11-17T00:00:00Z",
    created_by: uploader,
    group_id: "g1",
    status: "finalized",
  };
}

/**
 * Sets the payments the screen will load.
 * @param payments The stored records
 */
function setPayments(payments: PaymentRecord[]): void {
  mockGetPayments.mockResolvedValue({ status: "ok", payments });
}

/**
 * Renders the screen and waits for the receipt, claims and payments to load.
 * @returns The render queries
 */
async function renderReceipt() {
  const screen = await render(<ReceiptScreen />);
  await screen.findByText("Diner");
  await waitFor(() => expect(screen.queryByText("Loading claims…")).toBeNull());
  await screen.findByText("Payments");
  return screen;
}

/**
 * The button in the confirm card (the last one with that name on screen).
 * @param screen The render queries
 * @param name The button's label
 * @returns The button
 */
function cardButton(screen: Awaited<ReturnType<typeof renderReceipt>>, name: string) {
  const buttons = screen.getAllByRole("button", { name });
  return buttons[buttons.length - 1];
}

describe("ReceiptScreen: mark paid and confirm (US 3.4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ id: "r1" });
    mockActiveClaims = [...ALL_CLAIMED];
    setPayments([]);
  });

  it("US-3.4-T-3: a member marks their share paid after confirming in the in-app card", async () => {
    setReceipt("u1");
    mockMarkPaid.mockResolvedValue({
      status: "ok",
      payment: payment("current-user", "paid"),
    });
    const screen = await renderReceipt();

    expect(screen.getByLabelText("You: Not paid yet")).toBeTruthy();
    expect(screen.getByText("You owe $6.50")).toBeTruthy();

    // Cancel does nothing.
    await fireEvent.press(screen.getByRole("button", { name: "Mark as paid" }));
    expect(screen.getByText("Mark as paid?")).toBeTruthy();
    expect(screen.getByText(/Let Alex know you've paid \$6\.50/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Mark as paid?")).toBeNull());
    expect(mockMarkPaid).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Mark as paid" }));
    await fireEvent.press(cardButton(screen, "Mark as paid"));

    await waitFor(() => expect(mockMarkPaid).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Marked as paid.")).toBeTruthy();
    expect(screen.getByLabelText("You: Marked paid, waiting for confirmation")).toBeTruthy();
    expect(screen.getByText("You marked $6.50 as paid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).toBeNull();
  });

  it("US-3.4-T-3: the uploader confirms a payment marked paid", async () => {
    setReceipt("current-user");
    setPayments([payment("u1", "paid")]);
    mockRespond.mockResolvedValue({ status: "ok", payment: payment("u1", "confirmed") });
    const screen = await renderReceipt();

    expect(screen.getByLabelText("Alex: Marked paid, waiting for confirmation")).toBeTruthy();
    expect(screen.getByLabelText("You: Paid the bill")).toBeTruthy();
    expect(screen.getByText("You're owed $19.50")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not received" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Confirm payment?")).toBeTruthy();
    expect(screen.getByText(/Confirm you received \$19\.50 from Alex/)).toBeTruthy();
    await fireEvent.press(cardButton(screen, "Confirm"));

    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith("r1", "u1", true));
    expect(await screen.findByText("Receipt settled!")).toBeTruthy();
    expect(screen.getByLabelText("Alex: Confirmed")).toBeTruthy();
  });

  it("US-3.4-T-3: the uploader says a payment wasn't received, without a confirm card", async () => {
    setReceipt("current-user");
    setPayments([payment("u1", "paid")]);
    mockRespond.mockResolvedValue({ status: "ok", payment: payment("u1", "not_received") });
    const screen = await renderReceipt();

    await fireEvent.press(screen.getByRole("button", { name: "Not received" }));

    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith("r1", "u1", false));
    expect(screen.queryByText("Confirm payment?")).toBeNull();
    expect(await screen.findByText("Marked as not received.")).toBeTruthy();
    expect(screen.getByLabelText("Alex: Not received")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("US-3.4-T-3: the uploader confirms a guest's share directly", async () => {
    setReceipt("current-user");
    const casey = guestClaimKey("Casey");
    mockActiveClaims = [
      { itemId: "burger", userId: "u1" },
      { itemId: "fries", userId: casey, guestName: "Casey" },
    ];
    mockRespond.mockResolvedValue({ status: "ok", payment: payment(casey, "confirmed") });
    const screen = await renderReceipt();

    expect(screen.getByLabelText("Casey (Guest): Not paid yet")).toBeTruthy();
    // Alex hasn't marked paid, so only Casey's share can be confirmed.
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Not received" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await fireEvent.press(cardButton(screen, "Confirm"));

    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith("r1", casey, true));
    expect(await screen.findByText("Payment confirmed.")).toBeTruthy();
    expect(screen.getByLabelText("Casey (Guest): Confirmed")).toBeTruthy();
    expect(screen.getByText("1 share left to settle ($19.50)")).toBeTruthy();
  });

  it("US-3.4-T-3: a member can mark paid again after not received, and sees no buttons on others' shares", async () => {
    setReceipt("u1");
    setPayments([payment("current-user", "not_received")]);
    const screen = await renderReceipt();

    expect(screen.getByLabelText("You: Not received")).toBeTruthy();
    expect(screen.getByText("Alex didn't receive your $6.50")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Mark as paid" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not received" })).toBeNull();
  });

  it("US-3.4-T-3: once every share is confirmed the receipt shows Settled and no payment buttons", async () => {
    setReceipt("current-user");
    setPayments([payment("u1", "confirmed")]);
    const screen = await renderReceipt();

    expect(screen.getByText("Settled")).toBeTruthy();
    expect(screen.queryByText("Finalized")).toBeNull();
    expect(screen.getByText("Everyone has paid. This receipt is settled.")).toBeTruthy();
    expect(screen.getByText("Everyone has paid you back")).toBeTruthy();
    for (const name of ["Mark as paid", "Confirm", "Not received"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("US-3.4-T-3: a member whose payment was confirmed sees the receipt as Settled", async () => {
    setReceipt("u1");
    setPayments([payment("current-user", "confirmed")]);
    const screen = await renderReceipt();

    expect(screen.getByText("Settled")).toBeTruthy();
    expect(screen.getByLabelText("You: Confirmed")).toBeTruthy();
    expect(screen.getByText("Your $6.50 payment was confirmed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).toBeNull();
  });

  it("US-3.4-T-3: a failed action shows the error and keeps the share's status", async () => {
    setReceipt("current-user");
    setPayments([payment("u1", "paid")]);
    mockRespond.mockResolvedValue({
      status: "error",
      error: "NETWORK_ERROR",
      message: "Network down",
    });
    const screen = await renderReceipt();

    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await fireEvent.press(cardButton(screen, "Confirm"));

    expect(await screen.findByText("Network down")).toBeTruthy();
    expect(screen.getByLabelText("Alex: Marked paid, waiting for confirmation")).toBeTruthy();
    expect(screen.queryByText("Settled")).toBeNull();
    expect(screen.getByText("Finalized")).toBeTruthy();
  });

  it("US-3.4-T-3: when payments fail to load, every share shows as unpaid", async () => {
    setReceipt("u1");
    mockGetPayments.mockResolvedValue({ status: "error", message: "relation missing" });
    const screen = await renderReceipt();

    expect(screen.getByLabelText("You: Not paid yet")).toBeTruthy();
    expect(screen.getByLabelText("Alex: Paid the bill")).toBeTruthy();
    expect(screen.getByText("1 share left to settle ($6.50)")).toBeTruthy();
    expect(screen.getByText("You owe $6.50")).toBeTruthy();
  });
});
