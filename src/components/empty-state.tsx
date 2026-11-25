import type { JSX } from "react";
import { Text, View } from "react-native";

import type { IconProps } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { createThemedStyles, useTheme } from "@/lib/theme";

type Props = {
  icon: (props: IconProps) => JSX.Element;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Friendly empty state: an icon in a soft accent circle, a short message,
 * and an optional call to action.
 * @param props Icon, copy, and optional call to action
 * @returns JSX element
 */
export function EmptyState(props: Props): JSX.Element {
  const { title, message, actionLabel, onAction } = props;
  const styles = useStyles();
  const palette = useTheme();

  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <props.icon size={28} color={palette.accent} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <ScalePressable
          onPress={onAction}
          accessibilityRole="button"
          style={styles.button}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </ScalePressable>
      ) : null}
    </View>
  );
}

/** Styles for the empty state card. */
const useStyles = createThemedStyles((palette) => ({
  card: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentSoft,
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.text,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
    textAlign: "center",
  },
  button: {
    marginTop: 10,
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  buttonText: { color: palette.onAccent, fontSize: 15, fontWeight: "700" },
}));
