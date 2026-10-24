import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  isAvailableAsync as isAppleSignInAvailable,
} from "expo-apple-authentication";
import { maybeCompleteAuthSession } from "expo-web-browser";
import { useEffect, useState } from "react";
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

import type { AuthResult, EmailMode } from "@/lib/auth";
import { useAuth } from "@/lib/auth-provider";
import { palette } from "@/lib/palette";

// On web, OAuth opens in a popup that lands back here; this closes it.
maybeCompleteAuthSession();

type Busy = "email" | "google" | "apple" | null;

/**
 * Sign-in screen: email/password (sign in or create account), Google and Apple.
 * The root layout swaps to the app as soon as a session exists.
 * @returns JSX element
 */
export default function SignInScreen(): JSX.Element {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple } =
    useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<EmailMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nativeApple, setNativeApple] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    isAppleSignInAvailable().then(setNativeApple);
  }, []);

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
      mode === "sign-in"
        ? signInWithEmail(email, password)
        : signUpWithEmail(email, password)
    );
  }

  /**
   * Switches between signing in and creating an account.
   */
  function toggleMode(): void {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    setError(null);
    setNotice(null);
  }

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
          <Text style={STYLES.title}>
            {mode === "sign-in" ? "Welcome back" : "Create your account"}
          </Text>
          <Text style={STYLES.subtitle}>
            Sign in to see your groups and split receipts.
          </Text>
        </View>

        <View style={STYLES.card}>
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
            editable={!disabled}
          />
          <TextInput
            style={STYLES.input}
            placeholder="Password"
            placeholderTextColor={palette.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            textContentType={mode === "sign-in" ? "password" : "newPassword"}
            returnKeyType="go"
            onSubmitEditing={handleEmail}
            editable={!disabled}
          />

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
              <Text style={STYLES.primaryButtonText}>
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={toggleMode} disabled={disabled} hitSlop={8}>
            <Text style={STYLES.toggle}>
              {mode === "sign-in"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </Text>
          </Pressable>
        </View>

        <View style={STYLES.dividerRow}>
          <View style={STYLES.dividerLine} />
          <Text style={STYLES.dividerText}>or</Text>
          <View style={STYLES.dividerLine} />
        </View>

        {nativeApple ? (
          <AppleAuthenticationButton
            buttonType={AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={STYLES.appleNative}
            onPress={() => {
              if (!disabled) run("apple", signInWithApple);
            }}
          />
        ) : (
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
              <Text style={[STYLES.socialText, STYLES.appleText]}>
                Continue with Apple
              </Text>
            )}
          </Pressable>
        )}

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
            <Text style={STYLES.socialText}>Continue with Google</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Styles for the sign-in screen.
 */
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
  socialButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  socialText: { fontSize: 16, fontWeight: "600", color: palette.text },
  appleButton: { backgroundColor: "black", borderColor: "black" },
  appleText: { color: "white" },
  appleNative: { width: "100%", height: 50 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
