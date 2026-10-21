import { useTheme } from "expo-router";
import { JSX, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SUPABASE } from "@/lib/supabase";

/**
 * TODO Write description
 * @returns JSX element
 */
export default function Index(): JSX.Element {
  const { colors } = useTheme();
  const [clicks, setClicks] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    SUPABASE ? null : "Add your Supabase URL and key to .env"
  );

  useEffect(() => {
    if (!SUPABASE) return;
    SUPABASE
      .from("counter")
      .select("clicks")
      .eq("id", 1)
      .single()
      .then(({ data, error }: { data: { clicks: number } | null; error: { message: string } | null }) => {
        if (error) setError(error.message);
        else if (data) setClicks(data.clicks);
      });
  }, []);

  /**
   * TODO Write description
   */
  async function handlePress() {
    if (!SUPABASE) return;
    setSaving(true);
    const { data, error } = await SUPABASE.rpc("increment_clicks");
    setSaving(false);
    if (error) setError(error.message);
    else {
      setError(null);
      setClicks(data);
    }
  }

  return (
    <View style={[STYLES.container, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text }}>Receipts</Text>
      <Pressable
        onPress={handlePress}
        disabled={clicks === null || saving}
        style={({ pressed }) => [
          STYLES.button,
          (pressed || saving) && STYLES.buttonPressed,
        ]}
      >
        <Text style={STYLES.buttonText}>Clicks: {clicks ?? "…"}</Text>
      </Pressable>
      {error && <Text style={STYLES.error}>{error}</Text>}
    </View>
  );
}

/**
 * TODO Write description
 */
const STYLES = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  button: {
    backgroundColor: "#208AEF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#D93025",
    textAlign: "center",
  },
});
