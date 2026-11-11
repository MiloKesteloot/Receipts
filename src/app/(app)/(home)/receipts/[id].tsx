/* eslint-disable @typescript-eslint/naming-convention */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JSX } from "react/jsx-runtime";

import { Toast, ToastType } from "@/components/toast";
import { useAuth } from "@/lib/auth-provider";
import { isGuestClaimKey, toClaimableItems, type ItemShares } from "@/lib/claims";
import { MOCK_CURRENT_USER_ID } from "@/lib/create-group";
import { loadGroupDetail } from "@/lib/group-data";
import {
  createGuestClaimLink,
  createGuestClaimToken,
  formatClaimUrl,
} from "@/lib/guest-claim";
import {
  mockGroupDetails,
  mockGuestTokens,
  mockReceiptItems,
  USE_MOCK,
} from "@/lib/mock";
import { palette } from "@/lib/palette";
import { SUPABASE } from "@/lib/supabase";
import { useClaims } from "@/lib/use-claims";

/** Delay in ms after closing share sheet to allow animations to settle. */
const SHARE_SHEET_CLOSE_DELAY_MS = 500;

/** One line item as loaded. The price is validated before claiming. */
type ReceiptLine = { id: string; name: string; amount_cents: unknown };

/** What the screen shows about the receipt itself. */
type ScreenReceipt = {
  /** Guest share token, or "" if one couldn't be made. */
  token: string;
  title: string;
  total_cents: number;
  items: ReceiptLine[];
};

type LoadResult =
  | {
      status: "ok";
      receipt: ScreenReceipt;
      /** The receipt's group, needed to claim. Undefined if unknown. */
      groupId: string | undefined;
      /** Member display names by user id. */
      memberNames: Record<string, string>;
    }
  | { status: "error"; message: string };

/**
 * Formats monetary amounts from cents to dollars string.
 * @param cents Amount in cents
 * @returns Formatted currency string
 */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Loads a receipt for a signed-in member, with its group and the group's
 * member names. Members always load directly (not through the guest token),
 * so the group id comes from the receipt itself and the rows shown are the
 * ones member RLS allows, the same rows claiming uses.
 * @param id Receipt id
 * @param token Guest share token for the share card, or "" if none
 * @returns The receipt, its group and names, or an error message
 */
async function loadMemberReceipt(id: string, token: string): Promise<LoadResult> {
  if (USE_MOCK || !SUPABASE) {
    const group = Object.values(mockGroupDetails).find((g) =>
      g.receipts.some((r) => r.id === id)
    );
    const match = group?.receipts.find((r) => r.id === id);
    if (!group && !token) return { status: "error", message: "Receipt not found." };

    return {
      status: "ok",
      receipt: {
        token,
        title: match?.title ?? "Receipt",
        total_cents: match?.total_cents ?? 0,
        items: mockReceiptItems[id] ?? [],
      },
      groupId: group?.group.id,
      memberNames: Object.fromEntries(
        (group?.members ?? []).map((m) => [m.user_id, m.display_name ?? "Member"])
      ),
    };
  }

  const { data: rRow, error: rError } = await SUPABASE
    .from("receipts")
    .select("id, title, total_cents, created_at, group_id, status")
    .eq("id", id)
    .single();
  if (rError || !rRow) {
    return { status: "error", message: rError?.message ?? "Receipt not found." };
  }

  const { data: itemsData, error: itemsError } = await SUPABASE
    .from("receipt_items")
    .select("id, receipt_id, name, amount_cents, created_at")
    .eq("receipt_id", id)
    .order("created_at", { ascending: true });
  if (itemsError) return { status: "error", message: itemsError.message };

  // Names for everyone in the group, so a claim made after this load still
  // has a name. A failure here only costs the names.
  const groupId = String(rRow.group_id);
  const group = await loadGroupDetail(groupId, {
    useMock: false,
    client: SUPABASE,
  });
  const memberNames =
    group.status === "ok"
      ? Object.fromEntries(
          group.detail.members.map((m) => [m.user_id, m.display_name ?? "Member"])
        )
      : {};

  return {
    status: "ok",
    receipt: {
      token,
      title: rRow.title,
      total_cents: Number(rRow.total_cents),
      items: (itemsData ?? []).map((item) => ({
        id: String(item.id),
        name: item.name,
        amount_cents: item.amount_cents,
      })),
    },
    groupId,
    memberNames,
  };
}

/**
 * Receipt screen: members tap items to claim them (US 2.3), see shared items
 * split to the cent, and see their running total. Also shares the guest
 * claim link (US 2.5).
 * @returns JSX element
 */
export default function ReceiptScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  // Mock data only knows the placeholder user (see create-group.ts).
  const userId = USE_MOCK ? MOCK_CURRENT_USER_ID : session?.user.id;
  const insets = useSafeAreaInsets();
  // On iOS each native tab has its own safe area, which includes the tab bar.
  // Android already pads the tab's content above the tab bar.
  const bottomInset = Platform.OS === "ios" ? insets.bottom : 0;

  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Gets (or makes) the guest share token, then loads the receipt.
   */
  const loadReceiptData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorMessage(null);

    // 1. Try to obtain or create a guest claim token for sharing
    let token: string | null = null;
    try {
      token = mockGuestTokens.find((t) => t.receipt_id === id)?.token ?? null;
      if (!token) {
        token = await createGuestClaimToken(id);
      }
    } catch {
      // Guest token generation is optional for viewing the receipt in-app
    }

    if (token) {
      const url = formatClaimUrl(token);
      setClaimUrl(url);
    }

    // 2. Load the receipt as a member (the token is only for sharing)
    try {
      const result = await loadMemberReceipt(id, token ?? "");
      if (result.status === "ok") {
        setReceipt(result.receipt);
        setGroupId(result.groupId);
        setMemberNames(result.memberNames);
      } else {
        setReceipt(null);
        setErrorMessage(result.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load receipt";
      setErrorMessage(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReceiptData();
  }, [loadReceiptData]);

  // Memoized so useClaims only reloads when the items change.
  const claimable = useMemo(
    () => toClaimableItems(receipt?.items ?? []).items,
    [receipt]
  );
  const {
    claims,
    loading: claimsLoading,
    error: claimError,
    inFlightItemIds,
    sharesByItem,
    myTotal,
    toggle,
  } = useClaims(claimable, groupId, userId);

  useEffect(() => {
    if (claimError) setToast({ message: claimError, type: "error" });
  }, [claimError]);

  // Guests have no profile, so their names come from their claims.
  const guestNames = useMemo(
    () =>
      Object.fromEntries(
        claims
          .filter((c) => c.guestName !== undefined)
          .map((c) => [c.userId, c.guestName as string])
      ),
    [claims]
  );

  /**
   * The name to show for a claim key.
   * @param key A member's user id or a guest claim key
   * @returns "You", the member's name, or the guest's name marked as a guest
   */
  const nameFor = (key: string): string => {
    if (key === userId) return "You";
    if (isGuestClaimKey(key)) return `${guestNames[key] ?? "Guest"} (Guest)`;
    return memberNames[key] ?? "Member";
  };

  /**
   * The line under an item's name: who claimed it and what each pays.
   * @param shares The item's shares from useClaims
   * @returns The text to show
   */
  const claimSummary = (shares: ItemShares): string => {
    if (shares.claimedBy.length === 0) return "Tap to claim";
    if (!shares.isShared) return nameFor(shares.claimedBy[0]);
    return shares.shares
      .map((share) => `${nameFor(share.userId)} ${formatCents(share.cents)}`)
      .join(" · ");
  };

  /**
   * Generates or retrieves the claim link and triggers the native share sheet.
   */
  async function handleShare(): Promise<void> {
    if (sharing || !id) return;
    setSharing(true);

    try {
      let url = claimUrl;
      if (!url) {
        setGeneratingLink(true);
        url = await createGuestClaimLink(id);
        setClaimUrl(url);
      }

      const receiptTitle = receipt?.title ?? "Receipt";
      const message = `Claim your items on "${receiptTitle}" without an account:\n${url}`;

      await Share.share({
        message,
        url,
        title: `Claim items on ${receiptTitle}`,
      });
    } catch {
      setToast({
        message: "Couldn't open sharing sheet. You can use 'Copy Link' instead.",
        type: "error",
      });
    } finally {
      setGeneratingLink(false);
      await new Promise((resolve) =>
        setTimeout(resolve, SHARE_SHEET_CLOSE_DELAY_MS)
      );
      setSharing(false);
    }
  }

/**
 * Copies text to system clipboard on web or triggers share fallback.
 * @param text Text string to copy
 * @returns Promise resolving to boolean success
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // On platforms where navigator.clipboard is unavailable, share provides copy option
  await Share.share({ message: text });
  return true;
}

  /**
   * Copies the guest claim URL to the clipboard and triggers a confirmation toast.
   */
  async function handleCopyLink(): Promise<void> {
    if (!id) return;
    try {
      let url = claimUrl;
      if (!url) {
        url = await createGuestClaimLink(id);
        setClaimUrl(url);
      }
      await copyToClipboard(url);
      setToast({
        message: "Claim link copied to clipboard!",
        type: "success",
      });
    } catch {
      setToast({
        message: "Failed to copy link to clipboard",
        type: "error",
      });
    }
  }

  if (loading) {
    return (
      <View style={STYLES.center}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={STYLES.center}>
        <Text style={STYLES.errorText}>{errorMessage || "Receipt not found."}</Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={STYLES.actionButton}
        >
          <Text style={STYLES.actionButtonText}>Go back</Text>
        </Pressable>
        {toast ? (
          <Toast
            visible={Boolean(toast)}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={STYLES.container}>
      <ScrollView contentContainerStyle={STYLES.content}>
        {/* Receipt Header */}
        <View style={STYLES.headerCard}>
          <Text style={STYLES.eyebrow}>Receipt Details</Text>
          <Text style={STYLES.receiptTitle}>{receipt.title}</Text>
          <Text style={STYLES.totalAmount}>
            {formatCents(receipt.total_cents)}
          </Text>
        </View>

        {/* Share with Guests Card */}
        <View style={STYLES.shareCard}>
          <View style={STYLES.shareHeader}>
            <Text style={STYLES.shareTitle}>Guest Claim Link</Text>
            <View style={STYLES.noAccountBadge}>
              <Text style={STYLES.noAccountBadgeText}>No account required</Text>
            </View>
          </View>

          <Text style={STYLES.shareDescription}>
            Send this link to friends or guests so they can open this receipt in
            any browser and claim their items without signing up.
          </Text>

          {claimUrl ? (
            <View style={STYLES.linkPreviewBox}>
              <Text style={STYLES.linkText} numberOfLines={1} selectable>
                {claimUrl}
              </Text>
            </View>
          ) : null}

          <View style={STYLES.buttonRow}>
            <Pressable
              onPress={handleShare}
              disabled={sharing || generatingLink}
              style={({ pressed }) => [
                STYLES.primaryShareButton,
                (pressed || sharing) && STYLES.pressed,
              ]}
            >
              {generatingLink ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={STYLES.primaryShareButtonText}>
                  Share Claim Link
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleCopyLink}
              style={({ pressed }) => [
                STYLES.copyButton,
                pressed && STYLES.pressed,
              ]}
            >
              <Text style={STYLES.copyButtonText}>Copy Link</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              if (receipt.token) {
                router.push(`/claim/${receipt.token}` as never);
              }
            }}
            style={({ pressed }) => [
              STYLES.previewButton,
              pressed && STYLES.pressed,
            ]}
          >
            <Text style={STYLES.previewButtonText}>
              Open Guest Claim Web Page ›
            </Text>
          </Pressable>
        </View>

        {/* Items Section */}
        <View style={STYLES.sectionHeaderRow}>
          <Text style={STYLES.sectionLabel}>
            Line Items ({receipt.items.length})
          </Text>
          {claimsLoading && claimable.length > 0 && groupId !== undefined ? (
            <Text style={STYLES.loadingHint}>Loading claims…</Text>
          ) : null}
        </View>

        <View style={STYLES.itemsCard}>
          {receipt.items.length === 0 ? (
            <Text style={STYLES.emptyText}>No items added to this receipt yet.</Text>
          ) : (
            receipt.items.map((item, idx) => {
              const shares = sharesByItem[item.id];
              // Items with a bad price aren't claimable (see toClaimableItems).
              if (!shares) {
                return (
                  <View
                    key={item.id}
                    style={[STYLES.itemRow, idx > 0 && STYLES.itemDivider]}
                  >
                    <View style={STYLES.itemMain}>
                      <Text style={STYLES.itemName}>{item.name}</Text>
                      <Text style={STYLES.unclaimedText}>
                        Price unavailable, can&apos;t be claimed
                      </Text>
                    </View>
                  </View>
                );
              }

              const isMine = userId !== undefined && shares.claimedBy.includes(userId);
              const inFlight = inFlightItemIds.has(item.id);
              const priceCents = claimable.find((c) => c.id === item.id)?.priceCents ?? 0;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    // The hook updates the screen itself; nothing to wait for.
                    void toggle(item.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isMine, busy: inFlight }}
                  accessibilityLabel={`${isMine ? "Unclaim" : "Claim"} ${item.name}`}
                  style={({ pressed }) => [
                    STYLES.itemRow,
                    idx > 0 && STYLES.itemDivider,
                    isMine && STYLES.itemRowMine,
                    (pressed || inFlight) && STYLES.pressed,
                  ]}
                >
                  <View style={STYLES.itemMain}>
                    <View style={STYLES.itemTitleRow}>
                      <Text style={STYLES.itemName}>{item.name}</Text>
                      {isMine ? (
                        <View style={STYLES.mineBadge}>
                          <Text style={STYLES.mineBadgeText}>✓ Mine</Text>
                        </View>
                      ) : null}
                      {shares.isShared ? (
                        <View style={STYLES.sharedBadge}>
                          <Text style={STYLES.sharedBadgeText}>Shared</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={
                        shares.claimedBy.length === 0
                          ? STYLES.unclaimedText
                          : STYLES.claimantText
                      }
                    >
                      {claimSummary(shares)}
                    </Text>
                  </View>

                  <View style={STYLES.itemPricing}>
                    <Text style={STYLES.itemAmount}>{formatCents(priceCents)}</Text>
                    {inFlight ? (
                      <ActivityIndicator size="small" color={palette.accent} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Running total (US 2.3 Task 5) */}
      {claimable.length > 0 ? (
        <View
          style={[STYLES.totalBar, { paddingBottom: 14 + bottomInset }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={STYLES.totalBarText}>
            {myTotal.claimedCount === 0
              ? "Tap items you bought to claim them"
              : `Your total ${formatCents(myTotal.totalCents)} · ${myTotal.claimedCount} ${
                  myTotal.claimedCount === 1 ? "item" : "items"
                }`}
          </Text>
        </View>
      ) : null}

      {toast ? (
        <Toast
          visible={Boolean(toast)}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Styles for the receipt screen.
 */
const STYLES = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.bg,
    padding: 24,
    gap: 16,
  },
  headerCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  receiptTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: palette.accent,
    marginTop: 4,
  },
  shareCard: {
    backgroundColor: "#F7FAF8",
    borderWidth: 1.5,
    borderColor: "#D2E7D6",
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  shareHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3B22",
  },
  noAccountBadge: {
    backgroundColor: "#D9EEDC",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  noAccountBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2C6839",
  },
  shareDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  linkPreviewBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 13,
    color: "#4B5563",
    fontFamily: "monospace",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryShareButton: {
    flex: 1.4,
    backgroundColor: palette.accent,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryShareButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  copyButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.accent,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonText: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  previewButton: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  previewButtonText: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.muted,
    marginTop: 4,
  },
  itemsCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  itemMain: {
    flex: 1,
    gap: 6,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.text,
  },
  sharedBadge: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sharedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.accent,
  },
  unclaimedText: {
    fontSize: 13,
    color: palette.muted,
    fontStyle: "italic",
  },
  claimantText: {
    fontSize: 13,
    color: palette.text,
  },
  itemRowMine: {
    backgroundColor: palette.accentSoft,
    borderWidth: 1.5,
    borderColor: palette.accent,
    borderRadius: 12,
    marginHorizontal: -10,
    paddingHorizontal: 10,
  },
  mineBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mineBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.card,
  },
  itemPricing: {
    alignItems: "flex-end",
    gap: 4,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loadingHint: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 4,
  },
  totalBar: {
    backgroundColor: palette.card,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  totalBarText: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
    textAlign: "center",
  },
  emptyText: {
    paddingVertical: 20,
    color: palette.muted,
    fontSize: 15,
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: palette.error,
    textAlign: "center",
  },
  actionButton: {
    backgroundColor: palette.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
