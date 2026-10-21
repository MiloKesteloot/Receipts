import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { USE_MOCK, mockGroupDetails } from "@/lib/mock";
import { palette } from "@/lib/palette";
import { supabase } from "@/lib/supabase";

type Member = {
  user_id: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

type Receipt = {
  id: string;
  title: string;
  total_cents: number;
  created_at: string;
};

type GroupDetail = {
  group: {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
  };
  members: Member[];
  receipts: Receipt[]; // empty until sprint 2
};

// Money is stored in cents (1250 = $12.50).
const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    if (USE_MOCK) {
      const d = mockGroupDetails[id];
      if (d) setDetail(d as GroupDetail);
      else setForbidden(true); // unknown id behaves like "not a member"
      setLoading(false);
      return;
    }

    if (!supabase) {
      setError("Add your Supabase URL and key to .env");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("get_group", {
      p_group_id: id,
    });

    if (error) {
      // 42501 = not a member (or group doesn't exist). Don't open the group.
      if (error.code === "42501") {
        setForbidden(true);
        setDetail(null);
      } else {
        setError(error.message);
      }
    } else {
      setDetail(data as GroupDetail);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (forbidden) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>You're not a member of this group.</Text>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={styles.button}
        >
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Group not found"}</Text>
        <Pressable onPress={load} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { group, members, receipts } = detail;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Group</Text>
        <Text style={styles.title}>{group.name}</Text>
        <Text style={styles.subtitle}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Members ({members.length})</Text>
      <View style={styles.card}>
        {members.map((m, i) => {
          const name = m.display_name ?? "Unknown";
          return (
            <View
              key={m.user_id}
              style={[styles.memberRow, i > 0 && styles.memberDivider]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: palette.tiles[i % palette.tiles.length] },
                ]}
              >
                <Text style={styles.avatarText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.memberName}>{name}</Text>
              {m.role === "owner" ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>Owner</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Receipts</Text>
      <View style={styles.card}>
        {receipts.length === 0 ? (
          <Text style={styles.emptyText}>Receipts will show up here.</Text>
        ) : (
          receipts.map((r, i) => (
            <View
              key={r.id}
              style={[styles.receiptRow, i > 0 && styles.memberDivider]}
            >
              <Text style={styles.memberName}>{r.title}</Text>
              <Text style={styles.amount}>{formatCents(r.total_cents)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
  content: { padding: 24, gap: 10 },
  header: { gap: 6, marginBottom: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.muted,
    marginTop: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  memberDivider: { borderTopWidth: 1, borderTopColor: palette.border },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: palette.text },
  memberName: { flex: 1, fontSize: 16, fontWeight: "600", color: palette.text },
  pill: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: "700", color: palette.accent },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  amount: { fontSize: 16, fontWeight: "700", color: palette.text },
  emptyText: { paddingVertical: 16, color: palette.muted, fontSize: 15 },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
});