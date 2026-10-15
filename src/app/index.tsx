import { useTheme } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";
import { JoinGroupModal } from "@/components/join-group-modal";
import { Group } from "@/lib/groups.types";

export default function Index() {
  const { colors } = useTheme();
  const [clicks, setClicks] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase ? null : "Add your Supabase URL and key to .env"
  );
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.text }}>Receipts</Text>
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

      {currentGroup && (
        <View style={styles.groupCard}>
          <Text style={styles.groupCardLabel}>Current Active Group:</Text>
          <Text style={styles.groupCardName}>{currentGroup.name}</Text>
          <Text style={styles.groupCardCode}>Invite Code: {currentGroup.invite_code}</Text>
        </View>
      )}

      <Pressable
        onPress={() => setJoinModalVisible(true)}
        style={({ pressed }) => [
          styles.joinButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.joinButtonText}>Join a Group</Text>
      </Pressable>

      <JoinGroupModal
        visible={joinModalVisible}
        onClose={() => setJoinModalVisible(false)}
        onSuccess={(group) => {
          setCurrentGroup(group);
        }}
      />
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
  joinButton: {
    backgroundColor: "#10B981",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  groupCard: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "#10B981",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    maxWidth: 300,
  },
  groupCardLabel: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  groupCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 2,
  },
  groupCardCode: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 2,
  },
});
