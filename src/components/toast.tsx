import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "info" | "error";

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({
  visible,
  message,
  type = "info",
  duration = 3500,
  onDismiss,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(-70));
  const [opacity] = useState(() => new Animated.Value(0));

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -70,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [opacity, translateY, onDismiss]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      translateY.setValue(-70);
      opacity.setValue(0);
    }
  }, [visible, message, duration, handleDismiss, opacity, translateY]);

  if (!visible) {
    return null;
  }

  const accentColor =
    type === "success"
      ? "#81C784"
      : type === "error"
        ? "#F28B82"
        : "#8AB4F8";

  const topOffset = Math.max(insets.top, 14) + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[styles.indicatorBar, { backgroundColor: accentColor }]} />
      <View style={styles.contentRow}>
        <View style={styles.textContainer}>
          <Text style={styles.messageText} numberOfLines={2}>
            {message}
          </Text>
        </View>

        <Pressable
          hitSlop={8}
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.dismissButton,
            pressed && styles.dismissPressed,
          ]}
        >
          <Text style={[styles.dismissText, { color: accentColor }]}>Dismiss</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 99999,
    backgroundColor: "#313033",
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
    alignItems: "stretch",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  indicatorBar: {
    width: 5,
  },
  contentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textContainer: {
    flex: 1,
    paddingRight: 12,
  },
  messageText: {
    color: "#F4EFF4",
    fontSize: 14,
    fontWeight: "400",
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  dismissButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  dismissPressed: {
    opacity: 0.6,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
