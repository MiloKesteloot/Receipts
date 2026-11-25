import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { CheckIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { SkeletonScreen } from "@/components/skeleton";
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
import { supabase } from "@/lib/supabase";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

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
  const styles = useStyles();
  const palette = useTheme();
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
      <SkeletonScreen paddingTop={16} />
    );
  }

  if (forbidden) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>You&apos;re not a member of this group.</Text>
        <GoBackButton />
      </View>
    );
  }

  if (detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Group not found"}</Text>
        <ScalePressable onPress={() => load()} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </ScalePressable>
      </View>
    );
  }

  if (!isGroupOwner(detail, currentUserId)) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Only the group owner can remove members.</Text>
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
    <View style={styles.container}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Remove members</Text>
          <Text style={styles.title}>{group.name}</Text>
          <Text style={styles.subtitle}>Select members to remove</Text>
        </View>

        <View style={styles.card}>
          {members.map((m, i) => {
            const name = nameOf(m.display_name);
            const avatar = (
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
            );

            if (!removableIds.has(m.user_id)) {
              return (
                <View
                  key={m.user_id}
                  style={[styles.memberRow, i > 0 && styles.divider]}
                >
                  {avatar}
                  <Text style={styles.memberName}>{name}</Text>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>
                      {m.role === "owner" ? "Owner" : "You"}
                    </Text>
                  </View>
                </View>
              );
            }

            const checked = selected.includes(m.user_id);
            return (
              <ScalePressable
                key={m.user_id}
                haptic="select"
                onPress={() => toggle(m.user_id)}
                disabled={busy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: busy }}
                accessibilityLabel={`Remove ${name}`}
                style={[styles.memberRow, i > 0 && styles.divider]}
              >
                {avatar}
                <Text style={styles.memberName}>{name}</Text>
                <Text style={styles.removeHint}>Remove</Text>
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked ? <CheckIcon size={14} color={palette.onAccent} strokeWidth={3} /> : null}
                </View>
              </ScalePressable>
            );
          })}
          {removableIds.size === 0 ? (
            <Text style={[styles.emptyText, styles.divider]}>
              No one else is in this group yet.
            </Text>
          ) : null}
        </View>

        {removableIds.size > 0 ? (
          <ScalePressable
            onPress={handleRemove}
            disabled={!canRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${count} selected`}
            accessibilityState={{ disabled: !canRemove, busy }}
            style={[styles.removeButton, !canRemove && styles.removeButtonDim]}
          >
            {busy ? (
              <ActivityIndicator color={palette.onAccent} />
            ) : (
              <Text style={styles.removeButtonText}>Remove ({count})</Text>
            )}
          </ScalePressable>
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
  const styles = useStyles();
  return (
    <ScalePressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={styles.button}
    >
      <Text style={styles.buttonText}>Go back</Text>
    </ScalePressable>
  );
}

/**
 * Styles for the member checklist, matching the group screen.
 */
const useStyles = createThemedStyles((palette) => ({
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
  removeButtonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  button: {
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  error: { color: palette.error, textAlign: "center" },
}));
