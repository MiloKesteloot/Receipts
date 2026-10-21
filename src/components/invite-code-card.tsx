/**
 * User Story 1.2, Task 1.2: shows a new group's invite code with a Share
 * button that opens the iOS share sheet (Messages, copy, AirDrop, etc.).
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. The shared message is plain text with the code only. There's no link
 *    that opens the app or the App Store yet (see `buildShareMessage`).
 * 2. Codes are sent as plain text, which is fine for sprint 1 but not
 *    secure: anyone who sees the message can join. Expiring codes or
 *    owner approval would be a future story.
 * 3. Colors use the same blue (#208AEF) as the rest of the app. There's
 *    no design system yet; restyle later.
 * 4. WORKAROUND: after the share sheet closes we wait
 *    `SHARE_SHEET_CLOSE_DELAY_MS` before allowing Done. iOS can still be
 *    animating the share sheet away (especially after AirDrop) when the
 *    promise resolves; closing our sheet then can leave a frozen blank
 *    sheet. 500 ms was picked by feel, not measured.
 * ==========================================================================
 */

import { useTheme } from "expo-router";
import { JSX, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { CreatedGroup } from "@/lib/create-group";

type Props = {
  group: CreatedGroup;
  onSharingChange?: (isSharing: boolean) => void;
};

/**
 * PLACEHOLDER #4 (workaround): extra wait after the share sheet closes.
 */
const SHARE_SHEET_CLOSE_DELAY_MS = 500;

/**
 * Builds the text that gets shared with roommates.
 * PLACEHOLDER #1: no app or App Store link yet.
 * @param group The group being shared
 * @returns The message to share
 */
export function buildShareMessage(group: CreatedGroup): string {
  return (
    `Join my group "${group.name}" on Receipts!\n` +
    `Invite code: ${group.inviteCode}`
  );
}

/**
 * Card with a group's invite code and a Share button.
 * @param root0 Component props
 * @param root0.group The group whose code to show
 * @param root0.onSharingChange Told when the share sheet opens and fully closes
 * @returns JSX element
 */
export function InviteCodeCard({ group, onSharingChange }: Props): JSX.Element {
  const { colors } = useTheme();
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  /**
   * Opens the iOS share sheet. Closing it without sharing is not an error.
   */
  async function handleShare() {
    if (sharing) return;
    setShareError(null);
    setSharing(true);
    onSharingChange?.(true);
    try {
      await Share.share({ message: buildShareMessage(group) });
    } catch {
      setShareError("Couldn't open sharing. You can still copy the code.");
    }
    await new Promise((resolve) =>
      setTimeout(resolve, SHARE_SHEET_CLOSE_DELAY_MS),
    );
    setSharing(false);
    onSharingChange?.(false);
  }

  return (
    <View style={[STYLES.card, { borderColor: colors.border }]}>
      <Text style={[STYLES.label, { color: colors.text }]}>Invite code</Text>

      {/* selectable: long-press to copy, without needing a clipboard package */}
      <Text
        selectable
        accessibilityLabel={`Invite code ${group.inviteCode.split("").join(" ")}`}
        style={[STYLES.code, { color: colors.text }]}
      >
        {group.inviteCode}
      </Text>

      <Text style={STYLES.hint}>
        Send this to your roommates so they can join {group.name}.
      </Text>

      <Pressable
        onPress={handleShare}
        disabled={sharing}
        style={({ pressed }) => [
          STYLES.button,
          (pressed || sharing) && STYLES.pressed,
        ]}
      >
        <Text style={STYLES.buttonText}>Share code</Text>
      </Pressable>

      {shareError && <Text style={STYLES.error}>{shareError}</Text>}
    </View>
  );
}

/**
 * Styles for the card. PLACEHOLDER #3: no design system yet.
 */
const STYLES = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.6,
  },
  code: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    alignSelf: "stretch",
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
  },
  error: {
    color: "#D93025",
    textAlign: "center",
  },
});
