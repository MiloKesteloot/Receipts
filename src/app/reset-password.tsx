import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JSX } from "react/jsx-runtime";

import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth-provider";
import { palette } from "@/lib/palette";

/**
 * "Choose a new password" screen (US 4.10). The root layout shows only this
 * screen after a password reset link is opened. Saving the new password opens
 * the app; cancelling signs out and returns to sign-in.
 * @returns JSX element
 */
export default function ResetPasswordScreen(): JSX.Element {
  const { session, updatePassword, cancelPasswordReset } = useAuth();
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"save" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Saves the new password. On success the layout leaves this screen.
   */
  async function handleSave(): Promise<void> {
    if (busy) return;
    setBusy("save");
    setError(null);
    const result = await updatePassword(password, confirmation);
    setBusy(null);
    if (!result.success) setError(result.message);
  }

  /**
   * Gives up on the reset and signs out.
   */
  async function handleCancel(): Promise<void> {
    if (busy) return;
    setBusy("cancel");
    setError(null);
    const result = await cancelPasswordReset();
    setBusy(null);
    if (!result.success) setError(result.message);
  }

  const disabled = busy !== null;
  const email = session?.user.email;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={STYLES.container}
    >
      <ScrollView
        contentContainerStyle={[
          STYLES.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={STYLES.header}>
          <Text style={STYLES.eyebrow}>Receipts</Text>
          <Text style={STYLES.title}>Choose a new password</Text>
          <Text style={STYLES.subtitle}>
            {email
              ? `Set a new password for ${email}.`
              : "Set a new password for your account."}
          </Text>
        </View>

        <View style={STYLES.card}>
          <View style={STYLES.passwordWrapper}>
            <TextInput
              style={[STYLES.input, STYLES.passwordInput]}
              placeholder="New password"
              placeholderTextColor={palette.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              returnKeyType="next"
              editable={!disabled}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={8}
              style={({ pressed }) => [STYLES.eyeButton, pressed && STYLES.pressed]}
            >
              {showPassword ? (
                <EyeOffIcon size={20} color={palette.muted} />
              ) : (
                <EyeIcon size={20} color={palette.muted} />
              )}
            </Pressable>
          </View>
          <TextInput
            style={STYLES.input}
            placeholder="Confirm new password"
            placeholderTextColor={palette.muted}
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={() => {
              void handleSave();
            }}
            editable={!disabled}
          />

          {error ? <Text style={STYLES.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: busy === "save" }}
            style={({ pressed }) => [
              STYLES.primaryButton,
              pressed && STYLES.pressed,
              disabled && STYLES.disabled,
            ]}
          >
            {busy === "save" ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={STYLES.primaryButtonText}>Save new password</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              void handleCancel();
            }}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={STYLES.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Styles for the reset password screen (matches the sign-in screen). */
const STYLES = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 24, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" },
  header: { gap: 6, marginBottom: 10 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
  card: {
    gap: 12,
    padding: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  input: {
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: palette.text,
    backgroundColor: palette.card,
  },
  passwordWrapper: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 48 },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  error: { color: palette.error, fontSize: 14, fontWeight: "600" },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  cancel: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 4,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
