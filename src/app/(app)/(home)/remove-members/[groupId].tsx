import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { Toast, ToastType } from "@/components/toast";
import { useAuth } from "@/lib/auth-provider";
import { confirmAction } from "@/lib/confirm-action";
import { loadGroupDetail, type GroupDetail } from "@/lib/group-data";
import {
  isGroupOwner,
  removableMembers,
  removeGroupMembers,
  type RemoveFailure,
} from "@/lib/group-members";
import { palette } from "@/lib/palette";
import { supabase } from "@/lib/supabase";

/**
 * Display name for a member, with a fallback when they have none.
 * @param name The member's display name
 * @returns The name to show
 */
const nameOf = (name: string | null): string => name ?? "Unknown";

/**
 * Joins names as "A", "A and B", or "A, B and C".
 * @param names Names to join
 * @returns The joined names
 */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Builds the error toast text naming who couldn't be removed and why.
 * @param failed The failures from removeGroupMembers
 * @param nameFor Looks up a member's display name by id
 * @returns The toast message
 */
function failureMessage(
  failed: RemoveFailure[],
  nameFor: (userId: string) => string
): string {
  const reasons = new Set(failed.map((f) => f.message));
  if (reasons.size === 1) {
    return `Couldn't remove ${joinNames(failed.map((f) => nameFor(f.userId)))}: ${failed[0].message}`;
  }
  return `Couldn't remove ${failed
    .map((f) => `${nameFor(f.userId)} (${f.message})`)
    .join(", ")}`;
}

/**
 * Member checklist (US 3.2 Tasks 4 & 5): the owner ticks members and removes
 * them. Everyone else sees a message and no controls, even via a direct link.
 * @returns JSX element
 */
export default function RemoveMembersScreen(): JSX.Element {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id;

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // The ref blocks a second tap before the state update re-renders.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  // True once a load succeeded, so a later failed refresh keeps the list.
  const hasDetailRef = useRef(false);
  const [toastState, setToastState] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadGroupDetail(groupId, {
      client: supabase,
    });

    if (result.status === "ok") {
      hasDetailRef.current = true;
      setForbidden(false);
      // Copy so member updates trigger a re-render.
      setDetail({ ...result.detail, members: [...result.detail.members] });
      // Drop picks for anyone who is no longer removable.
      const stillRemovable = new Set(
        removableMembers(result.detail.members, currentUserId).map(
          (m) => m.user_id
        )
      );
      setSelected((prev) => prev.filter((id) => stillRemovable.has(id)));
    } else if (result.status === "forbidden") {
      hasDetailRef.current = false;
      setForbidden(true);
      setDetail(null);
      setSelected([]);
    } else if (hasDetailRef.current) {
      // Keep the list on screen; just say the refresh failed.
      setToastState({ message: result.message, type: "error" });
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [groupId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading && detail === null && !forbidden) {
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (forbidden) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>You&apos;re not a member of this group.</Text>
        <GoBackButton />
      </View>
    );
  }

  if (detail === null) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>{error ?? "Group not found"}</Text>
        <Pressable onPress={() => load()} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!isGroupOwner(detail, currentUserId)) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.error}>Only the group owner can remove members.</Text>
        <GoBackButton />
      </View>
    );
  }

  const { group, members } = detail;
  const removableIds = new Set(
    removableMembers(members, currentUserId).map((m) => m.user_id)
  );
  const count = selected.length;
  const canRemove = count > 0 && !busy;

  /**
   * Looks up a member's display name.
   * @param userId Member id
   * @returns Their name
   */
  const nameFor = (userId: string): string =>
    nameOf(members.find((m) => m.user_id === userId)?.display_name ?? null);

  /**
   * Ticks or unticks a removable member.
   * @param userId Member id
   */
  const toggle = (userId: string): void => {
    if (busy || !removableIds.has(userId)) return;
    setSelected((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  /**
   * Confirms, removes the ticked members, then shows the result and reloads.
   */
  const handleRemove = async (): Promise<void> => {
    if (busyRef.current) return;
    const targets = selected.filter((id) => removableIds.has(id));
    if (targets.length === 0) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const names = joinNames(targets.map(nameFor));
      const confirmed = await confirmAction(
        "Remove members",
        `Remove ${names} from ${group.name}? They'll lose access to this group and its receipts.`,
        "Remove"
      );
      if (!confirmed) return;

      const result = await removeGroupMembers(group.id, targets, currentUserId, {
        client: supabase,
        members,
      });

      if (result.failed.length === 0) {
        setToastState({
          message:
            result.removed.length === 1
              ? `Removed ${nameFor(result.removed[0])}`
              : `Removed ${result.removed.length} members`,
          type: "success",
        });
        setSelected([]);
      } else {
        setToastState({
          message: failureMessage(result.failed, nameFor),
          type: "error",
        });
        setSelected(result.failed.map((f) => f.userId));
      }
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={STYLES.container}>
      <ScrollView style={STYLES.screen} contentContainerStyle={STYLES.content}>
        <View style={STYLES.header}>
          <Text style={STYLES.eyebrow}>Remove members</Text>
          <Text style={STYLES.title}>{group.name}</Text>
          <Text style={STYLES.subtitle}>Select members to remove</Text>
        </View>

        <View style={STYLES.card}>
          {members.map((m, i) => {
            const name = nameOf(m.display_name);
            const avatar = (
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
            );

            if (!removableIds.has(m.user_id)) {
              return (
                <View
                  key={m.user_id}
                  style={[STYLES.memberRow, i > 0 && STYLES.divider]}
                >
                  {avatar}
                  <Text style={STYLES.memberName}>{name}</Text>
                  <View style={STYLES.pill}>
                    <Text style={STYLES.pillText}>
                      {m.role === "owner" ? "Owner" : "You"}
                    </Text>
                  </View>
                </View>
              );
            }

            const checked = selected.includes(m.user_id);
            return (
              <Pressable
                key={m.user_id}
                onPress={() => toggle(m.user_id)}
                disabled={busy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: busy }}
                accessibilityLabel={`Remove ${name}`}
                style={({ pressed }) => [
                  STYLES.memberRow,
                  i > 0 && STYLES.divider,
                  pressed && STYLES.pressed,
                ]}
              >
                {avatar}
                <Text style={STYLES.memberName}>{name}</Text>
                <Text style={STYLES.removeHint}>Remove</Text>
                <View style={[STYLES.checkbox, checked && STYLES.checkboxOn]}>
                  {checked ? <Text style={STYLES.checkmark}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {removableIds.size === 0 ? (
            <Text style={[STYLES.emptyText, STYLES.divider]}>
              No one else is in this group yet.
            </Text>
          ) : null}
        </View>

        {removableIds.size > 0 ? (
          <Pressable
            onPress={handleRemove}
            disabled={!canRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${count} selected`}
            accessibilityState={{ disabled: !canRemove, busy }}
            style={({ pressed }) => [
              STYLES.removeButton,
              (!canRemove || pressed) && STYLES.removeButtonDim,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={STYLES.removeButtonText}>Remove ({count})</Text>
            )}
          </Pressable>
        ) : null}
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
 * "Go back" button used by the forbidden and not-owner states.
 * @returns JSX element
 */
function GoBackButton(): JSX.Element {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={STYLES.button}
    >
      <Text style={STYLES.buttonText}>Go back</Text>
    </Pressable>
  );
}

/**
 * Styles for the member checklist, matching the group screen.
 */
const STYLES = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  screen: { backgroundColor: palette.bg },
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
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
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
  divider: { borderTopWidth: 1, borderTopColor: palette.border },
  pressed: { opacity: 0.7 },
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
  removeHint: { fontSize: 12, fontWeight: "600", color: palette.muted },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: palette.error, borderColor: palette.error },
  checkmark: { color: "white", fontSize: 14, fontWeight: "800" },
  emptyText: { paddingVertical: 16, color: palette.muted, fontSize: 15 },
  removeButton: {
    marginTop: 18,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.error,
  },
  removeButtonDim: { opacity: 0.5 },
  removeButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
});
