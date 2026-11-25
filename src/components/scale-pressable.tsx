import type { JSX } from "react";
import {
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AnimatedPressable } from "@/components/animated";
import { selectHaptic, tapHaptic } from "@/lib/haptics";

/** Spring used for the press-in and release motion. */
const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far the control shrinks while held. */
  scaleTo?: number;
  /** Haptic fired on press: a light tap, a selection tick, or none. */
  haptic?: "tap" | "select" | "none";
};

/**
 * Drop-in Pressable that springs down slightly while held and gives haptic
 * feedback on press, so taps feel physical.
 * @param root0 Pressable props plus scale and haptic options
 * @param root0.style Static style for the control
 * @param root0.scaleTo Scale while pressed
 * @param root0.haptic Haptic to fire on press
 * @param root0.onPressIn Forwarded press-in handler
 * @param root0.onPressOut Forwarded press-out handler
 * @param root0.onPress Forwarded press handler
 * @returns JSX element
 */
export function ScalePressable({
  style,
  scaleTo = 0.97,
  haptic = "tap",
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Props): JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const handlePress = (event: GestureResponderEvent) => {
    if (haptic === "tap") tapHaptic();
    else if (haptic === "select") selectHaptic();
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        scale.set(withSpring(scaleTo, SPRING));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, SPRING));
        onPressOut?.(event);
      }}
      onPress={onPress ? handlePress : undefined}
      style={[style, animatedStyle]}
    />
  );
}
