import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { ChevronRightIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { useAuth } from "@/lib/auth-provider";
import type { GroupSummary } from "@/lib/group-data";
import { loadOwnedGroups, type GroupMembersClient } from "@/lib/group-members";
import { supabase } from "@/lib/supabase";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

/**
 * Puts the group the user came from first, when they own it.
 * @param groups Owned groups, sorted by name
 * @param fromId Id of the group the user came from, if any
 * @returns The groups in display order
 */
function withCurrentFirst(
  groups: GroupSummary[],
  fromId: string | undefined
): GroupSummary[] {
  const current = groups.find((g) => g.id === fromId);
  if (!current) return groups;
  return [current, ...groups.filter((g) => g.id !== fromId)];
}

/**
 * "Remove members" prompt (US 3.2 Tasks 2 & 3): lists the groups the user
 * owns. Tapping one opens its member checklist.
 * @returns JSX element
 */
export default function RemoveMembersPicker(): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id;

  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await loadOwnedGroups(currentUserId, {
      // Checking Supabase's generic .eq() against the narrow client type
      // hits TS's depth limit (TS2589), so it is cast through unknown.
      client: supabase as unknown as GroupMembersClient | null,
    });
    if (result.status === "ok") setGroups(result.groups);
    else {
      setGroups(null);
      setError(result.message);
    }
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <ScalePressable onPress={() => load()} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </ScalePressable>
      </View>
    );
  }

  if (groups === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const ordered = withCurrentFirst(groups, from);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Manage</Text>
        <Text style={styles.title}>Remove members</Text>
        <Text style={styles.subtitle}>Choose a group you own</Text>
      </View>

      <View style={styles.card}>
        {ordered.length === 0 ? (
          <Text style={styles.emptyText}>You don&apos;t own any groups yet.</Text>
        ) : (
          ordered.map((g, i) => (
            <ScalePressable
              key={g.id}
              onPress={() =>
                router.push({
                  pathname: "/remove-members/[groupId]",
                  params: { groupId: g.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Manage members of ${g.name}`}
              style={[styles.row, i > 0 && styles.divider]}
            >
              <View
                style={[
                  styles.tile,
                  { backgroundColor: palette.tiles[i % palette.tiles.length] },
                ]}
              >
                <Text style={styles.tileText}>
                  {g.name.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {g.name}
              </Text>
              {g.id === from ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Current</Text>
                </View>
              ) : null}
              <ChevronRightIcon size={16} color={palette.muted} strokeWidth={2.4} />
            </ScalePressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/**
 * Styles for the Remove members picker, matching the group screen.
 */
const useStyles = createThemedStyles((palette) => ({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, paddingBottom: 128, gap: 10 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: palette.bg,
  },
  header: { gap: 6, marginBottom: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 34, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    ...elevation(palette),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  divider: { borderTopWidth: 1, borderTopColor: palette.border },
  pressed: { opacity: 0.7 },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { fontSize: 16, fontWeight: "700", color: palette.text },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: palette.text },
  pill: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: "700", color: palette.accent },
  emptyText: { paddingVertical: 16, color: palette.muted, fontSize: 15 },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
}));
