/* eslint-disable @typescript-eslint/naming-convention */

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Toast, ToastType } from "@/components/toast";
import { JSX } from "react/jsx-runtime";

import { useAuth } from "@/lib/auth-provider";
import { loadGroupDetail } from "@/lib/group-data";
import { isGroupOwner } from "@/lib/group-members";
import { deleteGroup, leaveGroup } from "@/lib/groups";
import { palette } from "@/lib/palette";
import { supabase } from "@/lib/supabase";

import { AddReceiptModal } from "@/components/add-receipt-modal";
import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { ConfirmCardModal } from "@/components/confirm-card-modal";
import { EditGroupModal } from "@/components/edit-group-modal";
import { ReceiptCameraSheet } from "@/components/receipt-camera-sheet";
import {
  formatCents,
  type ReceiptDraft,
  type ReceiptStatus,
} from "@/lib/receipt-form";
import { scanReceiptPhoto } from "@/lib/scan-flow";
import { checkReceipt, type ReceiptCheck } from "@/lib/scan-receipt";
import { scannedToDraft } from "@/lib/scanned-to-draft";
import { deleteReceipt, saveReceipt } from "@/lib/receipts";

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
  status?: ReceiptStatus;
  draft?: ReceiptDraft;
};

type GroupDetail = {
  group: {
    id: string;
    name: string;
    invite_code?: string;
    created_by: string;
    created_at: string;
  };
  members: Member[];
  receipts: Receipt[]; // empty until sprint 2
};

/**
 * Detailed view of a group showing members and receipts.
 * @returns JSX element
 */
export default function GroupScreen(): JSX.Element {
  const { id, toastMessage, toastType, toastKey } = useLocalSearchParams<{
    id: string;
    toastMessage?: string;
    toastType?: string;
    toastKey?: string;
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
  }, [toastMessage, toastType, toastKey]);

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [addReceiptVisible, setAddReceiptVisible] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editSession, setEditSession] = useState(0);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [scanDraft, setScanDraft] = useState<ReceiptDraft | null>(null);
  const [scanCheck, setScanCheck] = useState<{
    check: ReceiptCheck;
    currency: string | null;
  } | null>(null);
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const [scanSession, setScanSession] = useState(0);
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const [refreshing, setRefreshing] = useState(false);
  // True once a load succeeded, so later refreshes keep the page on screen.
  const hasDetailRef = useRef(false);
  // The ref blocks a second tap before the state update re-renders.
  const groupActionBusyRef = useRef(false);
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [editGroupVisible, setEditGroupVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setForbidden(false);

    const result = await loadGroupDetail(id, {
      client: supabase,
    });

    if (result.status === "ok") {
      hasDetailRef.current = true;
      // Copy so in-place mock edits (e.g. a member removed) re-render.
      setDetail({ ...result.detail, members: [...result.detail.members] });
    } else if (result.status === "forbidden") {
      // e.g. the owner removed this user (US 3.2).
      hasDetailRef.current = false;
      setForbidden(true);
      setDetail(null);
    } else if (hasDetailRef.current) {
      setToastState({ message: result.message, type: "error" });
    } else setError(result.message);

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  // Reload on every focus so members removed elsewhere disappear (US 3.2).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Optional live updates (US 3.2). Needs group_members in the
  // supabase_realtime publication; focus reload and pull-to-refresh work
  // without it.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel(`group-members-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${id}`,
        },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [id, load]);

  // Full-screen loader on the first load only; refreshes keep the page.
  if (loading && detail === null) {
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
        <Text style={STYLES.error}>
          Group not found. It may have been deleted, or you&apos;re no longer a
          member.
        </Text>
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
        <Pressable onPress={() => load()} style={STYLES.button}>
          <Text style={STYLES.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { group, members, receipts } = detail;
  const isOwner = isGroupOwner(detail, currentUserId);
  const currentMember = members.find((m) => m.user_id === currentUserId);
  const canLeave = !isOwner && currentMember !== undefined;

  /**
   * Navigates back to the group list after leaving or deleting a group.
   * @param message Confirmation toast message
   */
  const navigateAfterGroupRemoval = (message: string): void => {
    const href = {
      pathname: "/" as const,
      params: {
        toastMessage: message,
        toastType: "success",
        removedGroupId: group.id,
        // Makes the same message show again for a second leave/delete.
        toastKey: String(Date.now()),
      },
    };
    // dismissTo pops back to the existing list; replace covers deep links
    // where the group screen is the only screen on the stack.
    if (router.canGoBack()) router.dismissTo(href);
    else router.replace(href);
  };

  /**
   * Executes group deletion (owner only) after confirmation in EditGroupModal.
   */
  const executeDeleteGroup = async (): Promise<void> => {
    if (groupActionBusyRef.current) return;
    groupActionBusyRef.current = true;
    setGroupActionBusy(true);

    try {
      const userId = currentUserId;
      if (!userId) {
        setToastState({ message: "Sign in to delete this group.", type: "error" });
        return;
      }
      const result = await deleteGroup(group.id);

      setEditGroupVisible(false);

      if (!result.success) {
        setToastState({ message: result.message, type: "error" });
        return;
      }

      navigateAfterGroupRemoval(`${group.name} deleted`);
    } finally {
      groupActionBusyRef.current = false;
      setGroupActionBusy(false);
    }
  };

  /**
   * Executes leaving a group (non-owner member) after confirmation card prompt.
   */
  const executeLeaveGroup = async (): Promise<void> => {
    if (groupActionBusyRef.current) return;
    groupActionBusyRef.current = true;
    setGroupActionBusy(true);

    try {
      const userId = currentUserId;
      if (!userId) {
        setToastState({ message: "Sign in to leave this group.", type: "error" });
        return;
      }
      const result = await leaveGroup(group.id);

      setLeaveConfirmVisible(false);

      if (!result.success) {
        setToastState({ message: result.message, type: "error" });
        return;
      }

      navigateAfterGroupRemoval(`Left ${group.name}`);
    } finally {
      groupActionBusyRef.current = false;
      setGroupActionBusy(false);
    }
  };

  /**
   * Updates local group header state and displays a toast when renamed.
   * @param newName Updated group name
   * @param message Toast feedback message
   */
  const handleGroupRenamed = (newName: string, message: string): void => {
    setDetail((prev) =>
      prev ? { ...prev, group: { ...prev.group, name: newName } } : prev
    );
    setToastState({ message, type: "success" });
  };

  /**
   * Opens the receipt entry form for this group.
   */
  const handleAddReceipt = (): void => {
    setEditingReceipt(null);
    setScanDraft(null);
    setScanCheck(null);
    setScanConfidence(null);
    setScanNotes([]);
    setAddReceiptVisible(true);
  };

  /** Opens the in-app camera sheet for a new receipt. */
  const handleScanReceipt = (): void => {
    setEditingReceipt(null);
    setScanDraft(null);
    setScanCheck(null);
    setScanConfidence(null);
    setScanNotes([]);
    setCameraVisible(true);
  };

  /**
   * Scans a confirmed photo and opens the receipt review form.
   * @param base64 Image data without a data URI prefix
   */
  const handleScanPhoto = async (base64: string): Promise<void> => {
    const scan = await scanReceiptPhoto(base64, supabase);
    const converted = scannedToDraft(scan);
    setScanDraft(converted.draft);
    setScanCheck({ check: checkReceipt(scan), currency: scan.currency });
    setScanConfidence(scan.confidence);
    setScanNotes(converted.notes);
    setScanSession((n) => n + 1);
    setCameraVisible(false);
    setAddReceiptVisible(true);
  };

  /**
   * Opens a saved draft in the form so it can be edited.
   * @param receipt The draft to edit
   */
  const handleEditDraft = (receipt: Receipt): void => {
    setEditingReceipt(receipt);
    setEditSession((n) => n + 1);
    setAddReceiptVisible(true);
  };

  /**
   * Saves the entered receipt (or the edited draft) and updates the list.
   * @param draft The receipt as entered in the form
   * @param status Save as a draft or submit
   * @returns An error message, or null when the save worked
   */
  const handleSaveReceipt = async (
    draft: ReceiptDraft,
    status: ReceiptStatus
  ): Promise<string | null> => {
    const result = await saveReceipt(group.id, draft, status, {
      existingId: scanDraft === null ? editingReceipt?.id : undefined,
    });
    if (result.status === "error") return result.message;

    const saved: Receipt = result.receipt;
    setDetail((prev) => {
      if (prev === null) return prev;
      const exists = prev.receipts.some((r) => r.id === saved.id);
      const next = exists
        ? prev.receipts.map((r) => (r.id === saved.id ? saved : r))
        : [saved, ...prev.receipts];
      return { ...prev, receipts: next };
    });
    setAddReceiptVisible(false);
    setScanDraft(null);
    setScanCheck(null);
    setScanConfidence(null);
    setScanNotes([]);
    setEditingReceipt(null);

    let message = "Draft saved.";
    if (status === "submitted") message = "Receipt submitted.";
    else if (editingReceipt !== null) message = "Draft updated.";
    setToastState({ message, type: "success" });
    return null;
  };

  /**
   * Closes the form. When a saved draft is open, deletes it from the group.
   */
  const handleDeleteReceipt = async (): Promise<void> => {
    const target = editingReceipt;
    setAddReceiptVisible(false);
    setScanDraft(null);
    setScanCheck(null);
    setScanConfidence(null);
    setScanNotes([]);
    setEditingReceipt(null);
    if (target === null) return;

    const result = await deleteReceipt(group.id, target.id);
    if (result.status === "error") {
      setToastState({ message: result.message, type: "error" });
      return;
    }
    setDetail((prev) =>
      prev === null
        ? prev
        : { ...prev, receipts: prev.receipts.filter((r) => r.id !== target.id) }
    );
    setEditingReceipt(null);
    setToastState({ message: "Draft deleted.", type: "success" });
  };

  return (
    <View style={STYLES.container}>
      <ScrollView
        style={STYLES.screen}
        contentContainerStyle={STYLES.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
      >
        <View style={STYLES.header}>
          <View style={STYLES.titleRow}>
            <Text style={STYLES.title}>{group.name}</Text>
            {isOwner ? (
              <Pressable
                onPress={() => setEditGroupVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit group"
                style={({ pressed }) => [
                  STYLES.editGroupButton,
                  pressed && STYLES.addButtonPressed,
                ]}
              >
                <Text style={STYLES.editGroupButtonText}>Edit group</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={STYLES.subtitle}>
            {members.length} {members.length === 1 ? "member" : "members"}
          </Text>
        </View>

        {group.invite_code ? (
          <View style={STYLES.inviteCard}>
            <View style={STYLES.inviteInfo}>
              <Text style={STYLES.inviteLabel}>Invite code</Text>
              <Text selectable style={STYLES.inviteCode}>
                {group.invite_code}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Share.share({
                  message: `Join "${group.name}" with invite code: ${group.invite_code}`,
                }).catch(() => {});
              }}
              accessibilityRole="button"
              accessibilityLabel="Share invite code"
              style={({ pressed }) => [
                STYLES.scanButton,
                pressed && STYLES.addButtonPressed,
              ]}
            >
              <Text style={STYLES.pillText}>Share</Text>
            </Pressable>
          </View>
        ) : null}

        {isOwner ? (
          <View style={STYLES.sectionHeaderRow}>
            <Text style={STYLES.sectionLabelFlush}>
              Members ({members.length})
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/remove-members",
                  params: { from: group.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Remove members"
              style={({ pressed }) => [
                STYLES.scanButton,
                pressed && STYLES.addButtonPressed,
              ]}
            >
              <Text style={STYLES.pillText}>Remove members</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={STYLES.sectionLabel}>Members ({members.length})</Text>
        )}
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

        <View style={STYLES.sectionHeaderRow}>
          <Text style={STYLES.sectionLabelFlush}>Receipts</Text>
          <View style={STYLES.headerButtons}>
            <Pressable
              onPress={handleScanReceipt}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt"
              style={({ pressed }) => [
                STYLES.scanButton,
                pressed && STYLES.addButtonPressed,
              ]}
            >
              <Text style={STYLES.pillText}>Scan</Text>
            </Pressable>
            <Pressable
              onPress={handleAddReceipt}
              accessibilityRole="button"
              accessibilityLabel="Add receipt"
              style={({ pressed }) => [
                STYLES.addButton,
                pressed && STYLES.addButtonPressed,
              ]}
            >
              <Text style={STYLES.addButtonText}>+ Add receipt</Text>
            </Pressable>
          </View>
        </View>
        <View style={STYLES.card}>
          {receipts.length === 0 ? (
            <Text style={STYLES.emptyText}>Receipts will show up here.</Text>
          ) : (
            receipts.map((r, i) => {
              const rowStyle = [STYLES.receiptRow, i > 0 && STYLES.memberDivider];
              const content = (
                <>
                  <View style={STYLES.receiptInfo}>
                    <Text style={STYLES.memberName}>{r.title}</Text>
                    {r.status !== "draft" ? (
                      <Text style={STYLES.receiptActionHint}>Tap to view & share ›</Text>
                    ) : null}
                  </View>
                  {r.status === "draft" ? (
                    <View style={STYLES.pill}>
                      <Text style={STYLES.pillText}>Draft</Text>
                    </View>
                  ) : null}
                  <Text style={STYLES.amount}>{formatCents(r.total_cents)}</Text>
                </>
              );

              return r.status === "draft" ? (
                <Pressable
                  key={r.id}
                  onPress={() => handleEditDraft(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit draft ${r.title}`}
                  style={({ pressed }) => [...rowStyle, pressed && STYLES.addButtonPressed]}
                >
                  {content}
                </Pressable>
              ) : (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/(app)/(home)/receipts/${r.id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`View receipt ${r.title}`}
                  style={({ pressed }) => [...rowStyle, pressed && STYLES.addButtonPressed]}
                >
                  {content}
                </Pressable>
              );
            })
          )}
        </View>

        {canLeave ? (
          <Pressable
            onPress={() => setLeaveConfirmVisible(true)}
            disabled={groupActionBusy}
            accessibilityRole="button"
            accessibilityLabel="Leave Group"
            accessibilityState={{ disabled: groupActionBusy, busy: groupActionBusy }}
            style={({ pressed }) => [
              STYLES.groupActionButton,
              (pressed || groupActionBusy) && STYLES.addButtonPressed,
            ]}
          >
            {groupActionBusy ? (
              <ActivityIndicator color={palette.error} />
            ) : (
              <Text style={STYLES.groupActionText}>Leave Group</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <EditGroupModal
        visible={editGroupVisible}
        groupId={group.id}
        groupName={group.name}
        userId={currentUserId ?? ""}
        deleting={groupActionBusy}
        onClose={() => setEditGroupVisible(false)}
        onRenamed={handleGroupRenamed}
        onDelete={executeDeleteGroup}
      />
      <ConfirmCardModal
        visible={leaveConfirmVisible}
        title="Leave Group"
        message={`Are you sure you want to leave ${group.name}?`}
        confirmLabel="Leave"
        destructive
        busy={groupActionBusy}
        onCancel={() => {
          if (!groupActionBusy) setLeaveConfirmVisible(false);
        }}
        onConfirm={() => {
          void executeLeaveGroup();
        }}
      />
      <AddReceiptModal
        key={
          scanDraft !== null
            ? `scan-${scanSession}`
            : editingReceipt === null
              ? "new"
              : `edit-${editSession}`
        }
        visible={addReceiptVisible}
        onClose={() => {
          setAddReceiptVisible(false);
          setScanDraft(null);
          setScanCheck(null);
          setScanConfidence(null);
          setScanNotes([]);
        }}
        onSubmit={(draft) => handleSaveReceipt(draft, "submitted")}
        onSaveDraft={(draft) => handleSaveReceipt(draft, "draft")}
        onDelete={handleDeleteReceipt}
        initialDraft={scanDraft ?? editingReceipt?.draft ?? null}
        title={scanDraft !== null ? "Review scan" : undefined}
        scanCheck={scanCheck}
        scanConfidence={scanConfidence}
        scanNotes={scanNotes}
      />
      {cameraVisible ? (
        <ReceiptCameraSheet
          visible
          onClose={() => setCameraVisible(false)}
          onPhoto={handleScanPhoto}
        />
      ) : null}
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
  content: { padding: 24, paddingBottom: BOTTOM_TAB_CLEARANCE, gap: 10 },
  header: { gap: 6, marginBottom: 8 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  editGroupButton: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  editGroupButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.text,
  },
  inviteCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inviteInfo: {
    flex: 1,
    gap: 2,
  },
  inviteLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: palette.muted,
  },
  inviteCode: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 2,
    color: palette.text,
  },
  title: { flex: 1, fontSize: 30, fontWeight: "800", color: palette.text },
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
  headerButtons: { flexDirection: "row", gap: 8 },
  scanButton: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 8,
  },
  receiptInfo: {
    flex: 1,
    gap: 2,
  },
  receiptActionHint: {
    fontSize: 12,
    color: palette.accent,
    fontWeight: "500",
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  sectionLabelFlush: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.muted,
  },
  addButton: {
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  addButtonPressed: { opacity: 0.7 },
  addButtonText: { color: "white", fontSize: 13, fontWeight: "700" },
  groupActionButton: {
    marginTop: 28,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.error,
    backgroundColor: palette.card,
  },
  groupActionText: { fontSize: 16, fontWeight: "700", color: palette.error },
});
