import { maybeCompleteAuthSession } from "expo-web-browser";
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

import {
  AppleIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
} from "@/components/icons";
import type { AuthResult, EmailMode } from "@/lib/auth";
import { useAuth } from "@/lib/auth-provider";
import { palette } from "@/lib/palette";

// On web, OAuth opens in a popup that lands back here; this closes it.
maybeCompleteAuthSession();

type Busy = "email" | "google" | "apple" | null;

/** What the email card is for: signing in, creating an account, or a reset email (US 4.10). */
type CardMode = EmailMode | "forgot";

/**
 * Sign-in screen: email/password (sign in or create account), Google and
 * Apple, and Forgot password (US 4.10). The root layout swaps to the app as
 * soon as a session exists.
 * @returns JSX element
 */
export default function SignInScreen(): JSX.Element {
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithApple,
    requestPasswordReset,
  } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<CardMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Runs a sign-in action and shows its outcome.
   * @param kind Which button started it
   * @param action Sign-in call to run
   */
  async function run(kind: Exclude<Busy, null>, action: () => Promise<AuthResult>): Promise<void> {
    setBusy(kind);
    setError(null);
    setNotice(null);
    const result = await action();
    setBusy(null);
    if (!result.success) {
      if (result.error !== "CANCELLED") setError(result.message);
    } else if (result.message) {
      setNotice(result.message);
    }
  }

  /**
   * Submits the email form for the current mode.
   */
  function handleEmail(): void {
    run("email", () =>
      mode === "forgot"
        ? requestPasswordReset(email)
        : mode === "sign-in"
          ? signInWithEmail(email, password)
          : signUpWithEmail(email, password, displayName)
    );
  }

  /**
   * Switches the card's mode and clears old messages. The email stays.
   * @param next Mode to show
   */
  function switchMode(next: CardMode): void {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  /**
   * Switches between signing in and creating an account, or leaves the
   * reset form for sign-in.
   */
  function toggleMode(): void {
    switchMode(mode === "sign-in" ? "sign-up" : "sign-in");
  }

  const title =
    mode === "forgot"
      ? "Reset your password"
      : mode === "sign-in"
        ? "Welcome back"
        : "Create your account";
  const subtitle =
    mode === "forgot"
      ? "Enter your email and we'll send you a link to choose a new password."
      : "Sign in to see your groups and split receipts.";
  const submitLabel =
    mode === "forgot" ? "Send reset link" : mode === "sign-in" ? "Sign in" : "Create account";
  const toggleLabel =
    mode === "sign-in"
      ? "New here? Create an account"
      : mode === "sign-up"
        ? "Already have an account? Sign in"
        : "Back to sign in";

  const disabled = busy !== null;

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
          <Text style={STYLES.title}>{title}</Text>
          <Text style={STYLES.subtitle}>{subtitle}</Text>
        </View>

        <View style={STYLES.card}>
          {mode === "sign-up" ? (
            <TextInput
              style={STYLES.input}
              placeholder="Display name"
              placeholderTextColor={palette.muted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              editable={!disabled}
            />
          ) : null}
          <TextInput
            style={STYLES.input}
            placeholder="Email"
            placeholderTextColor={palette.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType={mode === "forgot" ? "send" : "next"}
            onSubmitEditing={mode === "forgot" ? handleEmail : undefined}
            editable={!disabled}
          />
          {mode === "forgot" ? null : (
            <View style={PASSWORD_STYLES.wrapper}>
              <TextInput
                style={[STYLES.input, PASSWORD_STYLES.input]}
                placeholder="Password"
                placeholderTextColor={palette.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                textContentType={mode === "sign-in" ? "password" : "newPassword"}
                returnKeyType="go"
                onSubmitEditing={handleEmail}
                editable={!disabled}
              />
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={8}
                style={({ pressed }) => [
                  PASSWORD_STYLES.eyeButton,
                  pressed && PASSWORD_STYLES.eyeButtonPressed,
                ]}
              >
                {showPassword ? (
                  <EyeOffIcon size={20} color={palette.muted} />
                ) : (
                  <EyeIcon size={20} color={palette.muted} />
                )}
              </Pressable>
            </View>
          )}

          {mode === "sign-in" ? (
            <Pressable
              onPress={() => switchMode("forgot")}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              style={STYLES.forgotLink}
            >
              <Text style={STYLES.forgotText}>Forgot password?</Text>
            </Pressable>
          ) : null}

          {error ? <Text style={STYLES.error}>{error}</Text> : null}
          {notice ? <Text style={STYLES.notice}>{notice}</Text> : null}

          <Pressable
            onPress={handleEmail}
            disabled={disabled}
            style={({ pressed }) => [
              STYLES.primaryButton,
              pressed && STYLES.pressed,
              disabled && STYLES.disabled,
            ]}
          >
            {busy === "email" ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={STYLES.primaryButtonText}>{submitLabel}</Text>
            )}
          </Pressable>

          <Pressable onPress={toggleMode} disabled={disabled} hitSlop={8}>
            <Text style={STYLES.toggle}>{toggleLabel}</Text>
          </Pressable>
        </View>

        {mode === "forgot" ? null : (
          <>
            <View style={STYLES.dividerRow}>
              <View style={STYLES.dividerLine} />
              <Text style={STYLES.dividerText}>or</Text>
              <View style={STYLES.dividerLine} />
            </View>

            <View style={STYLES.socialRow}>
              <Pressable
                onPress={() => run("apple", signInWithApple)}
                disabled={disabled}
                style={({ pressed }) => [
                  STYLES.socialButton,
                  STYLES.appleButton,
                  pressed && STYLES.pressed,
                  disabled && STYLES.disabled,
                ]}
              >
                {busy === "apple" ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <AppleIcon size={18} color="#FFFFFF" />
                    <Text
                      style={[STYLES.socialText, STYLES.appleText]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Continue with Apple
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => run("google", signInWithGoogle)}
                disabled={disabled}
                style={({ pressed }) => [
                  STYLES.socialButton,
                  pressed && STYLES.pressed,
                  disabled && STYLES.disabled,
                ]}
              >
                {busy === "google" ? (
                  <ActivityIndicator color={palette.text} />
                ) : (
                  <>
                    <GoogleIcon size={18} />
                    <Text
                      style={STYLES.socialText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Styles for the sign-in screen.
 */
/** Styles for the password field and visibility toggle button. */
const PASSWORD_STYLES = StyleSheet.create({
  wrapper: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  eyeButtonPressed: {
    opacity: 0.6,
  },
});

/** Styles for the sign-in screen. */
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
  error: { color: palette.error, fontSize: 14, fontWeight: "600" },
  notice: { color: palette.text, fontSize: 14, fontWeight: "600" },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  forgotLink: { alignSelf: "flex-end", marginTop: -4 },
  forgotText: { color: palette.accent, fontSize: 14, fontWeight: "600" },
  toggle: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 4,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.border },
  dividerText: { paddingHorizontal: 12, fontSize: 13, color: palette.muted },
  socialRow: {
    flexDirection: "row",
    gap: 10,
  },
  socialButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  socialText: { fontSize: 13.5, fontWeight: "600", color: palette.text, flexShrink: 1 },
  appleButton: { backgroundColor: "black", borderColor: "black" },
  appleText: { color: "white" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
