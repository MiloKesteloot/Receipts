import { router, useFocusEffect } from "expo-router";
import { JSX, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { JoinGroupModal } from "@/components/join-group-modal";
import { NewGroupButton } from "@/components/NewGroupButton";
import { Toast, ToastType } from "@/components/toast";
import { mockGroups, USE_MOCK } from "@/lib/mock";
import { palette } from "@/lib/palette";
import { SUPABASE as supabase } from "@/lib/supabase";

type Group = { id: string; name: string };

/**
 * Main groups list screen allowing user to view and join groups.
 * @returns JSX element
 */
export default function Index(): JSX.Element {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true); // first load only
  const [refreshing, setRefreshing] = useState(false); // pull-to-refresh
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [toastState, setToastState] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 80 : insets.top + 24;

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    if (USE_MOCK) {
      setGroups([...mockGroups]);
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

  useFocusEffect(
    useCallback(() => {
      if (USE_MOCK) {
        setGroups([...mockGroups]);
      }
    }, [])
  );

  const handleOpenModal = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  const handleGroupJoined = (
    _group: Group,
    status: "JOINED" | "ALREADY_MEMBER",
    message: string
  ) => {
    setModalVisible(false);
    setGroups([...mockGroups]);
    setToastState({
      message,
      type: status === "ALREADY_MEMBER" ? "info" : "success",
    });
  };


  if (loading) {
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>{error}</Text>
        <Pressable onPress={() => load("initial")} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={STYLES.container}>
      <FlatList
        style={STYLES.screen}
        contentContainerStyle={[STYLES.list, { paddingTop: topPadding }]}
        data={groups}
        keyExtractor={(g) => g.id}
        onRefresh={() => load("refresh")}
        refreshing={refreshing}
        ListHeaderComponent={
          <View style={STYLES.header}>
            <Text style={STYLES.eyebrow}>Your groups</Text>
            <Text style={STYLES.title}>Where are we splitting?</Text>
            <View style={STYLES.subtitleRow}>
              <Text style={STYLES.subtitle}>
                Choose a group to see its members and receipts.
              </Text>
              <NewGroupButton onPress={handleOpenModal} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={STYLES.emptyCard}>
            <Text style={STYLES.emptyText}>You&apos;re not in any groups yet.</Text>
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
            style={({ pressed }) => [STYLES.row, pressed && STYLES.rowPressed]}
          >
            <View
              style={[
                STYLES.tile,
                {
                  backgroundColor: palette.tiles[index % palette.tiles.length],
                },
              ]}
            >
              <Text style={STYLES.tileText}>
                {item.name.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={STYLES.rowText} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={STYLES.chevron}>›</Text>
          </Pressable>
        )}
      />
      <JoinGroupModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSuccess={handleGroupJoined}
      />
      {toastState ? (
        <Toast
          visible={Boolean(toastState)}
          message={toastState.message}
          type={toastState.type}
          onDismiss={() => setToastState(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Styles for the Index screen.
 */
const STYLES = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
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
