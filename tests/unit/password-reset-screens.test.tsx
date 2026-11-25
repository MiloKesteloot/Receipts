/* eslint-disable @typescript-eslint/naming-convention -- mocked module exports keep their real names */
/**
 * User Story 4.10, Task 1: the Forgot password form on the sign-in screen,
 * the "Choose a new password" screen, and the auth provider keeping the user
 * on that screen after a reset link is opened.
 *
 * Run with:
 *   npm run test:ui -- tests/unit/password-reset-screens.test.tsx
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Text } from "react-native";
import { JSX } from "react/jsx-runtime";

import * as resetPasswordRoute from "@/app/reset-password";
import * as signInRoute from "@/app/sign-in";
import { authRouteGuards, isSignedIn, RESET_EMAIL_SENT_MESSAGE, type AuthResult } from "@/lib/auth";

/** The "Choose a new password" screen (the route's default export). */
const ResetPasswordScreen = resetPasswordRoute.default;

/** The sign-in screen (the route's default export). */
const SignInScreen = signInRoute.default;

/** What the mocked useAuth returns. Tests change it. */
let mockAuth: Record<string, unknown> = {};

/** The fake Supabase client's auth listener, so tests can fire events. */
let mockListener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

/** Calls the fake Supabase client received. */
const mockSupabaseCalls: { method: string; args: unknown[] }[] = [];

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));

jest.mock("expo-linking", () => ({
  createURL: (path: string) => `receipts://${path}`,
  useLinkingURL: () => null,
}));

jest.mock("@/lib/push-notifications", () => ({
  unregisterThisDevice: jest.fn(async () => {}),
  usePushNotifications: jest.fn(),
}));

jest.mock("@/lib/supabase", () => {
  const record =
    (method: string, answer: unknown) =>
    async (...args: unknown[]) => {
      mockSupabaseCalls.push({ method, args });
      return answer;
    };
  const auth = {
    onAuthStateChange: (callback: typeof mockListener) => {
      mockListener = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    resetPasswordForEmail: record("resetPasswordForEmail", { data: {}, error: null }),
    updateUser: record("updateUser", { data: { user: { id: "user-1" } }, error: null }),
    signOut: async () => {
      mockSupabaseCalls.push({ method: "signOut", args: [] });
      mockListener?.("SIGNED_OUT", null);
      return { error: null };
    },
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  };
  return { SUPABASE: { auth }, supabase: { auth } };
});

// The screens read auth through this mock; the provider tests use the real one.
jest.mock("@/lib/auth-provider", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth-provider")>("@/lib/auth-provider");
  return {
    ...actual,
    useAuth: () => (mockUseRealAuth ? actual.useAuth() : mockAuth),
  };
});

/** True in the provider tests, which render the real AuthProvider. */
let mockUseRealAuth = false;

/** A session from opening a reset link. */
const SESSION = { user: { id: "user-1", email: "a@b.co" } } as unknown as Session;

/**
 * A resolved auth result for mocked actions.
 * @param result The result
 * @returns A jest mock resolving to it
 */
function resolves(result: AuthResult) {
  return jest.fn(async () => result);
}

describe("Forgot password on the sign-in screen (US 4.10)", () => {
  beforeEach(() => {
    mockUseRealAuth = false;
    mockAuth = {
      signInWithEmail: resolves({ success: true, session: null }),
      signUpWithEmail: resolves({ success: true, session: null }),
      signInWithGoogle: resolves({ success: true, session: null }),
      signInWithApple: resolves({ success: true, session: null }),
      requestPasswordReset: resolves({
        success: true,
        session: null,
        message: RESET_EMAIL_SENT_MESSAGE,
      }),
    };
  });

  it("US-4.10-T-1: AC1 Forgot password keeps the email, sends the reset link, and Back returns to sign-in", async () => {
    const screen = await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "a@b.co");

    await fireEvent.press(screen.getByText("Forgot password?"));
    expect(screen.getByText("Reset your password")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email").props.value).toBe("a@b.co");
    // Only the email is needed to reset.
    expect(screen.queryByPlaceholderText("Password")).toBeNull();
    expect(screen.queryByText("Continue with Google")).toBeNull();

    await fireEvent.press(screen.getByText("Send reset link"));
    await waitFor(() =>
      expect(mockAuth.requestPasswordReset as jest.Mock).toHaveBeenCalledWith("a@b.co")
    );
    expect(await screen.findByText(RESET_EMAIL_SENT_MESSAGE)).toBeTruthy();

    await fireEvent.press(screen.getByText("Back to sign in"));
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.queryByText(RESET_EMAIL_SENT_MESSAGE)).toBeNull();
  });

  it("US-4.10-T-1: AC2 a failed reset request shows the error", async () => {
    mockAuth.requestPasswordReset = resolves({
      success: false,
      error: "AUTH_ERROR",
      message: "Too many emails sent. Wait a few minutes and try again",
    });
    const screen = await render(<SignInScreen />);

    await fireEvent.press(screen.getByText("Forgot password?"));
    await fireEvent.press(screen.getByText("Send reset link"));

    expect(
      await screen.findByText("Too many emails sent. Wait a few minutes and try again")
    ).toBeTruthy();
  });

  it("US-4.10-T-1: AC1 Forgot password isn't offered while creating an account", async () => {
    const screen = await render(<SignInScreen />);
    await fireEvent.press(screen.getByText("New here? Create an account"));
    expect(screen.queryByText("Forgot password?")).toBeNull();
  });
});

describe("Choose a new password screen (US 4.10)", () => {
  beforeEach(() => {
    mockUseRealAuth = false;
    mockAuth = {
      session: SESSION,
      updatePassword: resolves({ success: true, session: null, message: "Password updated" }),
      cancelPasswordReset: resolves({ success: true, session: null }),
    };
  });

  it("US-4.10-T-1: AC5 saving sends both fields to updatePassword", async () => {
    const screen = await render(<ResetPasswordScreen />);
    expect(screen.getByText("Set a new password for a@b.co.")).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText("New password"), "secret123");
    await fireEvent.changeText(screen.getByPlaceholderText("Confirm new password"), "secret123");
    await fireEvent.press(screen.getByText("Save new password"));

    await waitFor(() =>
      expect(mockAuth.updatePassword as jest.Mock).toHaveBeenCalledWith("secret123", "secret123")
    );
  });

  it("US-4.10-T-1: AC4 a rejected password shows why and stays on the screen", async () => {
    mockAuth.updatePassword = resolves({
      success: false,
      error: "INVALID_PASSWORD",
      message: "Passwords don't match",
    });
    const screen = await render(<ResetPasswordScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText("New password"), "secret123");
    await fireEvent.changeText(screen.getByPlaceholderText("Confirm new password"), "secret124");
    await fireEvent.press(screen.getByText("Save new password"));

    expect(await screen.findByText("Passwords don't match")).toBeTruthy();
    expect(screen.getByText("Choose a new password")).toBeTruthy();
  });

  it("US-4.10-T-1: AC5 Cancel abandons the reset", async () => {
    const screen = await render(<ResetPasswordScreen />);
    await fireEvent.press(screen.getByText("Cancel"));
    await waitFor(() => expect(mockAuth.cancelPasswordReset as jest.Mock).toHaveBeenCalled());
  });
});

describe("AuthProvider during a password reset (US 4.10)", () => {
  /**
   * Shows which routes the root layout would open, from the real provider.
   * @returns JSX element
   */
  function GuardProbe(): JSX.Element {
    const { useAuth } = jest.requireActual<typeof import("@/lib/auth-provider")>(
      "@/lib/auth-provider"
    );
    const { session, isRecoveringPassword } = useAuth();
    const guards = authRouteGuards(isSignedIn(session), isRecoveringPassword);
    return <Text>{`app:${guards.app} signIn:${guards.signIn} reset:${guards.resetPassword}`}</Text>;
  }

  /**
   * Renders the real AuthProvider with a probe and a handle to its actions.
   * @returns The render queries and the provider's actions
   */
  async function renderProvider() {
    const actual = jest.requireActual<typeof import("@/lib/auth-provider")>("@/lib/auth-provider");
    let actions: ReturnType<typeof actual.useAuth> | null = null;
    /**
     * Captures the provider's value for the test.
     * @returns Nothing visible
     */
    function Capture(): null {
      actions = actual.useAuth();
      return null;
    }
    const screen = await render(
      <actual.AuthProvider>
        <GuardProbe />
        <Capture />
      </actual.AuthProvider>
    );
    return { screen, actions: () => actions as NonNullable<typeof actions> };
  }

  beforeEach(() => {
    mockUseRealAuth = true;
    mockListener = null;
    mockSupabaseCalls.length = 0;
  });

  it("US-4.10-T-1: AC3 opening a reset link shows only the new-password screen, and saving opens the app", async () => {
    const { screen, actions } = await renderProvider();
    await act(async () => mockListener?.("INITIAL_SESSION", null));
    expect(screen.getByText("app:false signIn:true reset:false")).toBeTruthy();

    // Exchanging the reset link's code fires PASSWORD_RECOVERY with a session.
    await act(async () => mockListener?.("PASSWORD_RECOVERY", SESSION));
    expect(screen.getByText("app:false signIn:false reset:true")).toBeTruthy();

    // A rejected password keeps the user on the reset screen.
    await act(async () => {
      await actions().updatePassword("secret123", "different");
    });
    expect(screen.getByText("app:false signIn:false reset:true")).toBeTruthy();

    await act(async () => {
      await actions().updatePassword("secret123", "secret123");
    });
    expect(mockSupabaseCalls).toContainEqual({ method: "updateUser", args: [{ password: "secret123" }] });
    expect(screen.getByText("app:true signIn:false reset:false")).toBeTruthy();
  });

  it("US-4.10-T-1: AC5 cancelling a reset signs out and returns to sign-in", async () => {
    const { screen, actions } = await renderProvider();
    await act(async () => mockListener?.("PASSWORD_RECOVERY", SESSION));
    expect(screen.getByText("app:false signIn:false reset:true")).toBeTruthy();

    await act(async () => {
      await actions().cancelPasswordReset();
    });
    expect(mockSupabaseCalls.map((c) => c.method)).toContain("signOut");
    expect(screen.getByText("app:false signIn:true reset:false")).toBeTruthy();
  });

  it("US-4.10-T-1: AC1 the provider sends the reset email to the app's sign-in deep link", async () => {
    const { actions } = await renderProvider();
    await act(async () => {
      await actions().requestPasswordReset(" a@b.co ");
    });
    expect(mockSupabaseCalls).toContainEqual({
      method: "resetPasswordForEmail",
      args: ["a@b.co", { redirectTo: "receipts://sign-in" }],
    });
  });
});
