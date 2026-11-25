import { JSX, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AnimatedView, DIALOG_ENTERING } from "@/components/animated";
import { ConfirmCardView } from "@/components/confirm-card-modal";
import { CloseIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { MAX_GROUP_NAME_LENGTH, renameGroup } from "@/lib/groups";
import { createThemedStyles, useTheme } from "@/lib/theme";

export interface EditGroupModalProps {
  visible: boolean;
  groupId: string;
  groupName: string;
  userId?: string;
  deleting?: boolean;
  onClose: () => void;
  onRenamed: (newName: string, message: string) => void;
  onDelete: () => Promise<void>;
}

/**
 * Modal for editing a group's name or deleting the group.
 * Switches smoothly to an in-card confirmation view before deleting.
 * @param props Component props
 * @returns Rendered edit group modal
 */
export function EditGroupModal(props: EditGroupModalProps): JSX.Element {
  const palette = useTheme();
  const styles = useStyles();
  const {
    visible,
    groupId,
    groupName,
    deleting = false,
    onClose,
    onRenamed,
    onDelete,
  } = props;

  const [name, setName] = useState(groupName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"edit" | "confirmDelete">("edit");

  useEffect(() => {
    if (visible) {
      setName(groupName);
      setError(null);
      setSaving(false);
      setStep("edit");
    }
  }, [visible, groupName]);

  const busy = saving || deleting;

  /**
   * Handles modal close when no action is currently in flight.
   */
  function handleClose(): void {
    if (busy) return;
    onClose();
  }

  /**
   * Validates and saves the edited group name.
   */
  async function handleSave(): Promise<void> {
    if (busy) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a group name");
      return;
    }

    if (trimmed === groupName.trim()) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await renameGroup(groupId, trimmed);
      if (!result.success) {
        setError(result.message);
        return;
      }

      onRenamed(result.group_name, result.message);
      onClose();
    } catch {
      setError("Could not update group name right now");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.backdropTouch}
          onPress={handleClose}
          accessibilityLabel="Close edit group dialog"
        />

        {step === "confirmDelete" ? (
          <ConfirmCardView
            title="Delete Group"
            message={`Are you sure you want to delete ${groupName}? This will permanently delete the group and all receipts for all members.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            destructive
            busy={deleting}
            onCancel={() => {
              if (!deleting) setStep("edit");
            }}
            onConfirm={() => {
              void onDelete();
            }}
          />
        ) : (
          <AnimatedView entering={DIALOG_ENTERING} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Edit group</Text>
              <ScalePressable
                onPress={handleClose}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Close edit group modal"
                style={styles.closeButton}
              >
                <CloseIcon size={14} color={palette.muted} strokeWidth={2.4} />
              </ScalePressable>
            </View>

            <View style={styles.fieldHeader}>
              <Text style={styles.label}>Group name</Text>
              <Text style={styles.counter}>
                {Array.from(name.trim()).length}/{MAX_GROUP_NAME_LENGTH}
              </Text>
            </View>

            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (error) setError(null);
              }}
              placeholder="Group name"
              placeholderTextColor={palette.placeholder}
              maxLength={MAX_GROUP_NAME_LENGTH}
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={() => {
                void handleSave();
              }}
              accessibilityLabel="Group name"
              style={[styles.input, error ? styles.inputError : null]}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <ScalePressable
              onPress={() => {
                void handleSave();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
              accessibilityState={{ disabled: busy, busy: saving }}
              style={[styles.saveButton, busy && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color={palette.onAccent} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save changes</Text>
              )}
            </ScalePressable>

            <View style={styles.divider} />

            <ScalePressable
              onPress={() => setStep("confirmDelete")}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Delete Group"
              style={[styles.deleteButton, busy && styles.disabled]}
            >
              <Text style={styles.deleteButtonText}>Delete Group</Text>
            </ScalePressable>
          </AnimatedView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Stylesheet for the Edit group modal. */
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
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.muted,
  },
  counter: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.muted,
  },
  input: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: "600",
    color: palette.text,
  },
  inputError: {
    borderColor: palette.error,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.error,
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 14,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.onAccent,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 20,
  },
  deleteButton: {
    backgroundColor: palette.error,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  deleteButtonText: {
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
