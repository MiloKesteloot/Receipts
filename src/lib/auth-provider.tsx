import type { Session } from "@supabase/supabase-js";
import { AppleAuthenticationScope, signInAsync } from "expo-apple-authentication";
import { createURL } from "expo-linking";
import { openAuthSessionAsync } from "expo-web-browser";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { JSX } from "react/jsx-runtime";

import * as auth from "./auth";
import { SUPABASE } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  // True until the stored session has been read on launch.
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<auth.AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<auth.AuthResult>;
  signInWithGoogle: () => Promise<auth.AuthResult>;
  signInWithApple: () => Promise<auth.AuthResult>;
  signOut: () => Promise<auth.AuthResult>;
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
 * Deep link OAuth providers and confirmation emails send users back to. Add it
 * to Supabase → Authentication → URL Configuration → Redirect URLs.
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
const ACTIONS: Omit<AuthContextValue, "session" | "isLoading"> = {
  signInWithEmail: (email, password) => auth.signInWithEmail(CLIENT, email, password),
  signUpWithEmail: (email, password) =>
    auth.signUpWithEmail(CLIENT, email, password, redirectUrl()),
  signInWithGoogle: () =>
    auth.signInWithOAuthProvider(CLIENT, "google", redirectUrl(), openAuthSession),
  // Native sheet on iOS; Apple's web sign-in on Android and web.
  signInWithApple: () =>
    Platform.OS === "ios"
      ? auth.signInWithAppleNative(CLIENT, requestAppleCredential)
      : auth.signInWithOAuthProvider(CLIENT, "apple", redirectUrl(), openAuthSession),
  signOut: () => auth.signOut(CLIENT),
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

  useEffect(
    () =>
      auth.watchSession(CLIENT, (next) => {
        setSession(next);
        setIsLoading(false);
      }),
    []
  );

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

  return (
    <AuthContext.Provider value={{ session, isLoading, ...ACTIONS }}>
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
