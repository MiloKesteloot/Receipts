/* eslint-disable @typescript-eslint/naming-convention -- mirrors Supabase and route mock shapes */
/**
 * Unit tests covering demo UX updates:
 * - Sign-in/create-account password visibility toggle and display name field
 * - Group screen invite code display & share button
 * - CreateGroupForm closing flow callback without lingering InviteCodeCard
 * - BottomTabBar custom navigation bubble and PlaceholderScreen rendering
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import type { Tabs } from "expo-router";
import { useLocalSearchParams } from "expo-router";
import { Share } from "react-native";

import GroupScreen from "@/app/(app)/(home)/groups/[id]";
import SignInScreen from "@/app/sign-in";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { CreateGroupForm } from "@/components/create-group-form";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { createGroup } from "@/lib/create-group";
import { loadGroupDetail } from "@/lib/group-data";
import { mockGroupDetails } from "@/lib/mock";

/** Sign-in auth action mock inspected by tests. */
const MOCK_SIGN_IN = jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
  success: true as const,
  session: null,
}));

/** Sign-up auth action mock inspected by tests. */
const MOCK_SIGN_UP = jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
  success: true as const,
  session: null,
}));

jest.mock("expo-router", () => ({
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({
    session: null,
    signInWithEmail: MOCK_SIGN_IN,
    signUpWithEmail: MOCK_SIGN_UP,
    signInWithGoogle: jest.fn(async () => ({ success: true as const })),
    signInWithApple: jest.fn(async () => ({ success: true as const })),
    appleAvailable: false,
  }),
}));

jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("@/lib/group-data", () => ({ loadGroupDetail: jest.fn() }));
jest.mock("@/lib/create-group", () => {
  const actual = jest.requireActual<typeof import("@/lib/create-group")>("@/lib/create-group");
  return {
    ...actual,
    createGroup: jest.fn(),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Mocked route params hook. */
const MOCK_PARAMS = useLocalSearchParams as unknown as jest.Mock<
  () => Record<string, string>
>;

/** Mocked group loader. */
const MOCK_LOAD = loadGroupDetail as unknown as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;

/** Mocked createGroup helper. */
const MOCK_CREATE_GROUP = createGroup as unknown as jest.Mock<
  (name: string) => Promise<unknown>
>;

describe("SignInScreen: password reveal and display name", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("toggles password visibility with the eye icon", async () => {
    const { getByPlaceholderText, getByLabelText } = await render(<SignInScreen />);

    const passwordInput = getByPlaceholderText("Password");
    expect(passwordInput.props.secureTextEntry).toBe(true);

    await fireEvent.press(getByLabelText("Show password"));
    expect(getByPlaceholderText("Password").props.secureTextEntry).toBe(false);

    await fireEvent.press(getByLabelText("Hide password"));
    expect(getByPlaceholderText("Password").props.secureTextEntry).toBe(true);
  });

  it("collects display name in create-account mode and passes it to signUpWithEmail", async () => {
    const { getByText, getByPlaceholderText, queryByPlaceholderText } =
      await render(<SignInScreen />);

    expect(queryByPlaceholderText("Display name")).toBeNull();

    await fireEvent.press(getByText("New here? Create an account"));

    const nameInput = getByPlaceholderText("Display name");
    expect(nameInput).toBeTruthy();

    await fireEvent.changeText(nameInput, "Kelland");
    await fireEvent.changeText(getByPlaceholderText("Email"), "k@example.com");
    await fireEvent.changeText(getByPlaceholderText("Password"), "secret123");
    await fireEvent.press(getByText("Create account"));

    expect(MOCK_SIGN_UP).toHaveBeenCalledWith("k@example.com", "secret123", "Kelland");
  });
});

describe("GroupScreen: invite code visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_PARAMS.mockReturnValue({ id: "mock-1" });
    MOCK_LOAD.mockResolvedValue({ status: "ok", detail: mockGroupDetails["mock-1"] });
  });

  it("shows the group invite code and lets users share it", async () => {
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    const inviteCode = mockGroupDetails["mock-1"].group.invite_code;
    if (!inviteCode) throw new Error("Expected mock-1 invite_code");
    const { findByText, findByLabelText } = await render(<GroupScreen />);

    expect(await findByText(inviteCode)).toBeTruthy();
    await fireEvent.press(await findByLabelText("Share invite code"));
    expect(shareSpy).toHaveBeenCalledWith({
      message: `Join "Apartment 402" with invite code: ${inviteCode}`,
    });
    shareSpy.mockRestore();
  });
});

describe("CreateGroupForm: hands off immediately via onCreated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls onCreated with the new group without showing an inline invite card", async () => {
    const createdGroup = {
      id: "grp-99",
      name: "Lake Tahoe",
      inviteCode: "TAHOE999",
      createdAt: "2026-11-11T00:00:00Z",
    };
    MOCK_CREATE_GROUP.mockResolvedValue({
      success: true,
      group: createdGroup,
      message: "Created Lake Tahoe",
    });

    const onCreated = jest.fn();
    const { getByPlaceholderText, getByText, queryByText } = await render(
      <CreateGroupForm onCreated={onCreated} />
    );

    await fireEvent.changeText(
      getByPlaceholderText("Group name, e.g. Apartment 402"),
      "Lake Tahoe"
    );
    await act(async () => {
      await fireEvent.press(getByText("Create group"));
    });

    expect(onCreated).toHaveBeenCalledWith(createdGroup);
    expect(queryByText("Group created")).toBeNull();
    expect(queryByText("TAHOE999")).toBeNull();
  });
});

describe("BottomTabBar and PlaceholderScreen", () => {
  it("renders all five tabs, highlights the active tab, and switches routes on press", async () => {
    /** Props inferred directly from Expo Router Tabs. */
    type TabBarProps = Parameters<
      NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
    >[0];

    const emit = jest.fn(() => ({ defaultPrevented: false })) as unknown as TabBarProps["emitter"]["emit"];
    const navigateToTab = jest.fn();
    const routes = [
      { key: "home-key", name: "(home)" },
      { key: "stats-key", name: "stats" },
      { key: "payments-key", name: "payments" },
      { key: "settings-key", name: "settings" },
      { key: "account-key", name: "account" },
    ];
    const titles: Record<string, string> = {
      "home-key": "Home",
      "stats-key": "Stats",
      "payments-key": "Payments",
      "settings-key": "Settings",
      "account-key": "Account",
    };
    const descriptors = Object.fromEntries(
      routes.map((route) => [
        route.key,
        { options: { title: titles[route.key] } },
      ])
    ) as unknown as TabBarProps["descriptors"];

    const { getByText, getByRole, getAllByRole } = await render(
      <BottomTabBar
        state={{ index: 0, routes }}
        descriptors={descriptors}
        emitter={{ emit } as unknown as TabBarProps["emitter"]}
        navigateToTab={navigateToTab}
        insets={{ top: 0, right: 0, bottom: 16, left: 0 }}
      />
    );

    expect(getAllByRole("tab")).toHaveLength(5);
    expect(getByText("Home")).toBeTruthy();
    expect(getByText("Stats")).toBeTruthy();
    expect(getByText("Payments")).toBeTruthy();
    expect(getByText("Settings")).toBeTruthy();
    expect(getByText("Account")).toBeTruthy();
    expect(getByRole("tab", { name: "Home" }).props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(getByRole("tab", { name: "Stats" }));
    expect(navigateToTab).toHaveBeenCalledWith("stats-key");
  });

  it("renders themed placeholder copy", async () => {
    const { getByText } = await render(
      <PlaceholderScreen
        title="Stats"
        description="Spending breakdown and trends will appear here."
      />
    );

    expect(getByText("Coming soon")).toBeTruthy();
    expect(getByText("Stats placeholder")).toBeTruthy();
    expect(
      getByText("Spending breakdown and trends will appear here.")
    ).toBeTruthy();
  });
});
