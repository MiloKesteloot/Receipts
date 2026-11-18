/**
 * User Story 3.5 (Push and Pay me): registering this device for push
 * notifications, and working out which receipt a tapped notification opens.
 *
 * Kept free of `expo-notifications` so it runs in plain Node tests; the
 * native wiring is in `push-notifications.native.ts`.
 */

import { SUPABASE } from "@/lib/supabase";

/** Android channel Pay me pushes are sent on (matches the Edge Function). */
export const PAY_ME_CHANNEL_ID = "pay-me";

/** Platforms the server stores tokens for. */
export type PushPlatform = "ios" | "android";

/** Everything registration needs from the device, passed in for testing. */
export type PushRegistrationDeps = {
  /** `Platform.OS`. */
  platform: string;
  /** False on simulators and emulators, which can't get a push token. */
  isDevice: boolean;
  /** EAS project id from app config, needed for an Expo push token. */
  projectId: string | undefined;
  /** Creates the Android channel. Must run before asking permission. */
  createAndroidChannel(): Promise<void>;
  /** Whether notification permission is already granted. */
  hasPermission(): Promise<boolean>;
  /** Shows the permission prompt; resolves true if granted. */
  requestPermission(): Promise<boolean>;
  /** Gets this device's Expo push token string. */
  getExpoPushToken(projectId: string): Promise<string>;
  /** Saves the token for the signed-in user. */
  saveToken(token: string, platform: PushPlatform): Promise<{ ok: boolean; message?: string }>;
};

export type PushRegistrationResult =
  | { status: "registered"; token: string }
  | {
      status: "skipped";
      reason: "unsupported_platform" | "not_device" | "permission_denied" | "no_project_id";
    }
  | { status: "error"; message: string };

/**
 * Asks for notification permission and registers this device's Expo push
 * token for the signed-in user. Skips quietly where push isn't possible.
 * Never throws.
 * @param deps Device and server functions
 * @returns Registered with the token, skipped with why, or an error
 */
export async function registerForPushNotifications(
  deps: PushRegistrationDeps
): Promise<PushRegistrationResult> {
  if (deps.platform !== "ios" && deps.platform !== "android") {
    return { status: "skipped", reason: "unsupported_platform" };
  }
  if (!deps.isDevice) return { status: "skipped", reason: "not_device" };

  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (deps.platform === "android") await deps.createAndroidChannel();

    const granted = (await deps.hasPermission()) || (await deps.requestPermission());
    if (!granted) return { status: "skipped", reason: "permission_denied" };

    if (!deps.projectId) return { status: "skipped", reason: "no_project_id" };

    const token = await deps.getExpoPushToken(deps.projectId);
    const saved = await deps.saveToken(token, deps.platform);
    return saved.ok
      ? { status: "registered", token }
      : { status: "error", message: saved.message ?? "Couldn't save the push token." };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Couldn't register for notifications.",
    };
  }
}

/**
 * The slice of the Supabase client token saving uses, so tests can pass a fake.
 */
export type PushTokenClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Picks the client.
 * @param client An explicit client, or undefined for the app's client
 * @returns The client, or null when Supabase isn't configured
 */
function tokenClient(client?: PushTokenClient | null): PushTokenClient | null {
  if (client !== undefined) return client;
  return SUPABASE as unknown as PushTokenClient | null;
}

/**
 * Saves a push token for the signed-in user via `register_push_token`.
 * @param token Expo push token
 * @param platform "ios" or "android"
 * @param client Supabase client (defaults to the app's)
 * @returns Whether it was saved, with a message if not
 */
export async function savePushToken(
  token: string,
  platform: PushPlatform,
  client?: PushTokenClient | null
): Promise<{ ok: boolean; message?: string }> {
  const c = tokenClient(client);
  if (!c) return { ok: false, message: "Supabase client is not configured." };
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { data, error } = await c.rpc("register_push_token", { p_token: token, p_platform: platform });
  if (error) return { ok: false, message: error.message };
  const result = data as { success?: unknown; message?: unknown } | null;
  return result?.success === true
    ? { ok: true }
    : {
        ok: false,
        message: typeof result?.message === "string" ? result.message : "Couldn't save the push token.",
      };
}

/**
 * Removes this device's push token before signing out, so the next person to
 * use the phone doesn't get the previous account's pushes. Never throws.
 * @param token Expo push token, or null if this device never registered
 * @param client Supabase client (defaults to the app's)
 * @returns True if the server confirmed the removal
 */
export async function removePushToken(
  token: string | null,
  client?: PushTokenClient | null
): Promise<boolean> {
  const c = tokenClient(client);
  if (!token || !c) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { error } = await c.rpc("unregister_push_token", { p_token: token });
    return !error;
  } catch {
    return false;
  }
}

/** The parts of an `expo-notifications` response that tapping needs. */
export type TappedNotification = {
  actionIdentifier: string;
  notification: { request: { content: { data?: unknown } } };
};

/**
 * Works out where a tapped Pay me notification should go.
 * @param response The notification response
 * @param defaultActionId `Notifications.DEFAULT_ACTION_IDENTIFIER` (a plain tap)
 * @returns The receipt's route, or null if it isn't a Pay me tap
 */
export function receiptRouteForTap(
  response: TappedNotification | null | undefined,
  defaultActionId: string
): string | null {
  if (!response || response.actionIdentifier !== defaultActionId) return null;
  const data = response.notification.request.content.data;
  if (typeof data !== "object" || data === null) return null;
  const receiptId = (data as { receiptId?: unknown }).receiptId;
  if (typeof receiptId !== "string" || !/^[A-Za-z0-9-]+$/.test(receiptId)) return null;
  return `/(app)/(home)/receipts/${receiptId}`;
}
