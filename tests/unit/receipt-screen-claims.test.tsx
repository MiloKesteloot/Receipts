/**
 * User Story 2.3, Tasks 3–6: tap-to-claim on the receipt screen, the Shared
 * tag with exact per-person amounts, and the running total bar.
 *
 * Runs against the mock data for receipt r1 ("Costco run" in Apartment 402),
 * where the signed-in mock user is a member. Seed claims on r1:
 *   Paper Towels $24.99 Alex · Olive Oil $18.49 Alex + Sam ·
 *   Avocados $9.99 nobody · Rotisserie Chicken $4.99 Sam ·
 *   Sparkling Water $15.99 nobody · Spinach $9.78 Alex
 *
 * Run with:
 *   npm run test:ui -- tests/unit/receipt-screen-claims.test.tsx
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import * as receiptRoute from "@/app/(app)/(home)/receipts/[id]";
import { claimItem, type ClaimActionResult, unclaimItem } from "@/lib/claims";
import { INITIAL_MOCK_ITEM_CLAIMS, mockItemClaims } from "@/lib/mock";

/** The receipt screen under test (the route's default export). */
const ReceiptScreen = receiptRoute.default;

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the real SUPABASE export
jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ session: null }) }));
// Zero insets for the total bar and the real Toast, which shows its message
// as text, so the tests can read it.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/claims", () => {
  const actual = jest.requireActual<typeof import("@/lib/claims")>("@/lib/claims");
  return {
    ...actual,
    claimItem: jest.fn(actual.claimItem),
    unclaimItem: jest.fn(actual.unclaimItem),
  };
});

/** Mocked claim request, wrapping the real mock-mode function. */
const mockClaim = claimItem as unknown as jest.Mock<() => Promise<ClaimActionResult>>;

/** Mocked unclaim request, wrapping the real mock-mode function. */
const mockUnclaim = unclaimItem as unknown as jest.Mock<
  () => Promise<ClaimActionResult>
>;

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
    mockParams.mockReturnValue({ id: "r1" });
  });

  afterEach(() => {
    mockItemClaims.length = 0;
    mockItemClaims.push(...INITIAL_MOCK_ITEM_CLAIMS.map((c) => ({ ...c })));
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
    expect(getByText("Alex $9.25 · Sam $9.24")).toBeTruthy();
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
    const { getByLabelText, findByText } = await renderReceipt();

    await fireEvent.press(getByLabelText("Claim Olive Oil 2L"));

    // $18.49 / 3: 617 + 616 + 616 = 1849, extra cent to the first id.
    expect(await findByText("You $6.17 · Alex $6.16 · Sam $6.16")).toBeTruthy();
    expect(await findByText("Your total $6.17 · 1 item")).toBeTruthy();
  });

  it("a guest's claim counts in the split and in my exact share", async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- database column names
    mockItemClaims.push({ id: "g1", item_id: "item-r1-3", receipt_id: "r1", guest_name: "Casey" });
    const { getByLabelText, getByText, findByText } = await renderReceipt();
    expect(getByText("Casey (Guest)")).toBeTruthy();

    await fireEvent.press(getByLabelText("Claim Organic Avocados 6ct"));

    // $9.99 / 2: 500 + 499.
    expect(await findByText("You $5.00 · Casey (Guest) $4.99")).toBeTruthy();
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

  it("keeps the guest share-link card", async () => {
    const { getByText } = await renderReceipt();

    expect(getByText("Guest Claim Link")).toBeTruthy();
    expect(getByText("Share Claim Link")).toBeTruthy();
    expect(getByText("Copy Link")).toBeTruthy();
    expect(getByText(/mock-claim-r1-demo/)).toBeTruthy();
  });
});
