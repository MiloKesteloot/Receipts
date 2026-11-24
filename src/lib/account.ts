import { NOT_CONFIGURED } from "@/lib/group-data";
import { SUPABASE } from "@/lib/supabase";

export type DeleteAccountErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_SIGNED_IN"
  | "NETWORK_ERROR"
  | "DELETE_FAILED";

export type DeleteAccountResult =
  | { success: true; message: string }
  | { success: false; error: DeleteAccountErrorCode; message: string };

type DbError = { code?: string; message: string } | null;

/**
 * Minimal slice of Supabase client needed by account deletion operations.
 */
export type AccountClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: DbError }>;
  auth: {
    signOut(): PromiseLike<{ error: unknown }>;
  };
};

export type DeleteAccountOptions = {
  client?: AccountClient | null;
};

/**
 * Deletes the signed-in user's account permanently via delete_user_account RPC.
 * On success, invokes client.auth.signOut() to clear the active session.
 * @param options Client options
 * @returns Result object with success status and user-facing message
 */
export async function deleteAccount(
  options?: DeleteAccountOptions
): Promise<DeleteAccountResult> {
  const client = options ? options.client : SUPABASE;
  if (!client) {
    return {
      success: false,
      error: "NOT_CONFIGURED",
      message: NOT_CONFIGURED,
    };
  }

  try {
    const { data, error } = await client.rpc("delete_user_account");

    if (error) {
      if (error.code === "42501") {
        return {
          success: false,
          error: "NOT_SIGNED_IN",
          message: "Please sign in to delete your account",
        };
      }
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: error.message || "Failed to communicate with server.",
      };
    }

    const payload = data as {
      success?: boolean;
      error?: string;
      message?: string;
    } | null;
    if (!payload || payload.success !== true) {
      return {
        success: false,
        error: "DELETE_FAILED",
        message: payload?.message || "Failed to delete account.",
      };
    }

    // Clear active auth session and local storage
    try {
      await client.auth.signOut();
    } catch {
      // Ignored: account is already deleted on server
    }

    return {
      success: true,
      message: payload.message || "Account deleted successfully",
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return {
      success: false,
      error: "NETWORK_ERROR",
      message,
    };
  }
}
