import { useEffect, useState } from "react";
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
import { JSX } from "react/jsx-runtime";
import { joinGroup } from "../lib/groups";
import { Group } from "../lib/groups.types";
import { AnimatedView, DIALOG_ENTERING } from "@/components/animated";
import { CloseIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { createThemedStyles, useTheme } from "@/lib/theme";

export interface AddGroupModalProps {
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onSuccess?: (group: Group, status: "JOINED" | "ALREADY_MEMBER", message: string) => void;
  renderCreateSection?: () => React.ReactNode;
}

/**
 * Add Group modal overlay component.
 * @param root0 Component props
 * @param root0.visible Visibility flag
 * @param root0.onClose Callback when modal closes
 * @param root0.onSuccess Callback when group is joined
 * @param root0.renderCreateSection Custom renderer for group creation
 * @returns JSX element
 */
export function AddGroupModal({
  visible,
  onClose,
  onSuccess,
  renderCreateSection,
}: AddGroupModalProps): JSX.Element {
  const palette = useTheme();
  const styles = useStyles();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setCode("");
      setHasError(false);
      setInlineError(null);
    }
  }, [visible]);

  /**
   * Handles uppercase input changes.
   * @param text Input text
   */
  function handleCodeChange(text: string): void {
    setCode(text.toUpperCase());
    if (hasError) {
      setHasError(false);
      setInlineError(null);
    }
  }

  /**
   * Handles invite code submission.
   */
  async function handleJoin(): Promise<void> {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setHasError(true);
      setInlineError("Please enter an invite code");
      return;
    }

    setLoading(true);

    try {
      const result = await joinGroup(trimmed);

      if (result.success) {
        setHasError(false);
        setInlineError(null);
        setCode("");
        onClose();
        if (onSuccess) {
          onSuccess(result.group, result.status, result.message);
        }
      } else {
        setHasError(true);
        setInlineError(result.message);
      }
    } catch (err: unknown) {
      setHasError(true);
      const msg = err instanceof Error ? err.message : "Failed to join group. Please try again.";
      setInlineError(msg);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles closing the modal and clearing state.
   */
  function handleClose(): void {
    setCode("");
    setHasError(false);
    setInlineError(null);
    onClose();
  }

  return (
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

        <AnimatedView entering={DIALOG_ENTERING} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.title}>Add a group</Text>
            </View>
            <ScalePressable
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeButton}
            >
              <CloseIcon size={14} color={palette.muted} strokeWidth={2.4} />
            </ScalePressable>
          </View>

          {renderCreateSection ? (
            renderCreateSection()
          ) : (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionLabel}>Create a new group</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                placeholder="Group name"
                placeholderTextColor={palette.placeholder}
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
              placeholderTextColor={palette.placeholder}
              value={code}
              onChangeText={handleCodeChange}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              editable={!loading}
            />
            {hasError && inlineError ? (
              <Text style={styles.inlineErrorText}>{inlineError}</Text>
            ) : null}

            <ScalePressable
              style={[styles.joinButton, loading && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={palette.onAccent} size="small" />
              ) : (
                <Text style={styles.joinButtonText}>Join group</Text>
              )}
            </ScalePressable>
          </View>
        </AnimatedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Backward-compatible alias for AddGroupModal.
 */
export const JoinGroupModal = AddGroupModal;

/**
 * Modal stylesheet.
 */
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
  headerTextGroup: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: palette.text,
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: palette.surface,
    marginLeft: 8,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  sectionContainer: {
    width: "100%",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: palette.text,
    marginBottom: 12,
  },
  inputError: {
    borderColor: palette.error,
    backgroundColor: palette.errorSoft,
    marginBottom: 4,
  },
  inlineErrorText: {
    color: palette.error,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: -2,
  },

  disabledInput: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    color: palette.placeholder,
  },
  placeholderCreateButton: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderCreateButtonText: {
    color: palette.placeholder,
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
    backgroundColor: palette.border,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: palette.placeholder,
    fontWeight: "500",
  },
  joinButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  joinButtonPressed: {
    backgroundColor: palette.accent,
  },
  joinButtonText: {
    color: palette.onAccent,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
}));
