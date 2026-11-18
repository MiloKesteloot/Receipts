/**
 * User Story 3.5 (Push and Pay me): web has no push notifications, so these
 * do nothing. iOS and Android use `push-notifications.native.ts`.
 */

/**
 * Registers for push notifications on native; does nothing on web.
 * @param _userId The signed-in user (unused on web)
 */
export function usePushNotifications(_userId: string | undefined): void {
  void _userId;
}

/**
 * Removes this device's push token on native; does nothing on web.
 */
export async function unregisterThisDevice(): Promise<void> {}
