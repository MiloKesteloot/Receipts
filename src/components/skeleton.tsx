import { type JSX, useEffect } from "react";
import { type DimensionValue, View } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AnimatedView } from "@/components/animated";
import { createThemedStyles, elevation } from "@/lib/theme";

type BlockProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
};

/**
 * One gently pulsing placeholder bar.
 * @param root0 Block props
 * @param root0.width Block width
 * @param root0.height Block height
 * @param root0.radius Corner radius
 * @returns JSX element
 */
export function SkeletonBlock({
  width = "100%",
  height,
  radius = 8,
}: BlockProps): JSX.Element {
  const styles = useStyles();
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <AnimatedView
      style={[styles.block, { width, height, borderRadius: radius }, animatedStyle]}
    />
  );
}

/**
 * Card-shaped skeleton matching a list row: tile, two text lines.
 * @returns JSX element
 */
export function SkeletonRow(): JSX.Element {
  const styles = useStyles();

  return (
    <View style={styles.row}>
      <SkeletonBlock width={48} height={48} radius={14} />
      <View style={styles.rowText}>
        <SkeletonBlock width="60%" height={16} />
        <SkeletonBlock width="40%" height={12} />
      </View>
    </View>
  );
}

/**
 * Full-screen loading layout: a title, a hero card, and a few rows.
 * @param root0 Props
 * @param root0.paddingTop Space above the title
 * @returns JSX element
 */
export function SkeletonScreen({
  paddingTop = 24,
}: {
  paddingTop?: number;
}): JSX.Element {
  const styles = useStyles();

  return (
    <View
      style={[styles.screen, { paddingTop }]}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      <SkeletonBlock width="55%" height={30} radius={10} />
      <SkeletonBlock height={120} radius={24} />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

/** Styles for skeleton placeholders. */
const useStyles = createThemedStyles((palette) => ({
  block: { backgroundColor: palette.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: palette.card,
    borderRadius: 20,
    ...elevation(palette),
  },
  rowText: { flex: 1, gap: 8 },
  screen: {
    flex: 1,
    gap: 14,
    paddingHorizontal: 20,
    backgroundColor: palette.bg,
  },
}));
