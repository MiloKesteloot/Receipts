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

import { ConfirmCardView } from "@/components/confirm-card-modal";
import { MAX_GROUP_NAME_LENGTH, renameGroup } from "@/lib/groups";
import { PALETTE } from "@/lib/palette";

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
        style={STYLES.backdrop}
      >
        <Pressable
          style={STYLES.backdropTouch}
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
          <View style={STYLES.card}>
            <View style={STYLES.header}>
              <Text style={STYLES.title}>Edit group</Text>
              <Pressable
                onPress={handleClose}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Close edit group modal"
                style={({ pressed }) => [
                  STYLES.closeButton,
                  pressed && !busy && STYLES.pressed,
                ]}
              >
                <Text style={STYLES.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={STYLES.fieldHeader}>
              <Text style={STYLES.label}>Group name</Text>
              <Text style={STYLES.counter}>
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
              placeholderTextColor={PALETTE.muted}
              maxLength={MAX_GROUP_NAME_LENGTH}
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={() => {
                void handleSave();
              }}
              accessibilityLabel="Group name"
              style={[STYLES.input, error ? STYLES.inputError : null]}
            />

            {error ? <Text style={STYLES.errorText}>{error}</Text> : null}

            <Pressable
              onPress={() => {
                void handleSave();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
              accessibilityState={{ disabled: busy, busy: saving }}
              style={({ pressed }) => [
                STYLES.saveButton,
                pressed && !busy && STYLES.pressed,
                busy && STYLES.disabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={STYLES.saveButtonText}>Save changes</Text>
              )}
            </Pressable>

            <View style={STYLES.divider} />

            <Pressable
              onPress={() => setStep("confirmDelete")}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Delete Group"
              style={({ pressed }) => [
                STYLES.deleteButton,
                pressed && !busy && STYLES.pressed,
                busy && STYLES.disabled,
              ]}
            >
              <Text style={STYLES.deleteButtonText}>Delete Group</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Stylesheet for the Edit group modal. */
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
    color: PALETTE.text,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PALETTE.bg,
    borderWidth: 1,
    borderColor: PALETTE.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: "700",
    color: PALETTE.muted,
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
    color: PALETTE.muted,
  },
  counter: {
    fontSize: 12,
    fontWeight: "600",
    color: PALETTE.muted,
  },
  input: {
    backgroundColor: PALETTE.bg,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: "600",
    color: PALETTE.text,
  },
  inputError: {
    borderColor: PALETTE.error,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: PALETTE.error,
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: PALETTE.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 14,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border,
    marginVertical: 20,
  },
  deleteButton: {
    backgroundColor: PALETTE.error,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  deleteButtonText: {
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
