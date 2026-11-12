/* eslint-disable @typescript-eslint/naming-convention -- mirrors route/auth mock shapes */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import Index from "@/app/(app)/(home)/index";
import { createGroup } from "@/lib/create-group";
import { type HomeOverviewResult, loadHomeOverview } from "@/lib/home-overview";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

/** Mock auth session returned by `useAuth`. */
const MOCK_SESSION = {
  user: {
    id: "u1",
    email: "kellar@ucsc.edu",
    user_metadata: { full_name: "Kellar McLaughlin" },
  },
};

jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({
    session: MOCK_SESSION,
  }),
}));

jest.mock("@/lib/home-overview", () => {
  const actual = jest.requireActual<typeof import("@/lib/home-overview")>(
    "@/lib/home-overview"
  );
  return {
    ...actual,
    loadHomeOverview: jest.fn(),
  };
});

jest.mock("@/lib/create-group", () => {
  const actual = jest.requireActual<typeof import("@/lib/create-group")>(
    "@/lib/create-group"
  );
  return {
    ...actual,
    createGroup: jest.fn(),
  };
});

jest.mock("@/lib/groups", () => ({
  joinGroup: jest.fn(),
}));

/** Typed Jest mock for `loadHomeOverview`. */
const MOCK_LOAD_HOME_OVERVIEW = loadHomeOverview as jest.MockedFunction<
  typeof loadHomeOverview
>;
/** Typed Jest mock for `createGroup`. */
const MOCK_CREATE_GROUP = createGroup as jest.MockedFunction<
  typeof createGroup
>;
/** Typed Jest mock for `useLocalSearchParams`. */
const MOCK_USE_PARAMS = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;

describe("User Story 3.1 Task 2: Home overview screen & cards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_USE_PARAMS.mockReturnValue({});
  });

  it("US-3.1-T-2: displays personalized greeting with resolved displayName", async () => {
    const result: HomeOverviewResult = {
      status: "ok",
      overview: {
        displayName: "Kellar McLaughlin",
        groups: [],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    };
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue(result);

    const screen = await render(<Index />);
    expect(screen.getByText("Hi, Kellar McLaughlin")).toBeTruthy();
  });

  it("US-3.1-T-2: renders balance summary card with formatted Owed to me and I owe amounts", async () => {
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue({
      status: "ok",
      overview: {
        displayName: "Kellar",
        groups: [],
        balances: { owedToMeCents: 4250, iOweCents: 1375 },
      },
    });

    const screen = await render(<Index />);
    expect(screen.getByTestId("balance-card")).toBeTruthy();
    expect(screen.getByText("Owed to me")).toBeTruthy();
    expect(screen.getByText("I owe")).toBeTruthy();
    expect(screen.getByTestId("owed-to-me-amount").props.children).toBe(
      "$42.50"
    );
    expect(screen.getByTestId("i-owe-amount").props.children).toBe("$13.75");
  });

  it("US-3.1-T-2: renders group cards with member counts and latest submitted receipt or empty receipt fallback", async () => {
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue({
      status: "ok",
      overview: {
        displayName: "Kellar",
        groups: [
          {
            id: "g1",
            name: "Apartment 402",
            memberCount: 3,
            latestReceipt: {
              id: "r1",
              title: "Costco Run",
              totalCents: 8423,
              createdAt: "2026-10-05T17:00:00Z",
            },
          },
          {
            id: "g2",
            name: "Solo Trip",
            memberCount: 1,
            latestReceipt: null,
          },
        ],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    });

    const screen = await render(<Index />);
    expect(screen.getByText("Apartment 402")).toBeTruthy();
    expect(screen.getByText("3 members")).toBeTruthy();
    expect(screen.getByText("Latest: Costco Run · $84.23")).toBeTruthy();

    expect(screen.getByText("Solo Trip")).toBeTruthy();
    expect(screen.getByText("1 member")).toBeTruthy();
    expect(screen.getByText("No receipts yet")).toBeTruthy();
  });

  it("US-3.1-T-2: shows greeting and zero balances when the user has no groups", async () => {
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue({
      status: "ok",
      overview: {
        displayName: "Alex",
        groups: [],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    });

    const screen = await render(<Index />);
    expect(screen.getByText("Hi, Alex")).toBeTruthy();
    expect(screen.getByTestId("owed-to-me-amount").props.children).toBe(
      "$0.00"
    );
    expect(screen.getByTestId("i-owe-amount").props.children).toBe("$0.00");
    expect(screen.getByText("You're not in any groups yet.")).toBeTruthy();
  });

  it("US-3.1-T-2: navigates to group detail when pressing a group card", async () => {
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue({
      status: "ok",
      overview: {
        displayName: "Alex",
        groups: [
          {
            id: "group-42",
            name: "Beach House",
            memberCount: 2,
            latestReceipt: null,
          },
        ],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    });

    const screen = await render(<Index />);
    await fireEvent.press(screen.getByLabelText("Open Beach House"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/groups/[id]",
      params: { id: "group-42" },
    });
  });

  it("US-3.1-T-2: displays error retry flow and refreshes overview cleanly after creating a group", async () => {
    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValueOnce({
      status: "error",
      message: "Could not reach Supabase",
    });

    const screen = await render(<Index />);
    expect(screen.getByText("Could not reach Supabase")).toBeTruthy();

    MOCK_LOAD_HOME_OVERVIEW.mockResolvedValue({
      status: "ok",
      overview: {
        displayName: "Kellar McLaughlin",
        groups: [
          {
            id: "g1",
            name: "Apartment 402",
            memberCount: 2,
            latestReceipt: null,
          },
        ],
        balances: { owedToMeCents: 0, iOweCents: 0 },
      },
    });

    await fireEvent.press(screen.getByText("Try again"));
    expect(screen.getByText("Hi, Kellar McLaughlin")).toBeTruthy();
    expect(screen.getByText("Apartment 402")).toBeTruthy();

    const loadCallsBeforeCreate = MOCK_LOAD_HOME_OVERVIEW.mock.calls.length;
    MOCK_CREATE_GROUP.mockResolvedValueOnce({
      success: true,
      message: "Created Study Group",
      group: {
        id: "g-new",
        name: "Study Group",
        inviteCode: "STUDY123",
        createdAt: "2026-10-12T10:00:00Z",
      },
    });

    await fireEvent.press(screen.getByLabelText("New group"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Group name, e.g. Apartment 402"),
      "Study Group"
    );
    await fireEvent.press(screen.getByText("Create group"));

    expect(MOCK_LOAD_HOME_OVERVIEW.mock.calls.length).toBeGreaterThan(
      loadCallsBeforeCreate
    );
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/groups/[id]",
        params: expect.objectContaining({
          id: "g-new",
          toastMessage: "Successfully created group Study Group",
        }),
      })
    );
  });
});
