import { useFocusEffect } from "expo-router";
import { JSX, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import {
  GroupSelector,
  SpendingOverTimeCard,
} from "@/components/stats-cards";
import { type GroupSummary, loadGroupList } from "@/lib/group-data";
import {
  buildSpendingOverTime,
  type GroupStats,
  loadGroupStats,
  totalSpentCents,
} from "@/lib/group-stats";
import { palette } from "@/lib/palette";
import { supabase } from "@/lib/supabase";

type StatsState =
  | { status: "loading" }
  | { status: "ok"; stats: GroupStats }
  | { status: "error"; message: string };

/**
 * Stats tab (US 4.1): pick one of your groups and see where its money goes.
 * Every card reads from one shared `loadGroupStats` fetch for the chosen group.
 * @returns JSX element
 */
export default function StatsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 80 : insets.top + 24;

  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statsState, setStatsState] = useState<StatsState>({
    status: "loading",
  });
  // Ignores responses for a group the user has already switched away from.
  const requestRef = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const loadStats = useCallback(async (groupId: string, quiet = false) => {
    const request = ++requestRef.current;
    if (!quiet) setStatsState({ status: "loading" });
    const result = await loadGroupStats(groupId);
    if (request !== requestRef.current) return;
    setStatsState(
      result.status === "ok"
        ? { status: "ok", stats: result.stats }
        : { status: "error", message: result.message }
    );
  }, []);

  const selectGroup = useCallback(
    (groupId: string, quiet = false) => {
      selectedRef.current = groupId;
      setSelectedId(groupId);
      loadStats(groupId, quiet);
    },
    [loadStats]
  );

  const loadAll = useCallback(async () => {
    setGroupsError(null);
    const result = await loadGroupList({ client: supabase });
    if (result.status !== "ok") {
      setGroupsError(result.message);
      return;
    }
    setGroups(result.groups);
    const current = selectedRef.current;
    const stillThere = result.groups.some((g) => g.id === current);
    if (current && stillThere) {
      selectGroup(current, true);
    } else if (result.groups.length > 0) {
      selectGroup(result.groups[0].id);
    } else {
      selectedRef.current = null;
      setSelectedId(null);
    }
  }, [selectGroup]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const spending = useMemo(() => {
    if (statsState.status !== "ok") return null;
    return {
      points: buildSpendingOverTime(statsState.stats.receipts),
      totalCents: totalSpentCents(statsState.stats.receipts),
    };
  }, [statsState]);

  if (groupsError && !groups) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>{groupsError}</Text>
        <Pressable onPress={loadAll} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!groups) {
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} testID="stats-loading" />
      </View>
    );
  }

  return (
    <ScrollView
      style={STYLES.screen}
      contentContainerStyle={[STYLES.content, { paddingTop: topPadding }]}
    >
      <View style={STYLES.header}>
        <Text style={STYLES.title}>Stats</Text>
        <Text style={STYLES.subtitle}>See where your group&apos;s money goes.</Text>
      </View>

      {groups.length === 0 ? (
        <View style={STYLES.emptyCard}>
          <Text style={STYLES.emptyText}>
            Join or create a group to see its stats.
          </Text>
        </View>
      ) : (
        <>
          <GroupSelector
            groups={groups}
            selectedId={selectedId}
            onSelect={(id) => {
              if (id !== selectedRef.current) selectGroup(id);
            }}
          />

          {statsState.status === "loading" ? (
            <View style={STYLES.cardsLoading}>
              <ActivityIndicator color={palette.accent} testID="stats-loading" />
            </View>
          ) : statsState.status === "error" ? (
            <View style={STYLES.emptyCard}>
              <Text style={STYLES.error}>{statsState.message}</Text>
              <Pressable
                onPress={() => selectedId && loadStats(selectedId)}
                style={STYLES.button}
              >
                <Text style={STYLES.buttonText}>Try again</Text>
              </Pressable>
            </View>
          ) : spending ? (
            <SpendingOverTimeCard
              points={spending.points}
              totalCents={spending.totalCents}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/**
 * Styles for the Stats screen.
 */
const STYLES = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, paddingBottom: BOTTOM_TAB_CLEARANCE, gap: 16 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: palette.bg,
  },
  header: { gap: 4 },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
  cardsLoading: { paddingVertical: 48, alignItems: "center" },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    gap: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  emptyText: { color: palette.muted, fontSize: 15, textAlign: "center" },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
});
