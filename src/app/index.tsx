import { useTheme } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "@/lib/supabase";
import { JoinGroupModal } from "@/components/join-group-modal";
import { Group } from "@/lib/groups.types";
import { LinearGradient } from "expo-linear-gradient";

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
          <Text style={styles.groupCardLabel}>Current Active Group</Text>
          <Text style={styles.groupCardName}>{currentGroup.name}</Text>
          <Text style={styles.groupCardCode}>Invite Code: {currentGroup.invite_code}</Text>
        </View>
      )}

      <Pressable
        onPress={() => setJoinModalVisible(true)}
        style={({ pressed }) => [
          styles.joinButtonWrapper,
          pressed && styles.buttonPressed,
        ]}
      >
        <LinearGradient
          colors={["#BAC8E8", "#98B687"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.joinButton}
        >
          <Text style={styles.joinButtonText}>Join a Group</Text>
        </LinearGradient>
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
    color: "#5C1D24",
    backgroundColor: "#EACECD",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    textAlign: "center",
    overflow: "hidden",
  },
  joinButtonWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  joinButton: {
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  groupCard: {
    backgroundColor: "#DDEAE0",
    borderWidth: 1,
    borderColor: "#B8D3BE",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  groupCardLabel: {
    fontSize: 11,
    color: "#1B4332",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  groupCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B4332",
    marginTop: 3,
  },
  groupCardCode: {
    fontSize: 13,
    color: "#2D5A3D",
    marginTop: 2,
    fontWeight: "500",
  },
});
