/* eslint-disable @typescript-eslint/naming-convention */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import GroupScreen from "@/app/(app)/(home)/groups/[id]";
import { loadGroupDetail } from "@/lib/group-data";

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  // Runs the effect like useEffect, as if the screen were always focused.
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));
jest.mock("@/lib/group-data", () => ({ loadGroupDetail: jest.fn() }));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));
jest.mock("@/components/toast", () => ({ Toast: () => null }));
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ session: { user: { id: "u1" } } }) }));
jest.mock("@/lib/receipts", () => {
  let nextId = 1;
  return {
    saveReceipt: jest.fn(
      async (
        _groupId: string,
        draft: { store?: string; items?: { price: string }[] },
        status: string,
        options?: { existingId?: string }
      ) => {
        const total_cents = (draft.items || []).reduce(
          (sum: number, it: { price: string }) => sum + Math.round((parseFloat(it.price) || 0) * 100),
          0
        );
        return {
          status: "ok" as const,
          receipt: {
            id: options?.existingId ?? `mock-r-${nextId++}`,
            title: draft.store ?? "Receipt",
            total_cents,
            status,
            created_at: new Date().toISOString(),
            draft: status === "draft" ? draft : undefined,
          },
        };
      }
    ),
    deleteReceipt: jest.fn(async () => ({ status: "ok" as const })),
  };
});

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
const GROUP_WITH_RECEIPTS = {
  group: {
    id: "g1",
    name: "Apartment 402",
    invite_code: "APT402XY",
    created_by: "u1",
    created_at: "2026-10-01T00:00:00Z",
  },
  members: [
    {
      user_id: "u1",
      display_name: "Alex",
      role: "owner" as const,
      joined_at: "2026-10-01T00:00:00Z",
    },
  ],
  receipts: [
    {
      id: "r1",
      title: "Costco run",
      total_cents: 8423,
      created_at: "2026-10-05T00:00:00Z",
    },
    {
      id: "r2",
      title: "Internet bill",
      total_cents: 6000,
      created_at: "2026-10-06T00:00:00Z",
    },
  ],
};

/**
 * Road Trip 2026: no receipts (empty state).
 */
const GROUP_WITHOUT_RECEIPTS = {
  group: {
    id: "g2",
    name: "Road Trip 2026",
    invite_code: "ROADTRIP",
    created_by: "u2",
    created_at: "2026-10-02T00:00:00Z",
  },
  members: [
    {
      user_id: "u2",
      display_name: "Sam",
      role: "owner" as const,
      joined_at: "2026-10-02T00:00:00Z",
    },
  ],
  receipts: [],
};

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

    expect(await findByText(/Group not found/)).toBeTruthy();
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

    it("opens a saved draft with its values and updates it in place", async () => {
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
    await fireEvent.press(getByLabelText("Save draft"));
    await fireEvent.press(await findByLabelText("Edit draft Corner Market"));

    const store = await findByLabelText("Store");
    expect(store.props.value).toBe("Corner Market");
    expect(getByLabelText("Item 1 name").props.value).toBe("Milk");

    await fireEvent.changeText(store, "Market Two");
    await fireEvent.press(getByLabelText("Submit receipt"));

    expect(await findByText("Market Two")).toBeTruthy();
    expect(queryByText("Corner Market")).toBeNull();
    expect(queryByText("Draft")).toBeNull();
  });

  it("deletes a saved draft from the list", async () => {
    MOCK_PARAMS.mockReturnValue({ id: "mock-2" });
    MOCK_LOAD.mockResolvedValue({
      status: "ok",
      detail: GROUP_WITHOUT_RECEIPTS,
    });
    const { findByLabelText, findByText, getByLabelText, queryByText } =
      await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Add receipt"));
    await fireEvent.changeText(await findByLabelText("Store"), "Corner Market");
    await fireEvent.press(getByLabelText("Save draft"));
    await fireEvent.press(await findByLabelText("Edit draft Corner Market"));
    await fireEvent.press(await findByLabelText("Delete receipt"));
    await fireEvent.press(await findByLabelText("Confirm delete"));

    await waitFor(() => expect(queryByText("Corner Market")).toBeNull());
    expect(await findByText("Receipts will show up here.")).toBeTruthy();
  });
});