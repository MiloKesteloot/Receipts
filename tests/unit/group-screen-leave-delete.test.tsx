/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 2.4, Tasks 3 & 4: the group screen's role-based Leave/Delete
 * button, its confirmation dialog, and the redirect back to the list.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, type AlertButton } from "react-native";

import GroupScreen from "@/app/(app)/(home)/groups/[id]";
import { MOCK_CURRENT_USER_ID } from "@/lib/create-group";
import { loadGroupDetail } from "@/lib/group-data";
import { deleteGroup, leaveGroup } from "@/lib/groups";

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
  leaveGroup: jest.fn(),
  deleteGroup: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/components/toast", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Toast: ({ message }: { message: string }) => <Text>{message}</Text>,
  };
});
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ session: null }) }));

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
  const owner = role === "owner" ? MOCK_CURRENT_USER_ID : "u1";
  const members = [
    { user_id: owner, display_name: "Owner", role: "owner", joined_at: "2026-10-01T12:00:00Z" },
  ];
  if (role === "member") {
    members.push({
      user_id: MOCK_CURRENT_USER_ID,
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

/**
 * Makes Alert.alert press the button with the given label.
 * @param label Button label to press
 * @returns The Alert.alert spy
 */
function answerAlert(label: string) {
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((b) => b.text === label)?.onPress?.();
    });
}

describe("GroupScreen: Leave / Delete group (US 2.4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    MOCK_PARAMS.mockReturnValue({ id: "g1" });
    MOCK_ROUTER.canGoBack.mockReturnValue(true);
  });

  it("shows Leave Group (not Delete) to a non-owner member", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByLabelText("Leave Group")).toBeTruthy();
    expect(queryByLabelText("Delete Group")).toBeNull();
  });

  it("shows Delete Group instead of Leave to the owner", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    expect(await findByLabelText("Delete Group")).toBeTruthy();
    expect(queryByLabelText("Leave Group")).toBeNull();
  });

  it("shows neither button to someone who isn't in the member list", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole(null) });
    const { findByLabelText, queryByLabelText } = await render(<GroupScreen />);

    await findByLabelText("Add receipt");
    expect(queryByLabelText("Leave Group")).toBeNull();
    expect(queryByLabelText("Delete Group")).toBeNull();
  });

  it("asks for confirmation and does nothing when cancelled", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    const alert = answerAlert("Cancel");
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));

    expect(alert).toHaveBeenCalledWith(
      "Leave Group",
      "Are you sure you want to leave Ski Trip?",
      expect.any(Array),
      expect.any(Object)
    );
    expect(MOCK_LEAVE).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.dismissTo).not.toHaveBeenCalled();
  });

  it("leaves after confirming and returns to the list with a toast", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    MOCK_LEAVE.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Ski Trip",
      message: "Left Ski Trip",
    });
    answerAlert("Leave");
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));

    await waitFor(() => expect(MOCK_ROUTER.dismissTo).toHaveBeenCalled());
    expect(MOCK_LEAVE).toHaveBeenCalledWith("g1", MOCK_CURRENT_USER_ID);
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: expect.objectContaining({
        toastMessage: "Left Ski Trip",
        toastType: "success",
        removedGroupId: "g1",
      }),
    });
  });

  it("deletes after the owner confirms the permanent-delete warning", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    MOCK_DELETE.mockResolvedValue({
      success: true,
      group_id: "g1",
      group_name: "Ski Trip",
      message: "Ski Trip deleted",
    });
    const alert = answerAlert("Delete");
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Delete Group"));

    await waitFor(() => expect(MOCK_ROUTER.dismissTo).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe("Delete Group");
    expect(alert.mock.calls[0][1]).toBe(
      "Are you sure you want to delete Ski Trip? This will permanently delete the group and all receipts for all members."
    );
    expect(MOCK_DELETE).toHaveBeenCalledWith("g1", MOCK_CURRENT_USER_ID);
    expect(MOCK_LEAVE).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: expect.objectContaining({ toastMessage: "Ski Trip deleted" }),
    });
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
    answerAlert("Leave");
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));

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
    answerAlert("Leave");
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Leave Group"));

    await waitFor(() => expect(MOCK_LEAVE).toHaveBeenCalled());
    expect(MOCK_ROUTER.dismissTo).not.toHaveBeenCalled();
    expect(MOCK_ROUTER.replace).not.toHaveBeenCalled();
  });

  it("shows the server's error message on the loaded screen", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    MOCK_DELETE.mockResolvedValue({
      success: false,
      error: "NETWORK_ERROR",
      message: "Could not find the function public.delete_group(p_group_id)",
    });
    answerAlert("Delete");
    const { findByLabelText, findByText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Delete Group"));

    expect(await findByText(/Could not find the function/)).toBeTruthy();
  });

  it("ignores a second tap while the first is still running", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    let finish: (value: unknown) => void = () => undefined;
    MOCK_LEAVE.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    answerAlert("Leave");
    const { findByLabelText } = await render(<GroupScreen />);
    const button = await findByLabelText("Leave Group");

    // Not awaited: each press stays pending until the leave call finishes.
    const presses = [
      fireEvent.press(button),
      fireEvent.press(button),
      fireEvent.press(button),
    ];
    await waitFor(() => expect(MOCK_LEAVE).toHaveBeenCalled());

    await act(async () => {
      finish({ success: true, group_id: "g1", group_name: "Ski Trip", message: "Left Ski Trip" });
    });
    await Promise.all(presses);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(MOCK_LEAVE).toHaveBeenCalledTimes(1);
    expect(MOCK_ROUTER.dismissTo).toHaveBeenCalledTimes(1);
  });
});
