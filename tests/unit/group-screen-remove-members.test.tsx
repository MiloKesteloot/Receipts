/* eslint-disable @typescript-eslint/naming-convention */
/**
 * User Story 3.2, Task 1: the owner-only "Remove members" button on the
 * group screen.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import GroupScreen from "@/app/(app)/(home)/groups/[id]";
import { MOCK_CURRENT_USER_ID } from "@/lib/create-group";
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
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/components/toast", () => ({ Toast: () => null }));
jest.mock("@/lib/auth-provider", () => ({ useAuth: () => ({ session: null }) }));

/** Mocked group loader. */
const MOCK_LOAD = loadGroupDetail as unknown as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;

/** Mocked route params hook. */
const MOCK_PARAMS = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/**
 * Builds a group detail where the signed-in mock user has the given role.
 * @param role The current user's role in the group
 * @returns Group detail for the mocked loader
 */
function detailWithRole(role: "owner" | "member"): unknown {
  const ownerId = role === "owner" ? MOCK_CURRENT_USER_ID : "u1";
  return {
    group: {
      id: "g1",
      name: "Apartment",
      invite_code: "ABC",
      created_by: ownerId,
      created_at: "2026-10-01T00:00:00Z",
    },
    members: [
      { user_id: ownerId, display_name: "Olive", role: "owner", joined_at: "2026-10-01T00:00:00Z" },
      {
        user_id: role === "owner" ? "u2" : MOCK_CURRENT_USER_ID,
        display_name: "Sam",
        role: "member",
        joined_at: "2026-10-02T00:00:00Z",
      },
    ],
    receipts: [],
  };
}

describe("GroupScreen: Remove members button (US 3.2 Task 1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_PARAMS.mockReturnValue({ id: "g1" });
  });

  it("shows the button to the owner and opens the picker for this group", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("owner") });
    const { findByLabelText } = await render(<GroupScreen />);

    await fireEvent.press(await findByLabelText("Remove members"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/remove-members",
      params: { from: "g1" },
    });
  });

  it("does not render the button for a regular member", async () => {
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: detailWithRole("member") });
    const { findByText, queryByLabelText, queryByText } = await render(
      <GroupScreen />
    );

    expect(await findByText("Members (2)")).toBeTruthy();
    expect(queryByLabelText("Remove members")).toBeNull();
    expect(queryByText("Remove members")).toBeNull();
  });

  it("does not render the button while loading", async () => {
    MOCK_LOAD.mockReturnValue(new Promise(() => {})); // never resolves
    const { queryByLabelText } = await render(<GroupScreen />);

    expect(queryByLabelText("Remove members")).toBeNull();
  });
});
