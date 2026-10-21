import React, { useEffect, useState } from "react";
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
import { joinGroup } from "../lib/groups";
import { Group } from "../lib/groups.types";
import { Toast, ToastType } from "./toast";

export interface AddGroupModalProps {
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onSuccess?: (group: Group, status: "JOINED" | "ALREADY_MEMBER", message: string) => void;
  // [TEAMMATE EDIT AREA]: Optional custom renderer for US 1.2 group creation. Can be removed once implemented.
  renderCreateSection?: () => React.ReactNode;
}

export function AddGroupModal({
  visible,
  userId = "current-user",
  onClose,
  onSuccess,
  renderCreateSection,
}: AddGroupModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");

  useEffect(() => {
    if (!visible) {
      setCode("");
      setHasError(false);
      setToastVisible(false);
      setToastMessage("");
    }
  }, [visible]);

  function triggerToast(message: string, type: ToastType) {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }

  function handleCodeChange(text: string) {
    setCode(text.toUpperCase());
    if (hasError) {
      setHasError(false);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setHasError(true);
      triggerToast("Please enter an invite code", "error");
      return;
    }

    setLoading(true);

    try {
      const result = await joinGroup(trimmed, userId);

      if (result.success) {
        setHasError(false);
        setCode("");
        setToastVisible(false);
        setToastMessage("");
        onClose();
        if (onSuccess) {
          onSuccess(result.group, result.status, result.message);
        }
      } else {
        setHasError(true);
        triggerToast(result.message, "error");
      }
    } catch (err: any) {
      setHasError(true);
      const msg = err?.message || "Failed to join group. Please try again.";
      triggerToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setCode("");
    setHasError(false);
    setToastVisible(false);
    setToastMessage("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropTouch} onPress={handleClose} />

        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.title}>Add a group</Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {/* [TEAMMATE EDIT AREA]: Group creation (US 1.2) - replace or wire up createGroup logic here. This comment can be removed once implemented. */}
          {renderCreateSection ? (
            renderCreateSection()
          ) : (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionLabel}>Create a new group</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                placeholder="Group name"
                placeholderTextColor="#9CA3AF"
                editable={false}
              />
              <View style={styles.placeholderCreateButton}>
                <Text style={styles.placeholderCreateButtonText}>
                  Create group
                </Text>
              </View>
            </View>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={styles.sectionLabel}>Join an existing group</Text>
            <TextInput
              style={[
                styles.input,
                hasError && styles.inputError,
              ]}
              placeholder="Enter 8-character invite code"
              placeholderTextColor="#9CA3AF"
              value={code}
              onChangeText={handleCodeChange}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              editable={!loading}
            />

            <Pressable
              style={({ pressed }) => [
                styles.joinButton,
                pressed && styles.joinButtonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.joinButtonText}>Join group</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const JoinGroupModal = AddGroupModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
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
  headerTextGroup: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    marginLeft: 8,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  closeIcon: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "700",
    textAlign: "center",
    width: 16,
    height: 16,
    lineHeight: 16,
  },
  sectionContainer: {
    width: "100%",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  disabledInput: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    color: "#9CA3AF",
  },
  placeholderCreateButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderCreateButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  joinButton: {
    backgroundColor: "#4F8A5B",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F8A5B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  joinButtonPressed: {
    backgroundColor: "#42774C",
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
