/* eslint-disable @typescript-eslint/naming-convention */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import GroupScreen from "@/app/(home)/groups/[id]";
import { loadGroupDetail } from "@/lib/group-data";
import { mockGroupDetails } from "@/lib/mock";

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}));
jest.mock("@/lib/group-data", () => ({ loadGroupDetail: jest.fn() }));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/components/toast", () => ({ Toast: () => null }));

/**
 * Mocked group loader, typed against the real function.
 */
const MOCK_LOAD = loadGroupDetail as unknown as jest.Mock<
  () => Promise<unknown>
>;

/**
 * Mocked route params hook.
 */
const MOCK_PARAMS = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Apartment 402: has receipts.
 */
const GROUP_WITH_RECEIPTS = mockGroupDetails["mock-1"];

/**
 * Road Trip 2026: no receipts (empty state).
 */
const GROUP_WITHOUT_RECEIPTS = mockGroupDetails["mock-2"];

describe("GroupScreen: Add receipt button (US 2.1 Task 1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_PARAMS.mockReturnValue({ id: "mock-1" });
  });
  afterEach(() => {
    GROUP_WITHOUT_RECEIPTS.receipts.length = 0;
  });

  it("shows the Add receipt button when the group has no receipts", async () => {
    MOCK_PARAMS.mockReturnValue({ id: "mock-2" });
    MOCK_LOAD.mockResolvedValue({
      status: "ok",
      detail: GROUP_WITHOUT_RECEIPTS,
    });
    const { findByLabelText, getByText } = await render(<GroupScreen />);

    expect(await findByLabelText("Add receipt")).toBeTruthy();
    expect(getByText("Receipts will show up here.")).toBeTruthy();
  });

  it("shows the Add receipt button alongside existing receipts", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: GROUP_WITH_RECEIPTS });
    const { findByLabelText, getByText } = await render(<GroupScreen />);

    expect(await findByLabelText("Add receipt")).toBeTruthy();
    expect(getByText("Costco run")).toBeTruthy();
    expect(getByText("$84.23")).toBeTruthy();
    expect(getByText("Internet bill")).toBeTruthy();
    expect(getByText("$60.00")).toBeTruthy();
  });

  it("renders the button label text", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: GROUP_WITH_RECEIPTS });
    const { findByText } = await render(<GroupScreen />);

    expect(await findByText("+ Add receipt")).toBeTruthy();
  });

  it("does not crash when the button is pressed", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: GROUP_WITH_RECEIPTS });
    const { findByLabelText } = await render(<GroupScreen />);

    const button = await findByLabelText("Add receipt");
    await fireEvent.press(button);
  });

  it("does not show the button when the user is forbidden", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "forbidden" });
    const { findByText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByText("You're not a member of this group.")).toBeTruthy();
    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it("does not show the button when loading fails", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "error", message: "Network error" });
    const { findByText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByText("Network error")).toBeTruthy();
    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it("does not show the button while loading", async () => {
    MOCK_LOAD.mockReturnValue(new Promise(() => {})); // never resolves
    const { queryByLabelText } = await render(<GroupScreen />);

    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it("opens the receipt form when the button is pressed", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: GROUP_WITH_RECEIPTS });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    expect(queryByLabelText("Store")).toBeNull();
    await fireEvent.press(await findByLabelText("Add receipt"));

    expect(await findByLabelText("Store")).toBeTruthy();
  });

  it("adds a submitted receipt to the list", async () => {
    MOCK_PARAMS.mockReturnValue({ id: "mock-2" });
    MOCK_LOAD.mockResolvedValue({
      status: "ok",
      detail: GROUP_WITHOUT_RECEIPTS,
    });
    const { findByLabelText, findByText, getByLabelText, queryByText } =
      await render(<GroupScreen />);
  
    await fireEvent.press(await findByLabelText("Add receipt"));
    await fireEvent.changeText(await findByLabelText("Store"), "Corner Market");
    await fireEvent.changeText(getByLabelText("Item 1 name"), "Milk");
    await fireEvent.changeText(getByLabelText("Item 1 price"), "5.00");
    await fireEvent.press(getByLabelText("Submit receipt"));
  
    expect(await findByText("Corner Market")).toBeTruthy();
    expect(await findByText("$5.00")).toBeTruthy();
    expect(queryByText("Receipts will show up here.")).toBeNull();
    expect(queryByText("Draft")).toBeNull();
  });
  
  it("adds a saved draft with a Draft badge", async () => {
    MOCK_PARAMS.mockReturnValue({ id: "mock-2" });
    MOCK_LOAD.mockResolvedValue({
      status: "ok",
      detail: GROUP_WITHOUT_RECEIPTS,
    });
    const { findByLabelText, findByText, getByLabelText } = await render(
      <GroupScreen />
    );
  
    await fireEvent.press(await findByLabelText("Add receipt"));
    await fireEvent.changeText(await findByLabelText("Store"), "Corner Market");
    await fireEvent.press(getByLabelText("Save draft"));
  
    expect(await findByText("Corner Market")).toBeTruthy();
    expect(await findByText("Draft")).toBeTruthy();
  });
});