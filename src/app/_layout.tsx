import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { hide as hideSplash, preventAutoHideAsync } from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { JSX } from "react/jsx-runtime";

import { isSignedIn } from "@/lib/auth";
import { AuthProvider, useAuth } from "@/lib/auth-provider";
import { FONTS, useIsDark, useTheme } from "@/lib/theme";

// Keep the splash screen up until fonts load and we know whether someone is signed in.
preventAutoHideAsync();

/**
 * Root layout: loads the app typeface and provides auth to every screen.
 * @returns JSX element
 */
export default function RootLayout(): JSX.Element {
  const [fontsLoaded, fontError] = useFonts({
    [FONTS.regular]: PlusJakartaSans_400Regular,
    [FONTS.medium]: PlusJakartaSans_500Medium,
    [FONTS.semibold]: PlusJakartaSans_600SemiBold,
    [FONTS.bold]: PlusJakartaSans_700Bold,
    [FONTS.extrabold]: PlusJakartaSans_800ExtraBold,
  });

  return (
    <AuthProvider>
      <RootNavigator fontsReady={fontsLoaded || Boolean(fontError)} />
    </AuthProvider>
  );
}

/**
 * Shows the app when signed in and the sign-in screen otherwise. Guards also
 * redirect away from any screen whose guard turns false (e.g. on sign-out).
 * Public screens outside of guards (like guest claiming) are accessible by anyone.
 * @param root0 Navigator props
 * @param root0.fontsReady Whether the typeface has loaded (or failed to)
 * @returns JSX element
 */
function RootNavigator({ fontsReady }: { fontsReady: boolean }): JSX.Element {
  const { session, isLoading } = useAuth();
  const signedIn = isSignedIn(session);
  const palette = useTheme();
  const isDark = useIsDark();

  // Navigation theme aligned with the app palette, light or dark.
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.accent,
        background: palette.bg,
        card: palette.bg,
        text: palette.text,
        border: palette.border,
      },
    };
  }, [isDark, palette]);

  useEffect(() => {
    if (!isLoading && fontsReady) hideSplash();
  }, [isLoading, fontsReady]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
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
