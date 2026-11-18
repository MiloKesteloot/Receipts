/**
 * User Story 3.5 (Push and Pay me): push notifications on iOS and Android.
 * Registers this device's Expo push token for the signed-in user and opens
 * the receipt when a Pay me notification is tapped. Web uses the no-op in
 * `push-notifications.ts`.
 *
 * Remote pushes need a development build; Expo Go can't receive them.
 */

import constants from "expo-constants";
import { isDevice } from "expo-device";
import * as notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import {
  PAY_ME_CHANNEL_ID,
  receiptRouteForTap,
  registerForPushNotifications,
  removePushToken,
  savePushToken,
} from "@/lib/push-registration";

/** Longest sign-out waits on removing the token before going ahead anyway. */
const UNREGISTER_TIMEOUT_MS = 3000;

/** The token this device registered, so sign-out can remove it. */
let registeredToken: string | null = null;

// Show Pay me pushes even while the app is open.
notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Reads the EAS project id from app config (set by `eas init`).
 * @returns The project id, or undefined if this app has no EAS project yet
 */
function easProjectId(): string | undefined {
  const fromExtra = (constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  const id = fromExtra ?? constants.easConfig?.projectId;
  return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * Registers for pushes while someone is signed in, and opens the receipt when
 * a Pay me notification is tapped (including the tap that launched the app).
 * @param userId The signed-in user, or undefined
 */
export function usePushNotifications(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void registerForPushNotifications({
      platform: Platform.OS,
      isDevice,
      projectId: easProjectId(),
      createAndroidChannel: async () => {
        await notifications.setNotificationChannelAsync(PAY_ME_CHANNEL_ID, {
          name: "Pay me",
          importance: notifications.AndroidImportance.HIGH,
        });
      },
      hasPermission: async () => (await notifications.getPermissionsAsync()).granted,
      requestPermission: async () => (await notifications.requestPermissionsAsync()).granted,
      getExpoPushToken: async (projectId) =>
        (await notifications.getExpoPushTokenAsync({ projectId })).data,
      saveToken: (token, platform) => savePushToken(token, platform),
    }).then((result) => {
      if (!active) return;
      if (result.status === "registered") registeredToken = result.token;
      else if (result.status === "error") console.warn("Push registration failed:", result.message);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;

    /**
     * Opens the receipt a tapped notification is about.
     * @param response The tapped notification
     */
    function open(response: notifications.NotificationResponse | null): void {
      const route = receiptRouteForTap(response, notifications.DEFAULT_ACTION_IDENTIFIER);
      if (route) router.push(route as never);
    }

    void notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active || !response) return;
      open(response);
      void notifications.clearLastNotificationResponseAsync();
    });
    const subscription = notifications.addNotificationResponseReceivedListener(open);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}

/**
 * Removes this device's push token for the signed-in user. Called right
 * before signing out; gives up after a few seconds so sign-out never hangs.
 */
export async function unregisterThisDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await Promise.race([
    removePushToken(token),
    new Promise((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS)),
  ]);
}
