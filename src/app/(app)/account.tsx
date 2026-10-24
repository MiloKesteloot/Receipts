import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { useAuth } from "@/lib/auth-provider";
import { palette } from "@/lib/palette";

/**
 * The accounts screen: who is signed in, and a sign-out button.
 * @returns JSX element
 */
export default function AccountScreen(): JSX.Element {
  const { session, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user;
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const provider = user?.app_metadata?.provider;

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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={STYLES.screen}
      contentContainerStyle={STYLES.content}
    >
      <Text style={STYLES.title}>Account</Text>

      <View style={STYLES.card}>
        {name ? <Text style={STYLES.name}>{name}</Text> : null}
        <Text style={STYLES.email}>{user?.email ?? "Signed in"}</Text>
        {provider ? (
          <Text style={STYLES.muted}>Signed in with {providerLabel(provider)}</Text>
        ) : null}
      </View>

      {error ? <Text style={STYLES.error}>{error}</Text> : null}

      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={({ pressed }) => [
          STYLES.button,
          pressed && STYLES.pressed,
          signingOut && STYLES.disabled,
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={STYLES.buttonText}>Sign out</Text>
        )}
      </Pressable>
    </ScrollView>
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
const STYLES = StyleSheet.create({
  screen: { backgroundColor: palette.bg },
  content: { padding: 24, paddingTop: 32, gap: 16 },
  title: { fontSize: 34, fontWeight: "700", color: palette.text },
  card: {
    gap: 4,
    padding: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  name: { fontSize: 18, fontWeight: "700", color: palette.text },
  email: { fontSize: 16, color: palette.text },
  muted: { fontSize: 14, color: palette.muted, marginTop: 4 },
  error: { color: palette.error, fontWeight: "600" },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
