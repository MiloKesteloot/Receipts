import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";

export default function Index() {
  const [clicks, setClicks] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Add your Supabase URL and key to .env.local"
  );

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("counter")
      .select("clicks")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setClicks(data.clicks);
      });
  }, []);

  async function handlePress() {
    if (!supabase) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("increment_clicks");
    setSaving(false);
    if (error) setError(error.message);
    else {
      setError(null);
      setClicks(data);
    }
  }

  return (
    <View style={styles.container}>
      <Text>Receipts</Text>
      <Pressable
        onPress={handlePress}
        disabled={clicks === null || saving}
        style={({ pressed }) => [
          styles.button,
          (pressed || saving) && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>Clicks: {clicks ?? "…"}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
