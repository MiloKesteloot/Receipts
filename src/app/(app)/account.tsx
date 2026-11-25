import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { ScalePressable } from "@/components/scale-pressable";
import { Toast, ToastType } from "@/components/toast";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/auth";
import { useAuth } from "@/lib/auth-provider";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

/**
 * The accounts screen: view profile, edit display name, and sign out.
 * @returns JSX element
 */
export default function AccountScreen(): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const { session, signOut, updateDisplayName } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user;
  const currentName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const provider = user?.app_metadata?.provider;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(
    null
  );

  /**
   * Opens the inline display-name editor prefilled with the current name.
   */
  function handleStartEditName(): void {
    setNameDraft(currentName);
    setNameError(null);
    setEditingName(true);
  }

  /**
   * Cancels inline display-name editing without saving.
   */
  function handleCancelEditName(): void {
    if (savingName) return;
    setEditingName(false);
    setNameError(null);
    setNameDraft(currentName);
  }

  /**
   * Validates and saves the updated display name.
   */
  async function handleSaveName(): Promise<void> {
    if (savingName) return;

    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Please enter a display name");
      return;
    }

    if (trimmed === currentName.trim()) {
      setEditingName(false);
      setNameError(null);
      return;
    }

    setSavingName(true);
    setNameError(null);

    try {
      const result = await updateDisplayName(trimmed);
      if (!result.success) {
        setNameError(result.message);
        return;
      }

      setEditingName(false);
      setToast({
        message: result.message ?? `Display name updated to ${trimmed}`,
        type: "success",
      });
    } catch {
      setNameError("Could not update display name right now");
    } finally {
      setSavingName(false);
    }
  }

  /**
   * Signs out; the root layout then shows the sign-in screen.
   */
  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    setError(null);
    const result = await signOut();
    if (!result.success) {
      setError(result.message);
      setSigningOut(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Account</Text>

        <View style={styles.card}>
          <View style={styles.nameRow}>
            <View style={styles.nameInfo}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <Text
                style={currentName ? styles.name : styles.namePlaceholder}
              >
                {currentName || "No display name set"}
              </Text>
            </View>
            {!editingName ? (
              <ScalePressable
                onPress={handleStartEditName}
                accessibilityRole="button"
                accessibilityLabel="Edit display name"
                style={styles.editNameButton}
              >
                <Text style={styles.editNameButtonText}>Edit name</Text>
              </ScalePressable>
            ) : null}
          </View>

          {editingName ? (
            <View style={styles.editForm}>
              <TextInput
                value={nameDraft}
                onChangeText={(value) => {
                  setNameDraft(value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Enter display name"
                placeholderTextColor={palette.placeholder}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                editable={!savingName}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => {
                  void handleSaveName();
                }}
                accessibilityLabel="Display name"
                style={[styles.input, nameError ? styles.inputError : null]}
              />
              {nameError ? (
                <Text style={styles.nameError}>{nameError}</Text>
              ) : null}
              <View style={styles.editActionsRow}>
                <ScalePressable
                  onPress={handleCancelEditName}
                  disabled={savingName}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel display name edit"
                  style={[styles.editActionButton, styles.cancelButton, savingName && styles.disabled]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </ScalePressable>
                <ScalePressable
                  onPress={() => {
                    void handleSaveName();
                  }}
                  disabled={savingName}
                  accessibilityRole="button"
                  accessibilityLabel="Save display name"
                  accessibilityState={{ disabled: savingName, busy: savingName }}
                  style={[styles.editActionButton, styles.saveButton, savingName && styles.disabled]}
                >
                  {savingName ? (
                    <ActivityIndicator color={palette.onAccent} size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </ScalePressable>
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.email}>{user?.email ?? "Signed in"}</Text>
          {provider ? (
            <Text style={styles.muted}>
              Signed in with {providerLabel(provider)}
            </Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScalePressable
          onPress={handleSignOut}
          disabled={signingOut}
          style={[styles.button, signingOut && styles.disabled]}
        >
          {signingOut ? (
            <ActivityIndicator color={palette.onAccent} />
          ) : (
            <Text style={styles.buttonText}>Sign out</Text>
          )}
        </ScalePressable>
      </ScrollView>

      {toast ? (
        <Toast
          visible={Boolean(toast)}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * Friendly name for a Supabase auth provider id.
 * @param provider e.g. "email", "google", "apple"
 * @returns Display label
 */
function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "email";
}

/**
 * Styles for the account screen.
 */
const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.bg },
  screen: { flex: 1, backgroundColor: palette.bg },
  content: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: BOTTOM_TAB_CLEARANCE,
    gap: 16,
  },
  title: { fontSize: 34, fontWeight: "700", color: palette.text },
  card: {
    gap: 8,
    padding: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    ...elevation(palette),
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  nameInfo: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: palette.muted,
  },
  name: { fontSize: 17, fontWeight: "700", color: palette.text },
  namePlaceholder: {
    fontSize: 16,
    fontWeight: "500",
    color: palette.muted,
    fontStyle: "italic",
  },
  editNameButton: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editNameButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.text,
  },
  editForm: {
    gap: 10,
    marginTop: 4,
  },
  input: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: "600",
    color: palette.text,
  },
  inputError: {
    borderColor: palette.error,
  },
  nameError: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.error,
  },
  editActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  editActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  saveButton: {
    backgroundColor: palette.accent,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.text,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.onAccent,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 4,
  },
  email: { fontSize: 16, color: palette.text },
  muted: { fontSize: 14, color: palette.muted },
  error: { color: palette.error, fontWeight: "600" },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
}));
