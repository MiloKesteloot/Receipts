/* eslint-disable @typescript-eslint/naming-convention */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Circle, Path, Svg } from "react-native-svg";
import { JSX } from "react/jsx-runtime";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { ClaimantBadge, type ClaimantRole } from "@/components/claimant-badge";
import { ConfirmCardModal } from "@/components/confirm-card-modal";
import { FinalSplitCard } from "@/components/final-split-card";
import { PayMeCard } from "@/components/pay-me-card";
import { PaymentsCard } from "@/components/payments-card";
import { Toast, ToastType } from "@/components/toast";
import { useAuth } from "@/lib/auth-provider";
import { isGuestClaimKey, toClaimableItems, type ItemShares } from "@/lib/claims";
import { finalizeReceipt } from "@/lib/finalize-receipt";
import { computeFinalSplit, findUnclaimedItems } from "@/lib/finalize-split";
import { loadGroupDetail } from "@/lib/group-data";
import {
  createGuestClaimLink,
  createGuestClaimToken,
  formatClaimUrl,
} from "@/lib/guest-claim";
import { palette } from "@/lib/palette";
import { countNudgeable, loadLastPayMe } from "@/lib/pay-me";
import type { PaymentActionResult } from "@/lib/payments";
import { computeSettlement, type Settlement, type SettlementPerson } from "@/lib/settlement";
import { SUPABASE } from "@/lib/supabase";
import { useClaims } from "@/lib/use-claims";
import { MY_SHARE_BUSY_KEY, usePayments } from "@/lib/use-payments";

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
  /** "submitted" or "finalized" (US 3.3); drafts don't open here. */
  status: string;
  /** The uploader, the only one who can finalize. */
  created_by: string;
  tax_cents: number;
  tip_cents: number;
  items: ReceiptLine[];
};

/**
 * Reads a stored amount in cents, treating anything invalid as 0.
 * @param value The value as loaded (bigint can arrive as a string)
 * @returns Whole cents
 */
function centsOrZero(value: unknown): number {
  const cents = Number(value);
  return Number.isInteger(cents) && cents >= 0 ? cents : 0;
}

/**
 * Formats the number of items still needing a claim.
 * @param count How many items are unclaimed
 * @returns E.g. "1 item still needs a claim"
 */
function unclaimedLabel(count: number): string {
  return count === 1
    ? "1 item still needs a claim"
    : `${count} items still need a claim`;
}

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

/** A payment action waiting on the in-app confirm card (US 3.4). */
type PendingPayment =
  | { kind: "markPaid"; amountCents: number }
  | { kind: "confirm"; payerKey: string; name: string; amountCents: number };

/**
 * The bottom bar's text on a finalized receipt (US 3.4).
 * @param settlement Everyone's payment status
 * @param me The signed-in user's share, if they have one
 * @param isUploader Whether the signed-in user uploaded the receipt
 * @param uploaderName The uploader's display name
 * @returns The text to show
 */
function finalizedBarText(
  settlement: Settlement | null,
  me: SettlementPerson | undefined,
  isUploader: boolean,
  uploaderName: string
): string {
  if (isUploader && settlement) {
    return settlement.settled
      ? "Everyone has paid you back"
      : `You're owed ${formatCents(settlement.outstandingCents)}`;
  }
  if (!me) return "You don't owe anything on this receipt";
  const amount = formatCents(me.owesCents);
  switch (me.status) {
    case "paid":
      return `You marked ${amount} as paid`;
    case "not_received":
      return `${uploaderName} didn't receive your ${amount}`;
    case "confirmed":
      return `Your ${amount} payment was confirmed`;
    case "nothing_owed":
      return "You don't owe anything on this receipt";
    default:
      return `You owe ${amount}`;
  }
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
  if (!SUPABASE) {
    return { status: "error", message: "Supabase client not initialized" };
  }

  const { data: rRow, error: rError } = await SUPABASE
    .from("receipts")
    .select("id, title, total_cents, tax_cents, tip_cents, created_at, created_by, group_id, status")
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
      status: String(rRow.status),
      created_by: String(rRow.created_by),
      tax_cents: centsOrZero(rRow.tax_cents),
      tip_cents: centsOrZero(rRow.tip_cents),
      items:(itemsData ?? []).map((item) => ({
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
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  // Floating bottom tab bubble height (~78px) + its safe-area margin + gap.
  const floatingTabOffset = Math.max(insets.bottom, 12) + 88;

  const [receipt, setReceipt] = useState<ScreenReceipt | null>(null);
  const [groupId, setGroupId] = useState<string | undefined>(undefined);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);

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
      token = await createGuestClaimToken(id);
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
   * Determines display label and role for a claimant key.
   * @param key A member's user id or a guest claim key
   * @returns Claimant role and display label
   */
  const badgeFor = (key: string): { role: ClaimantRole; name: string } => {
    if (key === userId) return { role: "you", name: "You" };
    if (isGuestClaimKey(key)) {
      return { role: "guest", name: `${guestNames[key] ?? "Guest"} (Guest)` };
    }
    return { role: "member", name: memberNames[key] ?? "Member" };
  };

  // Finalizing (US 3.3).
  const isFinalized = receipt?.status === "finalized";
  const isUploader = userId !== undefined && receipt?.created_by === userId;
  const canFinalize = receipt?.status === "submitted" && claimable.length > 0;
  const unclaimedCount = useMemo(
    () => findUnclaimedItems(claimable, claims).length,
    [claimable, claims]
  );
  const finalSplit = useMemo(
    () =>
      isFinalized && receipt
        ? computeFinalSplit({
            items: claimable,
            claims,
            taxCents: receipt.tax_cents,
            tipCents: receipt.tip_cents,
          })
        : null,
    [isFinalized, receipt, claimable, claims]
  );
  // Paying and confirming shares (US 3.4).
  const {
    payments,
    busyKey: paymentBusyKey,
    reload: reloadPayments,
    loading: paymentsLoading,
    markPaid,
    respond,
  } = usePayments(id, isFinalized);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const settlement = useMemo(
    () =>
      finalSplit?.status === "ok" && receipt
        ? computeSettlement(finalSplit.split, payments, receipt.created_by)
        : null,
    [finalSplit, payments, receipt]
  );
  const mySettlement = settlement?.people.find((p) => p.userId === userId);
  const uploaderName = receipt
    ? receipt.created_by === userId
      ? "You"
      : (memberNames[receipt.created_by] ?? "The uploader")
    : "The uploader";
  const isSettled = settlement?.settled === true;

  // Pay me (US 3.5): when the last one went out, so the countdown survives
  // reopening the screen. Only the uploader needs it.
  const [lastPayMeAt, setLastPayMeAt] = useState<string | null>(null);
  const refreshLastPayMe = useCallback(async () => {
    if (!id) return;
    const result = await loadLastPayMe(id);
    if (result.status === "ok") setLastPayMeAt(result.lastSentAt);
  }, [id]);
  useEffect(() => {
    if (isFinalized && isUploader) void refreshLastPayMe();
  }, [isFinalized, isUploader, refreshLastPayMe]);

  /**
   * Finalizes the receipt once the uploader confirms in the dialog. The
   * dialog stays open with a spinner until the request finishes.
   */
  async function handleFinalize(): Promise<void> {
    if (!id || finalizing) return;

    setFinalizing(true);
    try {
      const result = await finalizeReceipt(id);
      if (result.status === "ok") {
        setReceipt((current) => (current ? { ...current, status: "finalized" } : current));
        setToast({ message: "Receipt finalized.", type: "success" });
      } else if (result.status === "unclaimed") {
        setToast({ message: `Can't finalize yet: ${unclaimedLabel(result.unclaimedCount)}.`, type: "error" });
      } else {
        setToast({ message: result.message, type: "error" });
        if (result.error === "ALREADY_FINALIZED") void loadReceiptData();
      }
    } finally {
      setFinalizing(false);
      setConfirmingFinalize(false);
    }
  }

  /**
   * Shows a toast for a failed payment action.
   * @param result The action's result
   * @returns True if the action succeeded
   */
  function reportPaymentResult(result: PaymentActionResult): boolean {
    if (result.status === "ok") return true;
    setToast({ message: result.message, type: "error" });
    return false;
  }

  /**
   * Runs the payment action the user confirmed in the confirm card. The card
   * stays open with a spinner until the request finishes.
   */
  async function handleConfirmPayment(): Promise<void> {
    if (!pendingPayment || paymentBusyKey !== null) return;
    try {
      if (pendingPayment.kind === "markPaid") {
        if (reportPaymentResult(await markPaid())) {
          setToast({ message: "Marked as paid.", type: "success" });
        }
      } else {
        // Was this the last share left to settle?
        const lastOne =
          settlement?.outstandingCount === 1 &&
          settlement.people.some(
            (p) => p.userId === pendingPayment.payerKey && p.status !== "confirmed"
          );
        if (reportPaymentResult(await respond(pendingPayment.payerKey, true))) {
          setToast({
            message: lastOne ? "Receipt settled!" : "Payment confirmed.",
            type: "success",
          });
        }
      }
    } finally {
      setPendingPayment(null);
    }
  }

  /**
   * The uploader says a payment wasn't received.
   * @param payerKey Whose payment
   */
  async function handleNotReceived(payerKey: string): Promise<void> {
    if (reportPaymentResult(await respond(payerKey, false))) {
      setToast({ message: "Marked as not received.", type: "success" });
    }
  }

  /**
   * Pull to refresh: reloads the payments on a finalized receipt.
   */
  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await Promise.all([reloadPayments(), isUploader ? refreshLastPayMe() : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Renders color-coded claimant badges under an item's title.
   * @param shares The item's shares from useClaims
   * @returns Badges row or tap-to-claim hint
   */
  const renderClaimantBadges = (shares: ItemShares): JSX.Element => {
    if (shares.claimedBy.length === 0) {
      return <Text style={STYLES.unclaimedText}>Tap to claim</Text>;
    }
    if (!shares.isShared) {
      const info = badgeFor(shares.claimedBy[0]);
      return (
        <View style={STYLES.claimantsRow}>
          <ClaimantBadge role={info.role} label={info.name} />
        </View>
      );
    }
    return (
      <View style={STYLES.claimantsRow}>
        {shares.shares.map((share) => {
          const info = badgeFor(share.userId);
          return (
            <ClaimantBadge
              key={share.userId}
              role={info.role}
              label={`${info.name} ${formatCents(share.cents)}`}
            />
          );
        })}
      </View>
    );
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
      <ScrollView
        style={STYLES.scroll}
        contentContainerStyle={[
          STYLES.content,
          {
            paddingBottom:
              claimable.length > 0 ? 24 : BOTTOM_TAB_CLEARANCE + insets.bottom,
          },
        ]}
        refreshControl={
          isFinalized ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void handleRefresh();
              }}
              tintColor={palette.accent}
              colors={[palette.accent]}
            />
          ) : undefined
        }
      >
        {/* Receipt Header */}
        <View style={STYLES.headerCard}>
          <View style={STYLES.headerTopRow}>
            <Text style={STYLES.eyebrow}>Receipt Details</Text>
            {isFinalized ? (
              <View style={[STYLES.finalizedBadge, isSettled && STYLES.settledBadge]}>
                <Text style={STYLES.finalizedBadgeText}>
                  {isSettled ? "Settled" : "Finalized"}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={STYLES.receiptTitle}>{receipt.title}</Text>
          <Text style={STYLES.totalAmount}>
            {formatCents(receipt.total_cents)}
          </Text>
        </View>

        {/* Final split, once finalized (US 3.3) */}
        {finalSplit?.status === "ok" ? (
          <FinalSplitCard
            split={finalSplit.split}
            receiptTotalCents={receipt.total_cents}
            currentUserId={userId}
            nameFor={(key) => badgeFor(key).name}
          />
        ) : null}

        {/* Mark paid and confirm (US 3.4). Hidden until payments first load. */}
        {settlement && !(paymentsLoading && !refreshing && payments.length === 0) ? (
          <PaymentsCard
            settlement={settlement}
            viewer={{ userId, isUploader }}
            nameFor={(key) => badgeFor(key).name}
            busyKey={paymentBusyKey === MY_SHARE_BUSY_KEY ? (userId ?? null) : paymentBusyKey}
            onMarkPaid={() =>
              setPendingPayment({ kind: "markPaid", amountCents: mySettlement?.owesCents ?? 0 })
            }
            onConfirm={(payerKey) => {
              const person = settlement.people.find((p) => p.userId === payerKey);
              setPendingPayment({
                kind: "confirm",
                payerKey,
                name: badgeFor(payerKey).name,
                amountCents: person?.owesCents ?? 0,
              });
            }}
            onNotReceived={(payerKey) => {
              void handleNotReceived(payerKey);
            }}
          />
        ) : null}

        {/* Pay me, for the uploader until the receipt is settled (US 3.5) */}
        {settlement && !isSettled && isUploader && id &&
        !(paymentsLoading && !refreshing && payments.length === 0) ? (
          <PayMeCard
            receiptId={id}
            owingCount={countNudgeable(settlement)}
            lastSentAt={lastPayMeAt}
            onMessage={(message, type) => setToast({ message, type })}
            onNobodyOwes={() => {
              void reloadPayments();
            }}
          />
        ) : null}
        {finalSplit !== null && finalSplit.status !== "ok" && !claimsLoading ? (
          <View style={STYLES.finalizeCard}>
            <Text style={STYLES.finalizeHint}>
              {"Couldn't work out the final split for this receipt."}
            </Text>
          </View>
        ) : null}

        {/* Finalize, for submitted receipts (US 3.3) */}
        {canFinalize && !claimsLoading ? (
          <View style={STYLES.finalizeCard}>
            {isUploader ? (
              <>
                <Text style={STYLES.finalizeHint}>
                  {unclaimedCount > 0
                    ? unclaimedLabel(unclaimedCount)
                    : "Every item is claimed."}
                </Text>
                <Pressable
                  onPress={() => setConfirmingFinalize(true)}
                  disabled={unclaimedCount > 0 || finalizing}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: unclaimedCount > 0 || finalizing,
                    busy: finalizing,
                  }}
                  style={({ pressed }) => [
                    STYLES.finalizeButton,
                    (unclaimedCount > 0 || finalizing) && STYLES.finalizeButtonDisabled,
                    pressed && STYLES.pressed,
                  ]}
                >
                  {finalizing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={STYLES.finalizeButtonText}>Finalize receipt</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={STYLES.finalizeHint}>
                {`Waiting for ${memberNames[receipt.created_by] ?? "the uploader"} to finalize.`}
              </Text>
            )}
          </View>
        ) : null}

        {/* Share with Guests Card (hidden once finalized: claims are locked) */}
        {isFinalized ? null : (
          <View style={STYLES.shareCard}>
            <View style={STYLES.shareHeader}>
              <Text style={STYLES.shareTitle}>Guest Claim Link</Text>
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
        )}

        {/* Items Section */}
        <View style={STYLES.sectionHeaderRow}>
          <Text style={STYLES.sectionLabel}>
            Line Items ({receipt.items.length})
          </Text>
          {claimsLoading && claimable.length > 0 && groupId !== undefined ? (
            <Text style={STYLES.loadingHint}>Loading claims…</Text>
          ) : null}
        </View>

        <View style={STYLES.itemsList}>
          {receipt.items.length === 0 ? (
            <View style={STYLES.emptyCard}>
              <Text style={STYLES.emptyText}>No items added to this receipt yet.</Text>
            </View>
          ) : (
            receipt.items.map((item) => {
              const shares = sharesByItem[item.id];
              // Items with a bad price aren't claimable (see toClaimableItems).
              if (!shares) {
                return (
                  <View key={item.id} style={STYLES.itemCard}>
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
                    // Claims are locked once finalized (US 3.3).
                    if (isFinalized) return;
                    // The hook updates the screen itself; nothing to wait for.
                    void toggle(item.id);
                  }}
                  disabled={isFinalized}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isMine, busy: inFlight, disabled: isFinalized }}
                  accessibilityLabel={
                    isFinalized ? item.name : `${isMine ? "Unclaim" : "Claim"} ${item.name}`
                  }
                  style={({ pressed }) => [
                    STYLES.itemCard,
                    isMine && STYLES.itemCardClaimed,
                    (pressed || inFlight) && STYLES.pressed,
                  ]}
                >
                  <View
                    testID={`item-checkbox-${item.id}`}
                    style={STYLES.itemCheckbox}
                  >
                    <Svg width={26} height={26} viewBox="0 0 26 26">
                      <Circle
                        cx={13}
                        cy={13}
                        r={12}
                        fill={isMine ? palette.accent : "transparent"}
                        stroke={isMine ? palette.accent : palette.border}
                        strokeWidth={2}
                      />
                      {isMine ? (
                        <Path
                          d="M7.5 13.5l3.5 3.5L18.5 9.5"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                    </Svg>
                  </View>

                  <View style={STYLES.itemMain}>
                    <View style={STYLES.itemTitleRow}>
                      <Text
                        style={[STYLES.itemName, isMine && STYLES.itemNameClaimed]}
                      >
                        {item.name}
                      </Text>
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
                    {renderClaimantBadges(shares)}
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

      {/* Running total floating above the bottom navigation bubble (US 2.3 Task 5) */}
      {claimable.length > 0 ? (
        <View style={[STYLES.totalBarWrapper, { paddingBottom: floatingTabOffset }]}>
          <View style={STYLES.totalBar} accessibilityLiveRegion="polite">
            <Text style={STYLES.totalBarText}>
              {isFinalized
                ? finalizedBarText(settlement, mySettlement, isUploader, uploaderName)
                : myTotal.claimedCount === 0
                  ? "Tap items you bought to claim them"
                  : `Your total ${formatCents(myTotal.totalCents)} · ${myTotal.claimedCount} ${
                      myTotal.claimedCount === 1 ? "item" : "items"
                    }`}
            </Text>
          </View>
        </View>
      ) : null}

      <ConfirmCardModal
        visible={confirmingFinalize}
        title="Finalize receipt?"
        message="Everyone's share will be locked in, including tax and tip, and items can't be claimed or unclaimed anymore."
        confirmLabel="Finalize"
        destructive={false}
        busy={finalizing}
        onCancel={() => setConfirmingFinalize(false)}
        onConfirm={() => {
          void handleFinalize();
        }}
      />

      <ConfirmCardModal
        visible={pendingPayment !== null}
        title={pendingPayment?.kind === "confirm" ? "Confirm payment?" : "Mark as paid?"}
        message={
          pendingPayment?.kind === "confirm"
            ? `Confirm you received ${formatCents(pendingPayment.amountCents)} from ${pendingPayment.name}. This can't be undone.`
            : `Let ${uploaderName} know you've paid ${formatCents(
                pendingPayment?.amountCents ?? 0
              )}. They'll confirm once they get it.`
        }
        confirmLabel={pendingPayment?.kind === "confirm" ? "Confirm" : "Mark as paid"}
        destructive={false}
        busy={paymentBusyKey !== null}
        onCancel={() => setPendingPayment(null)}
        onConfirm={() => {
          void handleConfirmPayment();
        }}
      />

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
  scroll: {
    flex: 1,
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  finalizedBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  settledBadge: {
    backgroundColor: palette.text,
  },
  finalizedBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  finalizeCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  finalizeHint: {
    fontSize: 14,
    color: palette.muted,
    textAlign: "center",
  },
  finalizeButton: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  finalizeButtonDisabled: {
    opacity: 0.45,
  },
  finalizeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
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
  itemsList: {
    gap: 10,
  },
  emptyCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  itemCardClaimed: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  itemCheckbox: {
    justifyContent: "center",
    alignItems: "center",
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
  itemNameClaimed: {
    color: palette.text,
    fontWeight: "700",
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
  claimantsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
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
  totalBarWrapper: {
    backgroundColor: palette.bg,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  totalBar: {
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: palette.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
