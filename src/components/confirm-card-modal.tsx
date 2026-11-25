import { JSX, useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AnimatedView, DIALOG_ENTERING } from "@/components/animated";
import { ScalePressable } from "@/components/scale-pressable";
import { warningHaptic } from "@/lib/haptics";
import { createThemedStyles, useTheme } from "@/lib/theme";


export interface ConfirmCardViewProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export interface ConfirmCardModalProps extends ConfirmCardViewProps {
  visible: boolean;
}

/**
 * Reusable confirmation card styled to match the app palette.
 * @param props Component props
 * @returns Rendered confirmation card
 */
export function ConfirmCardView(props: ConfirmCardViewProps): JSX.Element {
  const palette = useTheme();
  const styles = useStyles();
  const {
    title,
    message,
    confirmLabel,
    cancelLabel = "Cancel",
    destructive = true,
    busy = false,
    onCancel,
    onConfirm,
  } = props;

  // A warning buzz when a destructive confirmation appears.
  useEffect(() => {
    if (destructive) warningHaptic();
  }, [destructive]);

  return (
    <AnimatedView entering={DIALOG_ENTERING} style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.actionsRow}>
        <ScalePressable
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={[styles.button, styles.cancelButton, busy && styles.disabled]}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </ScalePressable>

        <ScalePressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy, busy }}
          style={[styles.button, destructive ? styles.destructiveButton : styles.primaryButton, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={palette.onAccent} size="small" />
          ) : (
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          )}
        </ScalePressable>
      </View>
    </AnimatedView>
  );
}

/**
 * Card-style modal confirmation prompt replacing OS-native alerts.
 * @param props Component props
 * @returns Rendered confirmation modal
 */
export function ConfirmCardModal(props: ConfirmCardModalProps): JSX.Element {
  const styles = useStyles();
  const {
    visible,
    title,
    message,
    confirmLabel,
    cancelLabel,
    destructive,
    busy = false,
    onCancel,
    onConfirm,
  } = props;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={busy ? undefined : onCancel}
          accessibilityLabel="Dismiss confirmation dialog"
        />
        <ConfirmCardView
          title={title}
          message={message}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          destructive={destructive}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </View>
    </Modal>
  );
}

/** Stylesheet for confirmation card and modal overlay. */
const useStyles = createThemedStyles((palette) => ({
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdropTouch: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: palette.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.text,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.muted,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  primaryButton: {
    backgroundColor: palette.accent,
  },
  destructiveButton: {
    backgroundColor: palette.error,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.text,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.onAccent,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.65,
  },
}));
