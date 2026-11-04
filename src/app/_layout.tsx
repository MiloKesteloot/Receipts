import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { hide as hideSplash, preventAutoHideAsync } from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { JSX } from "react/jsx-runtime";

import { isSignedIn } from "@/lib/auth";
import { AuthProvider, useAuth } from "@/lib/auth-provider";

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
 * @returns JSX element
 */
function RootNavigator(): JSX.Element {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();
  const signedIn = isSignedIn(session);

  useEffect(() => {
    if (!isLoading) hideSplash();
  }, [isLoading]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
