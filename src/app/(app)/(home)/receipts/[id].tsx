/* eslint-disable @typescript-eslint/naming-convention */

import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { Toast, ToastType } from "@/components/toast";
import {
  createGuestClaimLink,
  createGuestClaimToken,
  formatClaimUrl,
  getReceiptByGuestToken,
  type GuestReceiptDetail,
} from "@/lib/guest-claim";
import { mockGroupDetails, mockGuestTokens } from "@/lib/mock";
import { palette } from "@/lib/palette";

/** Delay in ms after closing share sheet to allow animations to settle. */
const SHARE_SHEET_CLOSE_DELAY_MS = 500;

/**
 * Formats monetary amounts from cents to dollars string.
 * @param cents Amount in cents
 * @returns Formatted currency string
 */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Receipt screen displaying itemized breakdown and guest claim sharing actions.
 * @returns JSX element
 */
export default function ReceiptScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [receipt, setReceipt] = useState<GuestReceiptDetail | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  /**
   * Loads or creates a token for this receipt and fetches items.
   */
  const loadReceiptData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      // Find existing token or generate one for this receipt
      let token = mockGuestTokens.find((t) => t.receipt_id === id)?.token;
      if (!token) {
        token = await createGuestClaimToken(id);
      }

      const url = formatClaimUrl(token);
      setClaimUrl(url);

      const res = await getReceiptByGuestToken(token);
      if (res.success) {
        setReceipt(res.receipt);
      } else {
        // Fallback info if token lookup had issues
        let receiptTitle = "Receipt";
        let receiptTotal = 0;
        for (const g of Object.values(mockGroupDetails)) {
          const match = g.receipts.find((r) => r.id === id);
          if (match) {
            receiptTitle = match.title;
            receiptTotal = match.total_cents;
            break;
          }
        }
        setReceipt({
          token,
          receipt_id: id,
          title: receiptTitle,
          total_cents: receiptTotal,
          created_at: new Date().toISOString(),
          items: [],
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load receipt";
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReceiptData();
  }, [loadReceiptData]);

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
        <Text style={STYLES.errorText}>Receipt not found.</Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={STYLES.actionButton}
        >
          <Text style={STYLES.actionButtonText}>Go back</Text>
        </Pressable>
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
        <Text style={STYLES.sectionLabel}>
          Line Items ({receipt.items.length})
        </Text>

        <View style={STYLES.itemsCard}>
          {receipt.items.length === 0 ? (
            <Text style={STYLES.emptyText}>No items added to this receipt yet.</Text>
          ) : (
            receipt.items.map((item, idx) => (
              <View
                key={item.id}
                style={[STYLES.itemRow, idx > 0 && STYLES.itemDivider]}
              >
                <View style={STYLES.itemMain}>
                  <View style={STYLES.itemTitleRow}>
                    <Text style={STYLES.itemName}>{item.name}</Text>
                    {item.is_shared ? (
                      <View style={STYLES.sharedBadge}>
                        <Text style={STYLES.sharedBadgeText}>
                          Shared ({item.claims.length})
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Claimants */}
                  <View style={STYLES.claimantsRow}>
                    {item.claims.length === 0 ? (
                      <Text style={STYLES.unclaimedText}>Unclaimed</Text>
                    ) : (
                      item.claims.map((claimant, cIdx) => (
                        <View
                          key={claimant.id ?? cIdx}
                          style={[
                            STYLES.claimantChip,
                            claimant.is_guest && STYLES.guestClaimantChip,
                          ]}
                        >
                          <Text
                            style={[
                              STYLES.claimantChipText,
                              claimant.is_guest && STYLES.guestClaimantChipText,
                            ]}
                          >
                            {claimant.display_name}
                            {claimant.is_guest ? " (Guest)" : ""}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={STYLES.itemPricing}>
                  <Text style={STYLES.itemAmount}>
                    {formatCents(item.amount_cents)}
                  </Text>
                  {item.is_shared ? (
                    <Text style={STYLES.perPersonHint}>
                      {formatCents(item.per_person_cents)} ea
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

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
  claimantsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  unclaimedText: {
    fontSize: 13,
    color: palette.muted,
    fontStyle: "italic",
  },
  claimantChip: {
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  claimantChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  guestClaimantChip: {
    backgroundColor: "#E0F2FE",
    borderColor: "#BAE6FD",
    borderWidth: 1,
  },
  guestClaimantChipText: {
    color: "#0369A1",
  },
  itemPricing: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  perPersonHint: {
    fontSize: 12,
    color: palette.accent,
    fontWeight: "600",
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
