import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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

// Loosely typed so mockResolvedValue / mockReturnValue accept any value.
type LooseMock = jest.Mock<(...args: any[]) => any>;
const mockLoad = loadGroupDetail as unknown as LooseMock;
const mockParams = useLocalSearchParams as unknown as LooseMock;

const groupWithReceipts = mockGroupDetails["mock-1"];
const groupWithoutReceipts = mockGroupDetails["mock-2"];

describe("GroupScreen: Add receipt button (US 2.1 Task 1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ id: "mock-1" });
  });

  it("shows the Add receipt button when the group has no receipts", async () => {
    mockParams.mockReturnValue({ id: "mock-2" });
    mockLoad.mockResolvedValue({ status: "ok", detail: groupWithoutReceipts });
    const { findByLabelText, getByText } = await render(<GroupScreen />);

    expect(await findByLabelText("Add receipt")).toBeTruthy();
    expect(getByText("Receipts will show up here.")).toBeTruthy();
  });

  it("shows the Add receipt button alongside existing receipts", async () => {
    mockLoad.mockResolvedValue({ status: "ok", detail: groupWithReceipts });
    const { findByLabelText, getByText } = await render(<GroupScreen />);

    expect(await findByLabelText("Add receipt")).toBeTruthy();
    expect(getByText("Costco run")).toBeTruthy();
    expect(getByText("$84.23")).toBeTruthy();
    expect(getByText("Internet bill")).toBeTruthy();
    expect(getByText("$60.00")).toBeTruthy();
  });

  it("renders the button label text", async () => {
    mockLoad.mockResolvedValue({ status: "ok", detail: groupWithReceipts });
    const { findByText } = await render(<GroupScreen />);

    expect(await findByText("+ Add receipt")).toBeTruthy();
  });

  it("does not crash when the button is pressed", async () => {
    mockLoad.mockResolvedValue({ status: "ok", detail: groupWithReceipts });
    const { findByLabelText } = await render(<GroupScreen />);

    const button = await findByLabelText("Add receipt");
    await expect(fireEvent.press(button)).resolves.not.toThrow();
  });

  it("does not show the button when the user is forbidden", async () => {
    mockLoad.mockResolvedValue({ status: "forbidden" });
    const { findByText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByText("You're not a member of this group.")).toBeTruthy();
    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it("does not show the button when loading fails", async () => {
    mockLoad.mockResolvedValue({ status: "error", message: "Network error" });
    const { findByText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByText("Network error")).toBeTruthy();
    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it("does not show the button while loading", async () => {
    mockLoad.mockReturnValue(new Promise(() => {})); // never resolves
    const { queryByLabelText } = await render(<GroupScreen />);

    expect(queryByLabelText("Add receipt")).toBeNull();
  });

  it.todo("opens the receipt entry form for the current group when pressed");
});