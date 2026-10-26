/* eslint-disable @typescript-eslint/naming-convention */

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

import { Toast, ToastType } from "@/components/toast";
import { JSX } from "react/jsx-runtime";

import { loadGroupDetail } from "@/lib/group-data";
import { USE_MOCK } from "@/lib/mock";
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

/**
 * Formats monetary amounts from cents to dollars string.
 * @param cents Amount in cents
 * @returns Formatted currency string
 */
const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * Detailed view of a group showing members and receipts.
 * @returns JSX element
 */
export default function GroupScreen(): JSX.Element {
  const { id, toastMessage, toastType } = useLocalSearchParams<{
    id: string;
    toastMessage?: string;
    toastType?: string;
  }>();

  const [toastState, setToastState] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      setToastState({
        message: toastMessage,
        type: (toastType as ToastType) || "info",
      });
    }
  }, [toastMessage, toastType]);

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    const result = await loadGroupDetail(id, {
      useMock: USE_MOCK,
      client: supabase,
    });

    if (result.status === "ok") setDetail(result.detail);
    else if (result.status === "forbidden") {
      setForbidden(true);
      setDetail(null);
    } else setError(result.message);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} />
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

  if (forbidden) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>You&apos;re not a member of this group.</Text>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={STYLES.button}
        >
          <Text style={STYLES.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>{error ?? "Group not found"}</Text>
        <Pressable onPress={load} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { group, members, receipts } = detail;

  return (
    <View style={STYLES.container}>
      <ScrollView style={STYLES.screen} contentContainerStyle={STYLES.content}>
        <View style={STYLES.header}>
          <Text style={STYLES.eyebrow}>Group</Text>
          <Text style={STYLES.title}>{group.name}</Text>
          <Text style={STYLES.subtitle}>
            {members.length} {members.length === 1 ? "member" : "members"}
          </Text>
        </View>

        <Text style={STYLES.sectionLabel}>Members ({members.length})</Text>
        <View style={STYLES.card}>
          {members.map((m, i) => {
            const name = m.display_name ?? "Unknown";
            return (
              <View
                key={m.user_id}
                style={[STYLES.memberRow, i > 0 && STYLES.memberDivider]}
              >
                <View
                  style={[
                    STYLES.avatar,
                    { backgroundColor: palette.tiles[i % palette.tiles.length] },
                  ]}
                >
                  <Text style={STYLES.avatarText}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={STYLES.memberName}>{name}</Text>
                {m.role === "owner" ? (
                  <View style={STYLES.pill}>
                    <Text style={STYLES.pillText}>Owner</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Text style={STYLES.sectionLabel}>Receipts</Text>
        <View style={STYLES.card}>
          {receipts.length === 0 ? (
            <Text style={STYLES.emptyText}>Receipts will show up here.</Text>
          ) : (
            receipts.map((r, i) => (
              <View
                key={r.id}
                style={[STYLES.receiptRow, i > 0 && STYLES.memberDivider]}
              >
                <Text style={STYLES.memberName}>{r.title}</Text>
                <Text style={STYLES.amount}>{formatCents(r.total_cents)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
 * Stylesheet for the Group details screen.
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