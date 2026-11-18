import { Tabs } from "expo-router";
import { JSX } from "react/jsx-runtime";

import { BottomTabBar } from "@/components/bottom-tab-bar";
import { useAuth } from "@/lib/auth-provider";
import { usePushNotifications } from "@/lib/push-notifications";

/**
 * Signed-in layout: custom floating bottom navigation bubble aligned with the
 * app's cream-and-orange palette. The root layout only renders this group when
 * there is a session. Also registers for Pay me pushes and opens the receipt
 * when one is tapped (US 3.5).
 * @returns JSX element
 */
export default function AppLayout(): JSX.Element {
  const { session } = useAuth();
  usePushNotifications(session?.user.id);

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
