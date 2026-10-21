import { Pressable, StyleSheet, Text } from "react-native";

import { palette } from "@/lib/palette";

type Props = { onPress: () => void };

// "+ New group" pill from the design. It only draws the button;
// what happens on tap is decided by the `onPress` the screen passes in.
export function NewGroupButton({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New group"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.plus}>+</Text>
      <Text style={styles.label}>New group</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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