/* eslint-disable @typescript-eslint/naming-convention -- mirrors route, mock and Supabase export names */
/**
 * Sign-in screen tests for User Story 4.2 (Sign in with Google): what the user
 * sees after tapping "Continue with Google".
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";

import SignInScreen from "@/app/sign-in";
import type { AuthResult } from "@/lib/auth";

/** Google sign-in action mock; each test sets what it resolves to. */
const MOCK_SIGN_IN_WITH_GOOGLE = jest.fn<() => Promise<AuthResult>>();

jest.mock("@/lib/auth-provider", () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    signInWithGoogle: MOCK_SIGN_IN_WITH_GOOGLE,
    signInWithApple: jest.fn(),
    updateDisplayName: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock("@/lib/supabase", () => ({ SUPABASE: null, supabase: null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Message the app shows when Google is turned off in Supabase. */
const GOOGLE_OFF = "Google sign-in isn't turned on yet. Sign in with email for now.";

describe("SignInScreen: Continue with Google", () => {
  beforeEach(() => {
    MOCK_SIGN_IN_WITH_GOOGLE.mockReset();
  });

  it("US-4.2-T-1: shows a clear message when Google sign-in is turned off", async () => {
    MOCK_SIGN_IN_WITH_GOOGLE.mockResolvedValue({
      success: false,
      error: "PROVIDER_DISABLED",
      message: GOOGLE_OFF,
    });
    const { getByText, queryByText } = await render(<SignInScreen />);

    await act(async () => {
      fireEvent.press(getByText("Continue with Google"));
    });

    expect(MOCK_SIGN_IN_WITH_GOOGLE).toHaveBeenCalledTimes(1);
    expect(getByText(GOOGLE_OFF)).toBeTruthy();
    expect(queryByText(/Unsupported provider/)).toBeNull();
  });

  it("US-4.2-T-1: shows no error when the user closes Google's page", async () => {
    MOCK_SIGN_IN_WITH_GOOGLE.mockResolvedValue({
      success: false,
      error: "CANCELLED",
      message: "Sign-in cancelled",
    });
    const { getByText, queryByText } = await render(<SignInScreen />);

    await act(async () => {
      fireEvent.press(getByText("Continue with Google"));
    });

    expect(queryByText("Sign-in cancelled")).toBeNull();
    // Still on the sign-in screen, with the button ready to try again.
    expect(getByText("Continue with Google")).toBeTruthy();
    expect(getByText("Welcome back")).toBeTruthy();
  });

  it("US-4.2-T-1: a successful Google sign-in shows no error", async () => {
    MOCK_SIGN_IN_WITH_GOOGLE.mockResolvedValue({ success: true, session: null });
    const { getByText, queryByText } = await render(<SignInScreen />);

    await act(async () => {
      fireEvent.press(getByText("Continue with Google"));
    });

    expect(MOCK_SIGN_IN_WITH_GOOGLE).toHaveBeenCalledTimes(1);
    expect(queryByText(GOOGLE_OFF)).toBeNull();
  });
});
