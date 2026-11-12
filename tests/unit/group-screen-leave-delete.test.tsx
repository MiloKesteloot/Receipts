/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 2.4, Tasks 3 & 4 + group editing updates:
 * - Role-based Edit group (owner) and Leave Group (member) controls
 * - In-card custom confirmation prompts (no system Alert.alert)
 * - Group renaming and deletion from the Edit group modal
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";

import GroupScreen from "@/app/(app)/(home)/groups/[id]";
import { loadGroupDetail } from "@/lib/group-data";
import { deleteGroup, leaveGroup, renameGroup } from "@/lib/groups";

/** Test current user ID. */
const TEST_CURRENT_USER_ID = "current-user";

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    dismissTo: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  // Runs the effect like useEffect, as if the screen were always focused.
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));
jest.mock("@/lib/group-data", () => ({ loadGroupDetail: jest.fn() }));
jest.mock("@/lib/groups", () => ({
  MAX_GROUP_NAME_LENGTH: 50,
  leaveGroup: jest.fn(),
  deleteGroup: jest.fn(),
  renameGroup: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/components/toast", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Toast: ({ message }: { message: string }) => <Text>{message}</Text>,
  };
});
jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({ session: { user: { id: "current-user" } } }),
}));

/**
 * A mocked async function that takes any arguments.
 */
type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

/**
 * Mocked group loader.
 */
const MOCK_LOAD = loadGroupDetail as unknown as AsyncMock;

/**
 * Mocked leaveGroup service call.
 */
const MOCK_LEAVE = leaveGroup as unknown as AsyncMock;

/**
 * Mocked deleteGroup service call.
 */
const MOCK_DELETE = deleteGroup as unknown as AsyncMock;

/**
 * Mocked renameGroup service call.
 */
const MOCK_RENAME = renameGroup as unknown as AsyncMock;

/**
 * Mocked route params hook.
 */
const MOCK_PARAMS = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Mocked router, with the methods the screen uses.
 */
const MOCK_ROUTER = router as unknown as {
  canGoBack: jest.Mock<() => boolean>;
  dismissTo: jest.Mock;
  replace: jest.Mock;
};

/**
 * Builds a group detail where the signed-in mock user has the given role.
 * @param role The current user's role, or null when not a member
 * @returns Group detail for the mocked loader
 */
function detailWithRole(role: "owner" | "member" | null): unknown {
  const owner = role === "owner" ? TEST_CURRENT_USER_ID : "u1";
  const members = [
    { user_id: owner, display_name: "Owner", role: "owner", joined_at: "2026-10-01T12:00:00Z" },
  ];
  if (role === "member") {
    members.push({
      user_id: TEST_CURRENT_USER_ID,
      display_name: "You",
      role: "member",
      joined_at: "2026-10-02T12:00:00Z",
    });
  }
  return {
    group: {
      id: "g1",
      name: "Ski Trip",
      invite_code: "SKI12345",
      created_by: owner,
      created_at: "2026-10-01T12:00:00Z",
    },
    members,
    receipts: [],
  };
}

describe("GroupScreen: Edit / Leave / Delete group", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    MOCK_PARAMS.mockReturnValue({ id: "g1" });
    MOCK_ROUTER.canGoBack.mockReturnValue(true);
  });

  it("shows Leave Group (not Edit group or Delete Group) to a non-owner member", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByLabelText("Leave Group")).toBeTruthy();
    expect(queryByLabelText("Edit group")).toBeNull();
    expect(queryByLabelText("Delete Group")).toBeNull();
  });

  it("shows Edit group horizontally beside the title and hides Leave/Delete until opened", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    const { findByLabelText, queryByLabelText, queryByText } = await render(
      <GroupScreen />
    );

    expect(await findByLabelText("Edit group")).toBeTruthy();
    expect(queryByLabelText("Delete Group")).toBeNull();
    expect(queryByLabelText("Leave Group")).toBeNull();
    expect(queryByText(/^Group$/)).toBeNull();
  });

  it("shows neither Edit group nor Leave Group to someone who isn't a member", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole(null) });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    await findByLabelText("Add receipt");
    expect(queryByLabelText("Leave Group")).toBeNull();
    expect(queryByLabelText("Edit group")).toBeNull();
    expect(queryByLabelText("Delete Group")).toBeNull();
  });

  it("prompts in a custom card modal for Leave Group and does nothing when cancelled", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    const { findByLabelText, getByText, queryByText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(getByText("Are you sure you want to leave Ski Trip?")).toBeTruthy();

    await fireEvent.press(getByText("Cancel"));

    expect(queryByText("Are you sure you want to leave Ski Trip?")).toBeNull();
    expect(MOCK_LEAVE).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.dismissTo).not.toHaveBeenCalled();
  });

  it("leaves after confirming the card prompt and returns to the list with a toast", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    MOCK_LEAVE.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Ski Trip",
      message: "Left Ski Trip",
    });
    const { findByLabelText, getByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));
    await fireEvent.press(getByLabelText("Leave"));

    await waitFor(() => expect(MOCK_ROUTER.dismissTo).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(MOCK_LEAVE).toHaveBeenCalledWith("g1");
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: expect.objectContaining({
        toastMessage: "Left Ski Trip",
        toastType: "success",
        removedGroupId: "g1",
      }),
    });
  });

  it("lets the owner rename the group from Edit group", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    MOCK_RENAME.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Winter Ski Trip",
      message: "Group renamed to Winter Ski Trip",
    });
    const { findByLabelText, getByLabelText, findByText } = await render(
      <GroupScreen />
    );

    await fireEvent.press(await findByLabelText("Edit group"));

    const nameInput = getByLabelText("Group name");
    await fireEvent.changeText(nameInput, "Winter Ski Trip");
    await fireEvent.press(getByLabelText("Save changes"));

    await waitFor(() =>
      expect(MOCK_RENAME).toHaveBeenCalledWith("g1", "Winter Ski Trip")
    );
    expect(await findByText("Winter Ski Trip")).toBeTruthy();
    expect(await findByText("Group renamed to Winter Ski Trip")).toBeTruthy();
  });

  it("prompts in a custom card view and deletes after owner confirms inside Edit group", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    MOCK_DELETE.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Ski Trip",
      message: "Ski Trip deleted",
    });
    const { findByLabelText, getByLabelText, getByText } = await render(
      <GroupScreen />
    );

    await fireEvent.press(await findByLabelText("Edit group"));
    await fireEvent.press(getByLabelText("Delete Group"));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(
      getByText(
        "Are you sure you want to delete Ski Trip? This will permanently delete the group and all receipts for all members."
      )
    ).toBeTruthy();

    await fireEvent.press(getByLabelText("Delete"));

    await waitFor(() => expect(MOCK_ROUTER.dismissTo).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(MOCK_DELETE).toHaveBeenCalledWith("g1");
    expect(MOCK_LEAVE).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: expect.objectContaining({ toastMessage: "Ski Trip deleted" }),
    });
  });

  it("returns to Edit group when Cancel is pressed in the delete confirmation card", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    const { findByLabelText, getByLabelText, getByText, queryByText } = await render(
      <GroupScreen />
    );

    await fireEvent.press(await findByLabelText("Edit group"));
    await fireEvent.press(getByLabelText("Delete Group"));
    await fireEvent.press(getByText("Cancel"));

    expect(
      queryByText(
        "Are you sure you want to delete Ski Trip? This will permanently delete the group and all receipts for all members."
      )
    ).toBeNull();
    expect(getByLabelText("Group name")).toBeTruthy();
    expect(MOCK_DELETE).not.toHaveBeenCalled();
  });

  it("uses replace when there is no screen to go back to", async () => {
    MOCK_ROUTER.canGoBack.mockReturnValue(false);
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    MOCK_LEAVE.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Ski Trip",
      message: "Left Ski Trip",
    });
    const { findByLabelText, getByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));
    await fireEvent.press(getByLabelText("Leave"));

    await waitFor(() => expect(MOCK_ROUTER.replace).toHaveBeenCalled());
    expect(MOCK_ROUTER.dismissTo).not.toHaveBeenCalled();
  });

  it("stays on the screen when the server refuses", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    MOCK_LEAVE.mockResolvedValue({
      success: false,
      error: "NETWORK_ERROR",
      message: "Offline",
    });
    const { findByLabelText, getByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));
    await fireEvent.press(getByLabelText("Leave"));

    await waitFor(() => expect(MOCK_LEAVE).toHaveBeenCalled());
    expect(MOCK_ROUTER.dismissTo).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.replace).not.toHaveBeenCalled();
  });

  it("shows the server's error message on the loaded screen after delete fails", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    MOCK_DELETE.mockResolvedValue({
      success: false,
      error: "NETWORK_ERROR",
      message: "Could not find the function public.delete_group(p_group_id)",
    });
    const { findByLabelText, getByLabelText, findByText } = await render(
      <GroupScreen />
    );

    await fireEvent.press(await findByLabelText("Edit group"));
    await fireEvent.press(getByLabelText("Delete Group"));
    await fireEvent.press(getByLabelText("Delete"));

    expect(await findByText(/Could not find the function/)).toBeTruthy();
  });

  it("ignores a second tap while leave confirmation is still running", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    let finish: (value: unknown) => void = () => undefined;
    MOCK_LEAVE.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { findByLabelText, getByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));
    const confirmButton = getByLabelText("Leave");

    await fireEvent.press(confirmButton);
    await fireEvent.press(confirmButton);
    await fireEvent.press(confirmButton);
    await waitFor(() => expect(MOCK_LEAVE).toHaveBeenCalled());

    await act(async () => {
      finish({ success: true, group_id: "g1", group_name: "Ski Trip", message: "Left Ski Trip" });
    });

    expect(MOCK_LEAVE).toHaveBeenCalledTimes(1);
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledTimes(1);
  });
});
