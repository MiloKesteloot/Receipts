/**
 * Floating bottom navigation bubble. The active tab sits inside a warm orange
 * circle that springs between tabs; on iOS 26+ the bubble is Liquid Glass.
 */

import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { ComponentProps, JSX, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Tabs } from "expo-router";
import { type LayoutChangeEvent, Platform, Pressable, Text, View } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AnimatedView } from "@/components/animated";
import {
  CreditCardIcon,
  GearIcon,
  HouseIcon,
  LineGraphIcon,
  PersonIcon,
  type IconProps,
} from "@/components/icons";
import { selectHaptic } from "@/lib/haptics";
import { createThemedStyles, elevation, useIsDark, useTheme } from "@/lib/theme";

/** Bottom clearance (dp) scrollable tab screens should reserve above the bubble. */
export const BOTTOM_TAB_CLEARANCE = 144;

/** Pixel size of the active tab circle behind each navigation icon. */
const ACTIVE_CIRCLE_SIZE = 38;

/** Horizontal padding inside the bubble. */
const BUBBLE_PADDING_X = 8;

/** Vertical padding inside the bubble. */
const BUBBLE_PADDING_Y = 8;

/** Spring for the sliding active indicator. */
const INDICATOR_SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

/** Whether this device can draw Liquid Glass (iOS 26+). */
const GLASS_AVAILABLE =
  Platform.OS === "ios" &&
  (() => {
    try {
      return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
    } catch {
      return false;
    }
  })();

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
 * Bubble background: Liquid Glass where available, a solid card elsewhere.
 * @param root0 Props
 * @param root0.children Tab buttons
 * @param root0.onLayout Reports the bubble's size
 * @returns JSX element
 */
function Bubble({
  children,
  onLayout,
}: {
  children: ReactNode;
  onLayout: (event: LayoutChangeEvent) => void;
}): JSX.Element {
  const styles = useStyles();
  const isDark = useIsDark();

  if (GLASS_AVAILABLE) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDark ? "dark" : "light"}
        style={[styles.bubble, styles.bubbleGlass]}
        onLayout={onLayout}
        accessibilityRole="tablist"
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[styles.bubble, styles.bubbleSolid]}
      onLayout={onLayout}
      accessibilityRole="tablist"
    >
      {children}
    </View>
  );
}

/**
 * Custom floating bottom navigation bubble for app tabs.
 * @param props Expo Router tab bar state, descriptors, emitter, and navigation helper
 * @returns Floating bottom navigation bubble JSX element
 */
export function BottomTabBar(props: CustomTabBarProps): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const { state, descriptors, emitter, navigateToTab, insets } = props;

  const visibleRoutes = state.routes.filter((route) => TAB_ITEMS[route.name]);
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === activeKey)
  );

  const [bubbleWidth, setBubbleWidth] = useState(0);
  const tabWidth =
    bubbleWidth > 0
      ? (bubbleWidth - BUBBLE_PADDING_X * 2) / visibleRoutes.length
      : 0;
  const targetX =
    BUBBLE_PADDING_X + activeIndex * tabWidth + (tabWidth - ACTIVE_CIRCLE_SIZE) / 2;

  const indicatorX = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (tabWidth <= 0) return;
    if (!placed) {
      // First layout: jump into place without animating from the edge.
      indicatorX.set(targetX);
      setPlaced(true);
    } else {
      indicatorX.set(withSpring(targetX, INDICATOR_SPRING));
    }
  }, [targetX, tabWidth, placed, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <Bubble onLayout={(event) => setBubbleWidth(event.nativeEvent.layout.width)}>
        {placed ? (
          <AnimatedView
            pointerEvents="none"
            style={[styles.indicator, indicatorStyle]}
          />
        ) : null}

        {visibleRoutes.map((route, index) => {
          const item = TAB_ITEMS[route.name];
          const descriptor = descriptors[route.key];
          const options = descriptor?.options;
          const label =
            typeof options?.title === "string" ? options.title : item.label;
          const isFocused = index === activeIndex;
          const iconColor = isFocused ? palette.onAccent : palette.muted;

          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              selectHaptic();
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
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              <View style={styles.iconCircle}>
                {/* Static circle until the sliding indicator has measured. */}
                {isFocused && !placed ? <View style={styles.staticCircle} /> : null}
                <item.icon size={20} color={iconColor} strokeWidth={2} />
              </View>
              <Text
                style={[styles.label, isFocused && styles.labelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </Bubble>
    </View>
  );
}

/** Stylesheet for the floating bottom navigation bubble. */
const useStyles = createThemedStyles((palette) => ({
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
    borderRadius: 32,
    paddingHorizontal: BUBBLE_PADDING_X,
    paddingVertical: BUBBLE_PADDING_Y,
  },
  bubbleGlass: {
    overflow: "hidden",
  },
  bubbleSolid: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    ...elevation(palette, 2),
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: BUBBLE_PADDING_Y + 2,
    width: ACTIVE_CIRCLE_SIZE,
    height: ACTIVE_CIRCLE_SIZE,
    borderRadius: ACTIVE_CIRCLE_SIZE / 2,
    backgroundColor: palette.accent,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  staticCircle: {
    position: "absolute",
    width: ACTIVE_CIRCLE_SIZE,
    height: ACTIVE_CIRCLE_SIZE,
    borderRadius: ACTIVE_CIRCLE_SIZE / 2,
    backgroundColor: palette.accent,
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
    alignItems: "center",
    justifyContent: "center",
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
}));
