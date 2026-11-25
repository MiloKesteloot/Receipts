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
 * 3. Colors are copied from Kellar's Add Group modal (gray text, green
 *    button) so the card matches the card it sits in. There's no design
 *    system yet; restyle later.
 * 4. WORKAROUND: after the share sheet closes we wait
 *    `SHARE_SHEET_CLOSE_DELAY_MS` before allowing Done. iOS can still be
 *    animating the share sheet away (especially after AirDrop) when the
 *    promise resolves; closing our sheet then can leave a frozen blank
 *    sheet. 500 ms was picked by feel, not measured. `onSharingChange`
 *    reports this whole time so the Add Group modal can't be closed until
 *    it's over (see `create-group-form.tsx`).
 * 5. DARK MODE: colors are fixed for a light background, because Kellar's
 *    Add Group modal card is always white. The whole modal (his card plus
 *    this card and the create form) needs one dark-mode pass later. Not
 *    part of US 1.2.
 * ==========================================================================
 */

import { JSX, useState } from "react";
import { Share, Text, View } from "react-native";

import { ScalePressable } from "@/components/scale-pressable";
import { CreatedGroup } from "@/lib/create-group";
import { createThemedStyles } from "@/lib/theme";

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
  const styles = useStyles();
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
    <View style={styles.card}>
      <Text style={styles.label}>Invite code</Text>

      {/* selectable: long-press to copy, without needing a clipboard package */}
      <Text
        selectable
        accessibilityLabel={`Invite code ${group.inviteCode.split("").join(" ")}`}
        style={styles.code}
      >
        {group.inviteCode}
      </Text>

      <Text style={styles.hint}>
        Send this to your roommates so they can join {group.name}.
      </Text>

      <ScalePressable
        onPress={handleShare}
        disabled={sharing}
        style={[styles.button, sharing && styles.pressed]}
      >
        <Text style={styles.buttonText}>Share code</Text>
      </ScalePressable>

      {shareError && <Text style={styles.error}>{shareError}</Text>}
    </View>
  );
}

/**
 * Styles for the card. PLACEHOLDER #3: no design system yet.
 * PLACEHOLDER #5: light colors only.
 */
const useStyles = createThemedStyles((palette) => ({
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.6,
  },
  code: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 4,
    color: palette.text,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    fontSize: 15,
    color: palette.muted,
    textAlign: "center",
  },
  button: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    alignSelf: "stretch",
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: palette.onAccent,
    fontSize: 17,
    fontWeight: "600",
  },
  error: {
    color: palette.error,
    textAlign: "center",
  },
}));
