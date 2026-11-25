import { Stack } from "expo-router";
import { JSX } from "react/jsx-runtime";

import { FONTS, useTheme } from "@/lib/theme";

/**
 * Home tab stack: the group list plus group detail screens.
 * @returns JSX element
 */
export default function HomeLayout(): JSX.Element {
  const palette = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.accent,
        headerTitleStyle: { color: palette.text, fontFamily: FONTS.bold },
        headerBackTitleStyle: { fontFamily: FONTS.medium },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="groups/[id]"
        options={{ title: "Group", headerBackTitle: "Home" }}
      />
      <Stack.Screen
        name="scan-receipt"
        options={{ title: "Scan receipt", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="receipts/[id]"
        options={{ title: "Receipt", headerBackTitle: "Group" }}
      />
      <Stack.Screen
        name="remove-members/index"
        options={{ title: "Remove members", headerBackTitle: "Group" }}
      />
      <Stack.Screen
        name="remove-members/[groupId]"
        options={{ title: "Select members", headerBackTitle: "Groups" }}
      />
    </Stack>
  );
}
