/**
 * Floating bottom navigation bubble matching the cream-and-orange app palette,
 * highlighting the active tab inside a warm orange circle with a label below.
 */

import type { ComponentProps, JSX } from "react";
import type { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Circle, Svg } from "react-native-svg";

import {
  CreditCardIcon,
  GearIcon,
  HouseIcon,
  LineGraphIcon,
  PersonIcon,
  type IconProps,
} from "@/components/icons";
import { PALETTE as palette } from "@/lib/palette";

/** Bottom clearance (dp) scrollable tab screens should reserve above the bubble. */
export const BOTTOM_TAB_CLEARANCE = 144;

/** Pixel size of the active tab circle behind each navigation icon. */
const ACTIVE_CIRCLE_SIZE = 38;

/** Props supplied by Expo Router `<Tabs tabBar={...}>`. */
type CustomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/** Icon component type keyed by tab route name. */
type TabIconComponent = (props: IconProps) => JSX.Element;

/** Tab metadata mapping each `(app)` route name to its label and vector icon. */
const TAB_ITEMS: Record<string, { label: string; icon: TabIconComponent }> = {
  "(home)": { label: "Home", icon: HouseIcon },
  stats: { label: "Stats", icon: LineGraphIcon },
  payments: { label: "Payments", icon: CreditCardIcon },
  settings: { label: "Settings", icon: GearIcon },
  account: { label: "Account", icon: PersonIcon },
};

/**
 * Custom floating bottom navigation bubble for app tabs.
 * @param props Expo Router tab bar state, descriptors, emitter, and navigation helper
 * @returns Floating bottom navigation bubble JSX element
 */
export function BottomTabBar(props: CustomTabBarProps): JSX.Element {
  const { state, descriptors, emitter, navigateToTab, insets } = props;

  return (
    <View
      pointerEvents="box-none"
      style={[STYLES.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={STYLES.bubble} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS[route.name];
          if (!item) return null;

          const descriptor = descriptors[route.key];
          const options = descriptor?.options;
          const label =
            typeof options?.title === "string" ? options.title : item.label;
          const isFocused = state.index === index;
          const iconColor = isFocused ? "#FFFFFF" : palette.muted;

          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
              testID={options?.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                STYLES.tab,
                pressed && STYLES.tabPressed,
              ]}
            >
              <View style={STYLES.iconCircle}>
                {isFocused ? (
                  <Svg
                    width={ACTIVE_CIRCLE_SIZE}
                    height={ACTIVE_CIRCLE_SIZE}
                    viewBox={`0 0 ${ACTIVE_CIRCLE_SIZE} ${ACTIVE_CIRCLE_SIZE}`}
                    style={STYLES.activeCircleBg}
                  >
                    <Circle
                      cx={ACTIVE_CIRCLE_SIZE / 2}
                      cy={ACTIVE_CIRCLE_SIZE / 2}
                      r={ACTIVE_CIRCLE_SIZE / 2}
                      fill={palette.accent}
                    />
                  </Svg>
                ) : null}
                <item.icon size={20} color={iconColor} strokeWidth={2} />
              </View>
              <Text
                style={[STYLES.label, isFocused && STYLES.labelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Stylesheet for the floating bottom navigation bubble. */
const STYLES = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 520,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 2,
  },
  tabPressed: {
    opacity: 0.75,
  },
  iconCircle: {
    width: ACTIVE_CIRCLE_SIZE,
    height: ACTIVE_CIRCLE_SIZE,
    borderRadius: ACTIVE_CIRCLE_SIZE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  activeCircleBg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: palette.muted,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: palette.accent,
    fontWeight: "700",
  },
});
