import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { hide as hideSplash, preventAutoHideAsync } from "expo-splash-screen";
import { useEffect } from "react";
import { JSX } from "react/jsx-runtime";

import { isSignedIn } from "@/lib/auth";
import { AuthProvider, useAuth } from "@/lib/auth-provider";
import { USE_MOCK } from "@/lib/mock";
import { PALETTE as palette } from "@/lib/palette";

/** Light navigation theme aligned with the app's cream-and-orange palette. */
const APP_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.accent,
    background: palette.bg,
    card: palette.bg,
    text: palette.text,
    border: palette.border,
  },
};

// Keep the splash screen up until we know whether someone is signed in.
preventAutoHideAsync();

/**
 * Root layout: provides auth to every screen.
 * @returns JSX element
 */
export default function RootLayout(): JSX.Element {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

/**
 * Shows the app when signed in and the sign-in screen otherwise. Guards also
 * redirect away from any screen whose guard turns false (e.g. on sign-out).
 * Public screens outside of guards (like guest claiming) are accessible by anyone.
 * @returns JSX element
 */
function RootNavigator(): JSX.Element {
  const { session, isLoading } = useAuth();
  // When USE_MOCK is true, bypass authentication for demos and offline testing.
  // When USE_MOCK is false, enforce real sign-in via Supabase session.
  const signedIn = USE_MOCK ? true : isSignedIn(session);

  useEffect(() => {
    if (!isLoading) hideSplash();
  }, [isLoading]);

  return (
    <ThemeProvider value={APP_THEME}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>

        {/* Public route: guest claiming screen does not require authentication */}
        <Stack.Screen name="claim/[token]" />
      </Stack>
    </ThemeProvider>
  );
}
