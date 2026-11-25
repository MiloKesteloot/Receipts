/**
 * Small haptic vocabulary for the app. Every call is fire-and-forget and
 * silently does nothing where haptics aren't supported (web, Low Power Mode).
 */

import {
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  selectionAsync,
} from "expo-haptics";
import { Platform } from "react-native";

/**
 * Runs a haptic call, ignoring unsupported platforms and failures.
 * @param run The haptic call
 */
function fire(run: () => Promise<void>): void {
  if (Platform.OS === "web") return;
  run().catch(() => {});
}

/** Light tap for ordinary button presses. */
export function tapHaptic(): void {
  fire(() => impactAsync(ImpactFeedbackStyle.Light));
}

/** Crisp tick for changing a selection (tabs, checkboxes, toggles). */
export function selectHaptic(): void {
  fire(() => selectionAsync());
}

/** Success pattern for completed actions. */
export function successHaptic(): void {
  fire(() => notificationAsync(NotificationFeedbackType.Success));
}

/** Warning pattern for destructive confirmations. */
export function warningHaptic(): void {
  fire(() => notificationAsync(NotificationFeedbackType.Warning));
}

/** Error pattern for failed actions. */
export function errorHaptic(): void {
  fire(() => notificationAsync(NotificationFeedbackType.Error));
}
