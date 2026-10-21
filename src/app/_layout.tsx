import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";
import { JSX } from "react/jsx-runtime";

/**
 * TODO Write description
 * @returns JSX element
 */
export default function RootLayout(): JSX.Element {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {/* The system tab bar: Liquid Glass on iOS 26+, Material on Android (max 5 tabs). */}
      <NativeTabs minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
            md="home"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="stats">
          <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
            md="bar_chart"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="payments">
          <NativeTabs.Trigger.Label>Payments</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "creditcard", selected: "creditcard.fill" }}
            md="credit_card"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "gearshape", selected: "gearshape.fill" }}
            md="settings"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="account">
          <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{
              default: "person.crop.circle",
              selected: "person.crop.circle.fill",
            }}
            md="account_circle"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
