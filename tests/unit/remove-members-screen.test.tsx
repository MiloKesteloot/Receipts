/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.2, Tasks 4 & 5: the member checklist screen. Runs in server
 * mode with a fake Supabase client so the remove_group_member RPC replies
 * can be controlled.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import RemoveMembersScreen from "@/app/(app)/(home)/remove-members/[groupId]";
import { confirmAction } from "@/lib/confirm-action";
import { loadGroupDetail } from "@/lib/group-data";
import { removeGroupMembers } from "@/lib/group-members";
import { supabase } from "@/lib/supabase";

/** Signed-in user id the mocked useAuth returns; tests change it. */
let mockUserId = "o";

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  // Runs the effect like useEffect, as if the screen were always focused.
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));
jest.mock("@/lib/group-data", () => ({
  ...jest.requireActual<typeof import("@/lib/group-data")>("@/lib/group-data"),
  loadGroupDetail: jest.fn(),
}));
jest.mock("@/lib/group-members", () => {
  const actual =
    jest.requireActual<typeof import("@/lib/group-members")>("@/lib/group-members");
  return { ...actual, removeGroupMembers: jest.fn(actual.removeGroupMembers) };
});
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
jest.mock("@/lib/confirm-action", () => ({ confirmAction: jest.fn() }));
jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ session: { user: { id: mockUserId } } }),
}));
jest.mock("@/components/toast", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Toast: ({ message }: { message: string }) => <Text>{message}</Text>,
  };
});

/**
 * A mocked async function that takes any arguments.
 */
type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

/** Mocked group loader. */
const MOCK_LOAD = loadGroupDetail as unknown as AsyncMock;

/** Mocked confirm dialog. */
const MOCK_CONFIRM = confirmAction as unknown as AsyncMock;

/** Spy around the real removeGroupMembers. */
const MOCK_REMOVE = removeGroupMembers as unknown as AsyncMock;

/** The fake Supabase client's rpc. */
const MOCK_RPC = (supabase as unknown as { rpc: AsyncMock }).rpc;

/** Mocked route params hook. */
const MOCK_PARAMS = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/** Server group owned by "o" (Olive) with members Sam and Jordan. */
const DETAIL = {
  group: {
    id: "g1",
    name: "Apartment",
    invite_code: "ABC",
    created_by: "o",
    created_at: "2026-10-01T00:00:00Z",
  },
  members: [
    { user_id: "o", display_name: "Olive", role: "owner", joined_at: "2026-10-01T00:00:00Z" },
    { user_id: "a", display_name: "Sam", role: "member", joined_at: "2026-10-02T00:00:00Z" },
    { user_id: "b", display_name: "Jordan", role: "member", joined_at: "2026-10-03T00:00:00Z" },
  ],
  receipts: [],
};

describe("RemoveMembersScreen (US 3.2 Tasks 4 & 5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "o";
    MOCK_PARAMS.mockReturnValue({ groupId: "g1" });
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: DETAIL });
    MOCK_RPC.mockResolvedValue({
      data: { success: true, message: "Member removed successfully" },
      error: null,
    });
  });

  it("shows checkboxes only for removable members, not the owner", async () => {
    const { findAllByRole, getByLabelText, queryByLabelText, getByText } =
      await render(<RemoveMembersScreen />);

    const boxes = await findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(getByLabelText("Remove Sam")).toBeTruthy();
    expect(getByLabelText("Remove Jordan")).toBeTruthy();
    expect(queryByLabelText("Remove Olive")).toBeNull();
    expect(getByText("Owner")).toBeTruthy();
  });

  it("disables the Remove button with nothing selected", async () => {
    const { findByLabelText } = await render(<RemoveMembersScreen />);

    const button = await findByLabelText("Remove 0 selected");
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    expect(MOCK_CONFIRM).not.toHaveBeenCalled();
    expect(MOCK_REMOVE).not.toHaveBeenCalled();
  });

  it("removes both selected members after confirming", async () => {
    MOCK_CONFIRM.mockResolvedValue(true);
    const { findByLabelText, getByLabelText, findByText } = await render(
      <RemoveMembersScreen />
    );

    await fireEvent.press(await findByLabelText("Remove Sam"));
    await fireEvent.press(getByLabelText("Remove Jordan"));
    expect(getByLabelText("Remove Sam").props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(getByLabelText("Remove 2 selected"));

    await waitFor(() => expect(MOCK_REMOVE).toHaveBeenCalledTimes(1));
    expect(MOCK_CONFIRM).toHaveBeenCalledWith(
      "Remove members",
      "Remove Sam and Jordan from Apartment? They'll lose access to this group and its receipts.",
      "Remove"
    );
    expect(MOCK_REMOVE.mock.calls[0].slice(0, 3)).toEqual(["g1", ["a", "b"], "o"]);
    expect(MOCK_RPC).toHaveBeenCalledTimes(2);
    expect(await findByText("Removed 2 members")).toBeTruthy();
    // Reloaded so removed people drop off the list.
    expect(MOCK_LOAD).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the confirm is cancelled", async () => {
    MOCK_CONFIRM.mockResolvedValue(false);
    const { findByLabelText, getByLabelText } = await render(
      <RemoveMembersScreen />
    );

    await fireEvent.press(await findByLabelText("Remove Sam"));
    await fireEvent.press(getByLabelText("Remove 1 selected"));

    await waitFor(() => expect(MOCK_CONFIRM).toHaveBeenCalledTimes(1));
    expect(MOCK_REMOVE).not.toHaveBeenCalled();
    expect(MOCK_RPC).not.toHaveBeenCalled();
    expect(getByLabelText("Remove Sam").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("a non-owner opening the URL sees no checkboxes or Remove button", async () => {
    mockUserId = "a";
    const { findByText, queryAllByRole, queryByText } = await render(
      <RemoveMembersScreen />
    );

    expect(
      await findByText("Only the group owner can remove members.")
    ).toBeTruthy();
    expect(queryAllByRole("checkbox")).toHaveLength(0);
    expect(queryByText(/^Remove \(/)).toBeNull();
  });

  it("a non-member opening the URL is told they aren't a member", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "forbidden" });
    const { findByText, queryAllByRole } = await render(<RemoveMembersScreen />);

    expect(await findByText("You're not a member of this group.")).toBeTruthy();
    expect(queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows nothing actionable while the group is loading", async () => {
    MOCK_LOAD.mockReturnValue(new Promise(() => {})); // never resolves
    const { queryAllByRole, queryByText } = await render(<RemoveMembersScreen />);

    expect(queryAllByRole("checkbox")).toHaveLength(0);
    expect(queryByText(/^Remove \(/)).toBeNull();
  });

  it("a server refusal shows an error toast and keeps everyone listed", async () => {
    MOCK_CONFIRM.mockResolvedValue(true);
    MOCK_RPC.mockResolvedValue({
      data: { success: false, message: "Only group owners can remove members" },
      error: null,
    });
    const { findByLabelText, getByLabelText, findByText, getByText } =
      await render(<RemoveMembersScreen />);

    await fireEvent.press(await findByLabelText("Remove Sam"));
    await fireEvent.press(getByLabelText("Remove 1 selected"));

    expect(
      await findByText("Couldn't remove Sam: Only group owners can remove members")
    ).toBeTruthy();
    expect(getByText("Sam")).toBeTruthy();
    expect(getByText("Jordan")).toBeTruthy();
    // The failed member stays selected so the owner can retry.
    expect(getByLabelText("Remove Sam").props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("says so when no one else is in the group", async () => {
    MOCK_LOAD.mockResolvedValue({
      status: "ok",
      detail: { ...DETAIL, members: [DETAIL.members[0]] },
    });
    const { findByText, queryAllByRole } = await render(<RemoveMembersScreen />);

    expect(await findByText("No one else is in this group yet.")).toBeTruthy();
    expect(queryAllByRole("checkbox")).toHaveLength(0);
  });
});
