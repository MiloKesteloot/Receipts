import { useCallback, useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { JSX } from "react/jsx-runtime";

import { AnimatedView } from "@/components/animated";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { errorHaptic, successHaptic } from "@/lib/haptics";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

export type ToastType = "success" | "info" | "error";

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
}

/** Distance the toast travels as it slides in from above. */
const HIDDEN_OFFSET = -90;

/**
 * Floating toast that springs in from the top with a matching haptic.
 * @param root0 Toast props
 * @param root0.visible Visibility state
 * @param root0.message Message text
 * @param root0.type Toast variant
 * @param root0.duration Auto-dismiss duration
 * @param root0.onDismiss Callback when dismissed
 * @returns JSX element or null
 */
export function Toast({
  visible,
  message,
  type = "info",
  duration = 3500,
  onDismiss,
}: ToastProps): JSX.Element | null {
  const styles = useStyles();
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(HIDDEN_OFFSET);
  const opacity = useSharedValue(0);

  // Parents pass a fresh onDismiss each render; keep the latest in a ref so
  // re-renders don't restart the timer or repeat the haptic.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  const notifyDismissed = useCallback(() => onDismissRef.current(), []);

  const handleDismiss = useCallback(() => {
    opacity.set(withTiming(0, { duration: 180 }));
    translateY.set(
      withTiming(HIDDEN_OFFSET, { duration: 200 }, (finished) => {
        if (finished) scheduleOnRN(notifyDismissed);
      })
    );
  }, [opacity, translateY, notifyDismissed]);

  useEffect(() => {
    if (!visible) {
      translateY.set(HIDDEN_OFFSET);
      opacity.set(0);
      return;
    }

    if (type === "success") successHaptic();
    else if (type === "error") errorHaptic();

    translateY.set(withSpring(0, { damping: 16, stiffness: 220 }));
    opacity.set(withTiming(1, { duration: 180 }));

    const timer = setTimeout(handleDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, message, type, duration, handleDismiss, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }],
  }));

  if (!visible) {
    return null;
  }

  const accentColor =
    type === "success"
      ? palette.success
      : type === "error"
        ? palette.error
        : palette.accent;

  const topOffset = Math.max(insets.top, 16) + 8;

  return (
    <AnimatedView
      style={[styles.container, { top: topOffset }, animatedStyle]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[styles.badge, { backgroundColor: accentColor }]}>
        {type === "error" ? (
          <CloseIcon size={12} color={palette.onAccent} strokeWidth={3} />
        ) : type === "success" ? (
          <CheckIcon size={13} color={palette.onAccent} strokeWidth={3} />
        ) : (
          <Text style={styles.badgeText}>i</Text>
        )}
      </View>
      <Text style={styles.messageText} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        hitSlop={10}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissPressed]}
      >
        <CloseIcon size={14} color={palette.muted} strokeWidth={2.4} />
      </Pressable>
    </AnimatedView>
  );
}

/**
 * Toast styles definition.
 */
const useStyles = createThemedStyles((palette) => ({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 99999,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    backgroundColor: palette.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    ...elevation(palette, 2),
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: palette.onAccent,
    fontSize: 14,
    fontWeight: "800",
  },
  messageText: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  dismissPressed: {
    opacity: 0.6,
  },
}));
