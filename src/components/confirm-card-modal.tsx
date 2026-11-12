import { JSX } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PALETTE } from "@/lib/palette";

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

  return (
    <View style={STYLES.card}>
      <Text style={STYLES.title}>{title}</Text>
      <Text style={STYLES.message}>{message}</Text>

      <View style={STYLES.actionsRow}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={({ pressed }) => [
            STYLES.button,
            STYLES.cancelButton,
            pressed && !busy && STYLES.pressed,
            busy && STYLES.disabled,
          ]}
        >
          <Text style={STYLES.cancelText}>{cancelLabel}</Text>
        </Pressable>

        <Pressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [
            STYLES.button,
            destructive ? STYLES.destructiveButton : STYLES.primaryButton,
            pressed && !busy && STYLES.pressed,
            busy && STYLES.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={STYLES.confirmText}>{confirmLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Card-style modal confirmation prompt replacing OS-native alerts.
 * @param props Component props
 * @returns Rendered confirmation modal
 */
export function ConfirmCardModal(props: ConfirmCardModalProps): JSX.Element {
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
      <View style={STYLES.backdrop}>
        <Pressable
          style={STYLES.backdropTouch}
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
const STYLES = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 42, 36, 0.45)",
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
    backgroundColor: PALETTE.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: PALETTE.border,
    shadowColor: "#000000",
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
    color: PALETTE.text,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: PALETTE.muted,
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
    backgroundColor: PALETTE.bg,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  primaryButton: {
    backgroundColor: PALETTE.accent,
  },
  destructiveButton: {
    backgroundColor: PALETTE.error,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: PALETTE.text,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.65,
  },
});
