import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { NewGroupButton } from "@/components/NewGroupButton";
import { USE_MOCK, mockGroups } from "@/lib/mock";
import { palette } from "@/lib/palette";
import { SUPABASE as supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Group = { id: string; name: string };

// TODO (create-group story): put the "new group" flow here, e.g. open a
// name form and call supabase.rpc("create_group", { p_name }).
// This is the only line the button needs, so nothing else has to change.
const onNewGroup = () => {
  console.log("New group pressed (placeholder)");
};

export default function Index() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true); // first load only
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [error, setError] = useState<string | null>(null);

  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS == "web" ? 80 : insets.top + 24;

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    if (USE_MOCK) {
      setGroups(mockGroups);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!supabase) {
      setError("Add your Supabase URL and key to .env");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // With Row Level Security on, this only returns groups the
    // signed-in user is a member of.
    const { data, error } = await supabase
      .from("groups")
      .select("id, name")
      .order("name");

    if (error) setError(error.message);
    else setGroups(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => load("initial")} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.list, { paddingTop: topPadding }]}
      data={groups}
      keyExtractor={(g) => g.id}
      onRefresh={() => load("refresh")}
      refreshing={refreshing}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Your groups</Text>
          <Text style={styles.title}>Where are we splitting?</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>
              Choose a group to see its members and receipts.
            </Text>
            <NewGroupButton onPress={onNewGroup} />
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>You're not in any groups yet.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() =>
            router.navigate({
              pathname: "/groups/[id]",
              params: { id: item.id },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View
            style={[
              styles.tile,
              {
                backgroundColor: palette.tiles[index % palette.tiles.length],
              },
            ]}
          >
            <Text style={styles.tileText}>
              {item.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.rowText} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: palette.bg,
  },
  list: { padding: 24, gap: 12 },
  header: { marginBottom: 12, gap: 6 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },
  subtitle: { flex: 1, fontSize: 15, color: palette.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  rowPressed: { opacity: 0.7 },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { fontSize: 20, fontWeight: "700", color: palette.text },
  rowText: { flex: 1, fontSize: 17, fontWeight: "700", color: palette.text },
  chevron: { fontSize: 26, color: palette.muted },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  emptyText: { color: palette.muted, fontSize: 15 },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
});