import React, { useState } from "react";
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

export interface JoinGroupModalProps {
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onSuccess?: (group: Group) => void;
}

export function JoinGroupModal({
  visible,
  userId = "current-user",
  onClose,
  onSuccess,
}: JoinGroupModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");

  function triggerToast(message: string, type: ToastType) {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }

  function handleTextChange(text: string) {
    setCode(text);
    if (inlineError) {
      setInlineError(null);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim();
    if (!trimmed) {
      setInlineError("Please enter an invite code");
      triggerToast("Please enter an invite code", "error");
      return;
    }

    setLoading(true);
    setInlineError(null);

    try {
      const result = await joinGroup(trimmed, userId);

      if (result.success) {
        if (result.status === "JOINED") {
          triggerToast(result.message, "success");
        } else if (result.status === "ALREADY_MEMBER") {
          triggerToast(result.message, "info");
        }

        // Reset input and close modal after brief delay or immediately
        setCode("");
        onClose();
        if (onSuccess) {
          onSuccess(result.group);
        }
      } else {
        setInlineError(result.message);
        triggerToast(result.message, "error");
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to join group. Please try again.";
      setInlineError(msg);
      triggerToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setCode("");
    setInlineError(null);
    onClose();
  }

  return (
    <>
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <Pressable style={styles.backdropTouch} onPress={handleClose} />

          <View style={styles.modalCard}>
            <Text style={styles.title}>Join a Group</Text>
            <Text style={styles.subtitle}>
              {"Enter your roommate's invite code to join their group."}
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  inlineError ? styles.inputError : undefined,
                ]}
                placeholder="e.g. APT402"
                placeholderTextColor="#9CA3AF"
                value={code}
                onChangeText={handleTextChange}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                editable={!loading}
                autoFocus
              />
            </View>

            {inlineError && (
              <Text style={styles.errorText}>{inlineError}</Text>
            )}

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={handleClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.submitButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleJoin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Join</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

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
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: 1.5,
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 12,
    marginLeft: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    color: "#4B5563",
    fontSize: 15,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#2563EB",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
