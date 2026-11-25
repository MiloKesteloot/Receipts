import { JSX } from "react";
import { Text } from "react-native";

import { PlusIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { createThemedStyles, useTheme } from "@/lib/theme";

type Props = { onPress: () => void };

/**
 * "+ New group" pill button component.
 * @param root0 Component props
 * @param root0.onPress Press callback handler
 * @returns JSX element
 */
export function NewGroupButton({ onPress }: Props): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();

  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New group"
      style={styles.button}
    >
      <PlusIcon size={16} color={palette.onAccent} strokeWidth={2.6} />
      <Text style={styles.label}>New group</Text>
    </ScalePressable>
  );
}

/**
 * Stylesheet for NewGroupButton.
 */
const useStyles = createThemedStyles((palette) => ({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: palette.accent,
    borderRadius: 999,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  label: { fontSize: 14, fontWeight: "700", color: palette.onAccent },
}));
