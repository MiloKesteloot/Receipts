import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { Toast, ToastType } from "@/components/toast";
import {
  calculateGuestTotalCents,
  claimItemAsGuest,
  getReceiptByGuestToken,
  type GuestReceiptDetail,
} from "@/lib/guest-claim";
import { palette } from "@/lib/palette";

/** Local browser storage key for persisting the guest's display name. */
const GUEST_NAME_STORAGE_KEY = "receipts_guest_name";

/**
 * Retrieves previously stored guest display name from local storage.
 * @returns Stored name or empty string
 */
function getStoredGuestName(): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(GUEST_NAME_STORAGE_KEY) || "";
    }
  } catch {
    // Fall back to empty string if localStorage is inaccessible
  }
  return "";
}

/**
 * Saves the guest display name to local browser storage.
 * @param name Display name to persist
 */
function setStoredGuestName(name: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
    }
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Formats monetary amounts from cents to dollars string.
 * @param cents Amount in cents
 * @returns Formatted currency string
 */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Public web screen for anonymous guest receipt item claiming.
 * Accessible via browser without login.
 * @returns JSX element
 */
export default function GuestClaimScreen(): JSX.Element {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [guestName, setGuestName] = useState<string>(getStoredGuestName);
  const [nameInput, setNameInput] = useState<string>("");
  const [nameModalVisible, setNameModalVisible] = useState<boolean>(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<GuestReceiptDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  /**
   * Loads receipt details for this guest token.
   */
  const loadReceipt = useCallback(async () => {
    if (!token) {
      setErrorMessage("Missing claim token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const result = await getReceiptByGuestToken(token);
    if (result.success) {
      setReceipt(result.receipt);
    } else {
      setErrorMessage(result.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  // If no guest name is saved, show the prompt modal on load
  useEffect(() => {
    if (!guestName) {
      setNameModalVisible(true);
    }
  }, [guestName]);

  /**
   * Submits and validates a newly entered guest name.
   */
  function handleSaveName(): void {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Please enter your name to claim items.");
      return;
    }
    setGuestName(trimmed);
    setStoredGuestName(trimmed);
    setNameModalVisible(false);
    setNameError(null);
  }

  /**
   * Toggles claim status of an item for the current guest.
   * @param itemId ID of the item to claim or unclaim
   * @param currentlyClaimed Whether this item is already claimed by the guest
   */
  async function handleToggleClaim(itemId: string, currentlyClaimed: boolean): Promise<void> {
    if (!guestName.trim()) {
      setNameInput("");
      setNameModalVisible(true);
      return;
    }

    if (!token || togglingItemId) return;
    setTogglingItemId(itemId);

    const targetClaim = !currentlyClaimed;
    const result = await claimItemAsGuest(token, itemId, guestName, targetClaim);

    if (result.success) {
      // Reload receipt data to refresh all item splits
      const refreshed = await getReceiptByGuestToken(token);
      if (refreshed.success) {
        setReceipt(refreshed.receipt);
      }
      setToast({
        message: targetClaim ? "Item claimed!" : "Item unshared/unclaimed",
        type: "info",
      });
    } else {
      setToast({
        message: result.message,
        type: "error",
      });
    }

    setTogglingItemId(null);
  }

  if (loading) {
    return (
      <View style={STYLES.centeredScreen}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={STYLES.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  if (errorMessage || !receipt) {
    return (
      <View style={STYLES.centeredScreen}>
        <View style={STYLES.errorCard}>
          <Text style={STYLES.errorTitle}>Claim Link Unavailable</Text>
          <Text style={STYLES.errorMessage}>
            {errorMessage || "This claim link is invalid or has expired."}
          </Text>
          <Text style={STYLES.errorHint}>
            Please verify the URL or ask the receipt owner to send an updated link.
          </Text>
        </View>
      </View>
    );
  }

  const personalTotalCents = calculateGuestTotalCents(receipt.items, guestName);
  const claimedCount = receipt.items.filter((item) =>
    item.claims.some(
      (c) => c.guest_name && c.guest_name.trim().toLowerCase() === guestName.trim().toLowerCase()
    )
  ).length;

  return (
    <View style={STYLES.pageContainer}>
      <ScrollView contentContainerStyle={STYLES.scrollContent}>
        {/* Receipt Header Banner */}
        <View style={STYLES.headerCard}>
          <View style={STYLES.badgeRow}>
            <View style={STYLES.publicBadge}>
              <Text style={STYLES.publicBadgeText}>Guest Claiming</Text>
            </View>
            {guestName ? (
              <Pressable
                onPress={() => {
                  setNameInput(guestName);
                  setNameModalVisible(true);
                }}
                style={STYLES.guestUserBadge}
              >
                <Text style={STYLES.guestUserBadgeText}>
                  Claiming as <Text style={STYLES.guestUserBadgeName}>{guestName}</Text> (Edit)
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={STYLES.receiptTitle}>{receipt.title}</Text>
          <Text style={STYLES.receiptTotal}>
            Total: {formatCents(receipt.total_cents)}
          </Text>
          <Text style={STYLES.instructionHint}>
            Tap any item below to claim your share. Costs are automatically divided evenly.
          </Text>
        </View>

        {/* Line Items List */}
        <Text style={STYLES.sectionHeader}>Receipt Items ({receipt.items.length})</Text>

        <View style={STYLES.itemsList}>
          {receipt.items.map((item) => {
            const isClaimedByMe = item.claims.some(
              (c) =>
                c.guest_name &&
                c.guest_name.trim().toLowerCase() === guestName.trim().toLowerCase()
            );
            const isProcessing = togglingItemId === item.id;

            return (
              <Pressable
                key={item.id}
                onPress={() => handleToggleClaim(item.id, isClaimedByMe)}
                disabled={isProcessing}
                style={({ pressed }) => [
                  STYLES.itemCard,
                  isClaimedByMe && STYLES.itemCardClaimed,
                  pressed && STYLES.itemCardPressed,
                ]}
              >
                <View style={STYLES.itemCheckbox}>
                  <View
                    style={[
                      STYLES.checkCircle,
                      isClaimedByMe && STYLES.checkCircleActive,
                    ]}
                  >
                    {isClaimedByMe ? (
                      <Text style={STYLES.checkmarkText}>✓</Text>
                    ) : null}
                  </View>
                </View>

                <View style={STYLES.itemDetails}>
                  <View style={STYLES.itemNameRow}>
                    <Text
                      style={[
                        STYLES.itemName,
                        isClaimedByMe && STYLES.itemNameClaimed,
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.is_shared ? (
                      <View style={STYLES.sharedChip}>
                        <Text style={STYLES.sharedChipText}>
                          Shared ({item.claims.length})
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Claimants List */}
                  <View style={STYLES.claimantsRow}>
                    {item.claims.length === 0 ? (
                      <Text style={STYLES.noClaimsText}>Tap to claim</Text>
                    ) : (
                      item.claims.map((c, i) => (
                        <View
                          key={c.id ?? i}
                          style={[
                            STYLES.claimChip,
                            c.guest_name?.trim().toLowerCase() ===
                              guestName.trim().toLowerCase() &&
                              STYLES.claimChipMe,
                          ]}
                        >
                          <Text
                            style={[
                              STYLES.claimChipText,
                              c.guest_name?.trim().toLowerCase() ===
                                guestName.trim().toLowerCase() &&
                                STYLES.claimChipMeText,
                            ]}
                          >
                            {c.guest_name?.trim().toLowerCase() ===
                            guestName.trim().toLowerCase()
                              ? "You"
                              : c.display_name}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                {/* Pricing Info */}
                <View style={STYLES.itemPriceCol}>
                  <Text style={STYLES.itemFullPrice}>
                    {formatCents(item.amount_cents)}
                  </Text>
                  {item.is_shared ? (
                    <Text style={STYLES.itemPerPersonPrice}>
                      {formatCents(item.per_person_cents)} ea
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar Showing Personal Running Total */}
      <View style={STYLES.bottomBar}>
        <View style={STYLES.bottomBarContent}>
          <View>
            <Text style={STYLES.bottomBarLabel}>Your Running Total</Text>
            <Text style={STYLES.bottomBarSub}>
              {claimedCount} {claimedCount === 1 ? "item" : "items"} claimed
            </Text>
          </View>
          <Text style={STYLES.bottomBarAmount}>
            {formatCents(personalTotalCents)}
          </Text>
        </View>
      </View>

      {/* Guest Name Entry Modal */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (guestName) setNameModalVisible(false);
        }}
      >
        <View style={STYLES.modalBackdrop}>
          <View style={STYLES.modalCard}>
            <Text style={STYLES.modalTitle}>Welcome to Receipts</Text>
            <Text style={STYLES.modalSubtitle}>
              Please enter your name so others know what you&apos;re claiming.
            </Text>

            <TextInput
              style={[STYLES.modalInput, Boolean(nameError) && STYLES.modalInputError]}
              placeholder="Your full name or nickname"
              placeholderTextColor="#9CA3AF"
              value={nameInput}
              onChangeText={(text) => {
                setNameInput(text);
                if (nameError) setNameError(null);
              }}
              onSubmitEditing={handleSaveName}
              autoFocus
              autoCapitalize="words"
            />

            {nameError ? (
              <Text style={STYLES.modalErrorText}>{nameError}</Text>
            ) : null}

            <Pressable
              onPress={handleSaveName}
              style={({ pressed }) => [
                STYLES.modalButton,
                pressed && STYLES.pressed,
              ]}
            >
              <Text style={STYLES.modalButtonText}>Start Claiming</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
 * Styling for the Guest Claiming Screen.
 */
const STYLES = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: "center",
  },
  scrollContent: {
    width: "100%",
    maxWidth: 640,
    padding: 20,
    paddingBottom: 100,
    gap: 16,
  },
  centeredScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.bg,
    padding: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: palette.muted,
  },
  errorCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    maxWidth: 400,
    gap: 10,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.error,
  },
  errorMessage: {
    fontSize: 15,
    color: palette.text,
    textAlign: "center",
  },
  errorHint: {
    fontSize: 13,
    color: palette.muted,
    textAlign: "center",
  },
  headerCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  publicBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  publicBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    textTransform: "uppercase",
  },
  guestUserBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  guestUserBadgeText: {
    fontSize: 12,
    color: "#4B5563",
  },
  guestUserBadgeName: {
    fontWeight: "700",
    color: palette.accent,
  },
  receiptTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  receiptTotal: {
    fontSize: 28,
    fontWeight: "800",
    color: palette.accent,
  },
  instructionHint: {
    fontSize: 14,
    color: palette.muted,
    lineHeight: 20,
  },
  sectionHeader: {
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
    backgroundColor: "#F5FBF6",
  },
  itemCardPressed: {
    opacity: 0.8,
  },
  itemCheckbox: {
    justifyContent: "center",
    alignItems: "center",
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  checkmarkText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  itemDetails: {
    flex: 1,
    gap: 6,
  },
  itemNameRow: {
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
    color: "#166534",
  },
  sharedChip: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sharedChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400E",
  },
  claimantsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  noClaimsText: {
    fontSize: 12,
    color: palette.muted,
    fontStyle: "italic",
  },
  claimChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  claimChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
  },
  claimChipMe: {
    backgroundColor: palette.accent,
  },
  claimChipMeText: {
    color: "#FFFFFF",
  },
  itemPriceCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemFullPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  itemPerPersonPrice: {
    fontSize: 12,
    color: palette.accent,
    fontWeight: "700",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1F2937",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    alignItems: "center",
  },
  bottomBarContent: {
    width: "100%",
    maxWidth: 640,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomBarLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  bottomBarSub: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  bottomBarAmount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#34D399",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: palette.muted,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.text,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  modalInputError: {
    borderColor: palette.error,
  },
  modalErrorText: {
    fontSize: 13,
    color: palette.error,
  },
  modalButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
});
