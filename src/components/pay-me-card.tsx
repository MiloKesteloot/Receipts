/**
 * User Story 3.5 (Push and Pay me): the uploader's "Pay me" button on a
 * finalized receipt. Sends a push to everyone who still owes, then shows a
 * countdown until another Pay me is allowed (once an hour, enforced by the
 * server).
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { JSX } from "react/jsx-runtime";

import type { ToastType } from "@/components/toast";
import { palette } from "@/lib/palette";
import {
  cooldownSecondsLeft,
  formatCooldown,
  PAY_ME_COOLDOWN_MS,
  sendPayMe,
} from "@/lib/pay-me";

export type PayMeCardProps = {
  receiptId: string;
  /** Members who still owe the uploader (from `countNudgeable`). */
  owingCount: number;
  /** When the last Pay me went out, as loaded, or null. */
  lastSentAt: string | null;
  /** Shows a toast on the receipt screen. */
  onMessage: (message: string, type: ToastType) => void;
  /** The server says nobody owes, so the screen should reload payments. */
  onNobodyOwes?: () => void;
};

/**
 * "1 person" / "N people".
 * @param count How many people
 * @returns The phrase
 */
export function peopleLabel(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/**
 * Card with the Pay me button, or a countdown while it's cooling down.
 * @param props Component props
 * @param props.receiptId The finalized receipt
 * @param props.owingCount Members who still owe
 * @param props.lastSentAt When the last Pay me went out
 * @param props.onMessage Shows a toast
 * @param props.onNobodyOwes Called when the server says nobody owes
 * @returns JSX element
 */
export function PayMeCard({
  receiptId,
  owingCount,
  lastSentAt,
  onMessage,
  onNobodyOwes,
}: PayMeCardProps): JSX.Element {
  // When the next Pay me is allowed, in ms. 0 means now.
  const [readyAtMs, setReadyAtMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);

  // A Pay me sent earlier (maybe from another phone) starts the countdown.
  useEffect(() => {
    const at = Date.now();
    if (!lastSentAt || cooldownSecondsLeft(lastSentAt, at) <= 0) return;
    setNow(at);
    setReadyAtMs((current) => Math.max(current, Date.parse(lastSentAt) + PAY_ME_COOLDOWN_MS));
  }, [lastSentAt]);

  const secondsLeft = Math.max(0, Math.ceil((readyAtMs - now) / 1000));
  const counting = secondsLeft > 0;

  // Tick once a second, only while counting down.
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  /**
   * Sends the Pay me and shows what happened.
   */
  async function handlePress(): Promise<void> {
    if (sending) return;
    setSending(true);
    try {
      const result = await sendPayMe(receiptId);
      const at = Date.now();
      setNow(at);
      if (result.status === "sent") {
        setReadyAtMs(at + PAY_ME_COOLDOWN_MS);
        onMessage(
          result.notifiedCount > 0
            ? `Sent a Pay me to ${peopleLabel(result.notifiedCount)}.`
            : "Nobody who owes you has notifications turned on yet.",
          result.notifiedCount > 0 ? "success" : "info"
        );
      } else if (result.status === "cooldown") {
        setReadyAtMs(at + result.retryAfterSeconds * 1000);
        onMessage(
          `You already sent a Pay me. Try again in ${formatCooldown(result.retryAfterSeconds)}.`,
          "info"
        );
      } else if (result.status === "nobody_owes") {
        onMessage("Everyone has paid.", "info");
        onNobodyOwes?.();
      } else {
        onMessage(result.message, "error");
      }
    } finally {
      setSending(false);
    }
  }

  if (owingCount <= 0) {
    return (
      <View style={STYLES.card} testID="pay-me-card">
        <Text style={STYLES.title}>Pay me</Text>
        <Text style={STYLES.hint}>
          Nobody to nudge: everyone left has marked their share paid, or is a guest.
        </Text>
      </View>
    );
  }

  return (
    <View style={STYLES.card} testID="pay-me-card">
      <Text style={STYLES.title}>Pay me</Text>
      <Text style={STYLES.hint}>
        {`${peopleLabel(owingCount)} still ${owingCount === 1 ? "owes" : "owe"} you. Pay me sends them a notification.`}
      </Text>

      {secondsLeft > 0 ? (
        <View
          style={[STYLES.button, STYLES.buttonWaiting]}
          testID="pay-me-countdown"
          accessibilityLiveRegion="polite"
        >
          <Text style={STYLES.waitingText}>{`Pay me again in ${formatCooldown(secondsLeft)}`}</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            void handlePress();
          }}
          disabled={sending}
          accessibilityRole="button"
          accessibilityState={{ disabled: sending, busy: sending }}
          style={({ pressed }) => [STYLES.button, pressed && STYLES.pressed]}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={STYLES.buttonText}>Pay me</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

/** Styles for the Pay me card. */
const STYLES = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.text,
  },
  hint: {
    fontSize: 14,
    color: palette.muted,
  },
  button: {
    backgroundColor: palette.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonWaiting: {
    backgroundColor: palette.accentSoft,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  waitingText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.7,
  },
});
