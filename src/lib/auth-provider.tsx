import type { Session } from "@supabase/supabase-js";
import { AppleAuthenticationScope, signInAsync } from "expo-apple-authentication";
import { createURL, useLinkingURL } from "expo-linking";
import { openAuthSessionAsync } from "expo-web-browser";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { JSX } from "react/jsx-runtime";

import * as auth from "./auth";
import { unregisterThisDevice } from "./push-notifications";
import { SUPABASE, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  // True until the stored session has been read on launch.
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<auth.AuthResult>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<auth.AuthResult>;
  signInWithGoogle: () => Promise<auth.AuthResult>;
  signInWithApple: () => Promise<auth.AuthResult>;
  updateDisplayName: (displayName: string) => Promise<auth.AuthResult>;
  signOut: () => Promise<auth.AuthResult>;
  // Forgot password (US 4.10). True after a reset link is opened, until the
  // new password is saved or the reset is cancelled.
  isRecoveringPassword: boolean;
  requestPasswordReset: (email: string) => Promise<auth.AuthResult>;
  updatePassword: (password: string, confirmation: string) => Promise<auth.AuthResult>;
  cancelPasswordReset: () => Promise<auth.AuthResult>;
};

/**
 * Holds the session for every screen under AuthProvider.
 */
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Supabase auth, or null when `.env` has no keys.
 */
const CLIENT = SUPABASE?.auth ?? null;

/**
 * Deep link OAuth providers, confirmation emails and password reset emails
 * send users back to. Add it to Supabase → Authentication → URL
 * Configuration → Redirect URLs.
 * @returns e.g. `receipts://sign-in`, or `exp://…/--/sign-in` in Expo Go
 */
function redirectUrl(): string {
  return createURL("sign-in");
}

/**
 * Opens the system browser sheet for an OAuth provider.
 * @param url Provider sign-in page
 * @param returnUrl Deep link that closes the sheet
 * @returns How the browser session ended
 */
function openAuthSession(url: string, returnUrl: string): ReturnType<auth.OpenAuthSession> {
  return openAuthSessionAsync(url, returnUrl);
}

/**
 * Asks Supabase whether a provider is turned on, so a disabled one shows a
 * message instead of an error page in the browser.
 * @param provider "google" or "apple"
 * @returns True or false, or null when it can't tell (or `.env` has no keys)
 */
function checkProvider(provider: auth.OAuthProvider): Promise<boolean | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return Promise.resolve(null);
  return auth.fetchOAuthProviderEnabled(fetch, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, provider);
}

/**
 * The provider check, or undefined when `.env` has no Supabase keys.
 */
const providerCheck: auth.CheckOAuthProvider | undefined =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY ? checkProvider : undefined;

/**
 * Shows the native Sign in with Apple sheet.
 * @returns Apple's credential
 */
function requestAppleCredential(): ReturnType<auth.RequestAppleCredential> {
  return signInAsync({
    requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
  });
}

/**
 * The value AuthProvider shares; actions are bound to the real Supabase client.
 */
const ACTIONS: Omit<
  AuthContextValue,
  | "session"
  | "isLoading"
  | "updateDisplayName"
  | "isRecoveringPassword"
  | "updatePassword"
  | "cancelPasswordReset"
> = {
  requestPasswordReset: (email) => auth.requestPasswordReset(CLIENT, email, redirectUrl()),
  signInWithEmail: (email, password) => auth.signInWithEmail(CLIENT, email, password),
  signUpWithEmail: (email, password, displayName) =>
    auth.signUpWithEmail(CLIENT, email, password, redirectUrl(), displayName),
  signInWithGoogle: () =>
    auth.signInWithOAuthProvider(
      CLIENT,
      "google",
      redirectUrl(),
      openAuthSession,
      providerCheck
    ),
  // Native sheet on iOS; Apple's web sign-in on Android and web.
  signInWithApple: () =>
    Platform.OS === "ios"
      ? auth.signInWithAppleNative(CLIENT, requestAppleCredential)
      : auth.signInWithOAuthProvider(
          CLIENT,
          "apple",
          redirectUrl(),
          openAuthSession,
          providerCheck
        ),
  // Drop this phone's push token first, so the next account on it doesn't
  // get this one's Pay me pushes (US 3.5).
  signOut: async () => {
    await unregisterThisDevice();
    return auth.signOut(CLIENT);
  },
};

/**
 * Tracks the Supabase session and shares it, plus sign-in/out actions, with the app.
 * @param root0 Component props
 * @param root0.children Screens that need the session
 * @returns JSX element
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  useEffect(
    () =>
      auth.watchSession(CLIENT, (next, event) => {
        setSession(next);
        setIsLoading(false);
        // Opening a reset link signs the user in for the reset (US 4.10).
        if (auth.isPasswordRecovery(event)) setIsRecoveringPassword(true);
        if (!next) setIsRecoveringPassword(false);
      }),
    []
  );

  // A confirmation email link opens the app with `?code=`; trade it for a
  // session so the user lands signed in. If it fails (e.g. the link was opened
  // on another device), the email is still confirmed and they can sign in.
  const linkingUrl = useLinkingURL();
  useEffect(() => {
    if (linkingUrl && auth.parseAuthCallbackUrl(linkingUrl)?.kind === "code") {
      auth.completeOAuthRedirect(CLIENT, linkingUrl);
    }
  }, [linkingUrl]);

  // Only refresh tokens while the app is in the foreground (Supabase's RN advice).
  useEffect(() => {
    if (!CLIENT || Platform.OS === "web") return;
    const client = CLIENT;
    if (AppState.currentState === "active") client.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") client.startAutoRefresh();
      else client.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      client.stopAutoRefresh();
    };
  }, []);

  /**
   * Updates the signed-in user's display name and mirrors it into local session state.
   * @param displayName New display name
   * @returns Auth result from Supabase
   */
  async function updateDisplayName(displayName: string): Promise<auth.AuthResult> {
    const result = await auth.updateDisplayName(CLIENT, displayName);
    if (result.success) {
      const trimmed = displayName.trim();
      setSession((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Supabase user_metadata keys
                user_metadata: {
                  ...prev.user.user_metadata,
                  // eslint-disable-next-line @typescript-eslint/naming-convention -- Supabase user_metadata keys
                  full_name: trimmed,
                  name: trimmed,
                },
              },
            }
          : prev
      );
    }
    return result;
  }

  /**
   * Saves the new password from a reset link, then lets the app open.
   * @param password New password
   * @param confirmation The same password typed again
   * @returns Auth result from Supabase
   */
  async function updatePassword(
    password: string,
    confirmation: string
  ): Promise<auth.AuthResult> {
    const result = await auth.updatePassword(CLIENT, password, confirmation);
    if (result.success) setIsRecoveringPassword(false);
    return result;
  }

  /**
   * Abandons a password reset by signing out of the reset session.
   * @returns Auth result from signing out
   */
  async function cancelPasswordReset(): Promise<auth.AuthResult> {
    const result = await ACTIONS.signOut();
    setIsRecoveringPassword(false);
    return result;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        ...ACTIONS,
        updateDisplayName,
        isRecoveringPassword,
        updatePassword,
        cancelPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Reads the session and auth actions. Must be inside AuthProvider.
 * @returns Auth state and actions
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider />");
  return value;
}
