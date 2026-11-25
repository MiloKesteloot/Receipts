import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { JSX } from "react/jsx-runtime";

import { AnimatedView, DIALOG_ENTERING } from "@/components/animated";
import { ClaimantBadge } from "@/components/claimant-badge";
import { CheckIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import { SkeletonScreen } from "@/components/skeleton";
import { Toast, ToastType } from "@/components/toast";
import {
  calculateGuestTotalCents,
  claimItemAsGuest,
  getReceiptByGuestToken,
  type GuestReceiptDetail,
} from "@/lib/guest-claim";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

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
  const styles = useStyles();
  const palette = useTheme();
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
      <SkeletonScreen paddingTop={64} />
    );
  }

  if (errorMessage || !receipt) {
    return (
      <View style={styles.centeredScreen}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Claim Link Unavailable</Text>
          <Text style={styles.errorMessage}>
            {errorMessage || "This claim link is invalid or has expired."}
          </Text>
          <Text style={styles.errorHint}>
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
    <View style={styles.pageContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Receipt Header Banner */}
        <View style={styles.headerCard}>
          <View style={styles.badgeRow}>
            <View style={styles.publicBadge}>
              <Text style={styles.publicBadgeText}>Guest Claiming</Text>
            </View>
            {guestName ? (
              <ScalePressable
                onPress={() => {
                  setNameInput(guestName);
                  setNameModalVisible(true);
                }}
                style={styles.guestUserBadge}
              >
                <Text style={styles.guestUserBadgeText}>
                  Claiming as <Text style={styles.guestUserBadgeName}>{guestName}</Text> (Edit)
                </Text>
              </ScalePressable>
            ) : null}
          </View>

          <Text style={styles.receiptTitle}>{receipt.title}</Text>
          <Text style={styles.receiptTotal}>
            Total: {formatCents(receipt.total_cents)}
          </Text>
          <Text style={styles.instructionHint}>
            Tap any item below to claim your share. Costs are automatically divided evenly.
          </Text>
        </View>

        {/* Line Items List */}
        <Text style={styles.sectionHeader}>Receipt Items ({receipt.items.length})</Text>

        <View style={styles.itemsList}>
          {receipt.items.map((item) => {
            const isClaimedByMe = item.claims.some(
              (c) =>
                c.guest_name &&
                c.guest_name.trim().toLowerCase() === guestName.trim().toLowerCase()
            );
            const isProcessing = togglingItemId === item.id;

            return (
              <ScalePressable
                key={item.id}
                haptic="select"
                onPress={() => handleToggleClaim(item.id, isClaimedByMe)}
                disabled={isProcessing}
                style={[styles.itemCard, isClaimedByMe && styles.itemCardClaimed]}
              >
                <View style={styles.itemCheckbox}>
                  <View
                    style={[
                      styles.checkCircle,
                      isClaimedByMe && styles.checkCircleActive,
                    ]}
                  >
                    {isClaimedByMe ? (
                      <CheckIcon size={14} color={palette.onAccent} strokeWidth={3} />
                    ) : null}
                  </View>
                </View>

                <View style={styles.itemDetails}>
                  <View style={styles.itemNameRow}>
                    <Text
                      style={[
                        styles.itemName,
                        isClaimedByMe && styles.itemNameClaimed,
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.is_shared ? (
                      <View style={styles.sharedChip}>
                        <Text style={styles.sharedChipText}>
                          Shared ({item.claims.length})
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Claimants List */}
                  <View style={styles.claimantsRow}>
                    {item.claims.length === 0 ? (
                      <Text style={styles.noClaimsText}>Tap to claim</Text>
                    ) : (
                      item.claims.map((c, i) => {
                        const isYou =
                          c.is_guest &&
                          c.guest_name?.trim().toLowerCase() ===
                            guestName.trim().toLowerCase();
                        const role = isYou
                          ? "you"
                          : c.is_guest
                            ? "guest"
                            : "member";
                        const label = isYou
                          ? "You"
                          : c.is_guest
                            ? `${c.display_name} (Guest)`
                            : c.display_name;
                        return (
                          <ClaimantBadge
                            key={c.id ?? i}
                            role={role}
                            label={label}
                          />
                        );
                      })
                    )}
                  </View>
                </View>

                {/* Pricing Info */}
                <View style={styles.itemPriceCol}>
                  <Text style={styles.itemFullPrice}>
                    {formatCents(item.amount_cents)}
                  </Text>
                  {item.is_shared ? (
                    <Text style={styles.itemPerPersonPrice}>
                      {formatCents(item.per_person_cents)} ea
                    </Text>
                  ) : null}
                </View>
              </ScalePressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar Showing Personal Running Total */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarContent}>
          <View>
            <Text style={styles.bottomBarLabel}>Your Running Total</Text>
            <Text style={styles.bottomBarSub}>
              {claimedCount} {claimedCount === 1 ? "item" : "items"} claimed
            </Text>
          </View>
          <Text style={styles.bottomBarAmount}>
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
        <View style={styles.modalBackdrop}>
          <AnimatedView entering={DIALOG_ENTERING} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Welcome to Receipts</Text>
            <Text style={styles.modalSubtitle}>
              Please enter your name so others know what you&apos;re claiming.
            </Text>

            <TextInput
              style={[styles.modalInput, Boolean(nameError) && styles.modalInputError]}
              placeholder="Your full name or nickname"
              placeholderTextColor={palette.placeholder}
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
              <Text style={styles.modalErrorText}>{nameError}</Text>
            ) : null}

            <ScalePressable
              onPress={handleSaveName}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>Start Claiming</Text>
            </ScalePressable>
          </AnimatedView>
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
const useStyles = createThemedStyles((palette) => ({
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
  errorCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    maxWidth: 400,
    gap: 10,
    ...elevation(palette),
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
    shadowColor: palette.shadow,
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
    backgroundColor: palette.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  publicBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.success,
    textTransform: "uppercase",
  },
  guestUserBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: palette.surface,
  },
  guestUserBadgeText: {
    fontSize: 12,
    color: palette.muted,
  },
  guestUserBadgeName: {
    fontWeight: "700",
    color: palette.accent,
  },
  receiptTitle: {
    fontSize: 28,
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
    borderRadius: 18,
    padding: 16,
    gap: 12,
    ...elevation(palette),
  },
  itemCardClaimed: {
    borderColor: palette.accent,
    backgroundColor: palette.successSoft,
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
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
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
    color: palette.success,
  },
  sharedChip: {
    backgroundColor: palette.warningSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sharedChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.warning,
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
    backgroundColor: palette.card,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    ...elevation(palette, 2),
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
    color: palette.muted,
  },
  bottomBarSub: {
    fontSize: 12,
    color: palette.placeholder,
  },
  bottomBarAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: palette.accent,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
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
    shadowColor: palette.shadow,
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
    backgroundColor: palette.card,
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
    color: palette.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
}));
