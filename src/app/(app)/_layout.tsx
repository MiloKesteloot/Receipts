import { Tabs } from "expo-router";
import { JSX } from "react/jsx-runtime";

import { BottomTabBar } from "@/components/bottom-tab-bar";

/**
 * Signed-in layout: custom floating bottom navigation bubble aligned with the
 * app's cream-and-orange palette. The root layout only renders this group when
 * there is a session.
 * @returns JSX element
 */
export default function AppLayout(): JSX.Element {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="(home)" options={{ title: "Home" }} />
      <Tabs.Screen name="stats" options={{ title: "Stats" }} />
      <Tabs.Screen name="payments" options={{ title: "Payments" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
