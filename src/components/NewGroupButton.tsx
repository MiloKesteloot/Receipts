import { JSX } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { palette } from "@/lib/palette";

type Props = { onPress: () => void };

/**
 * "+ New group" pill button component.
 * @param root0 Component props
 * @param root0.onPress Press callback handler
 * @returns JSX element
 */
export function NewGroupButton({ onPress }: Props): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New group"
      style={({ pressed }) => [STYLES.button, pressed && STYLES.pressed]}
    >
      <Text style={STYLES.plus}>+</Text>
      <Text style={STYLES.label}>New group</Text>
    </Pressable>
  );
}

/**
 * Stylesheet for NewGroupButton.
 */
const STYLES = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
  },
  pressed: { opacity: 0.7 },
  plus: { fontSize: 20, lineHeight: 20, color: palette.text },
  label: { fontSize: 14, fontWeight: "700", color: palette.text },
});