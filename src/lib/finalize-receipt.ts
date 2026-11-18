/**
 * User Story 3.3 (Finalize and split), Task 2: finalizing a receipt.
 *
 * Finalizing goes through the `finalize_receipt` RPC, which enforces every
 * rule on the server: only the uploader can finalize, only a submitted
 * receipt, and only once every item has at least one claim. After that,
 * claims and items on the receipt can't change.
 */

import { SUPABASE } from "@/lib/supabase";

/** Why finalizing failed. Every code but NETWORK_ERROR comes from the RPC. */
export type FinalizeError =
  | "NOT_SIGNED_IN"
  | "NOT_FOUND"
  | "NOT_UPLOADER"
  | "NOT_SUBMITTED"
  | "ALREADY_FINALIZED"
  | "NO_ITEMS"
  | "NETWORK_ERROR";

export type FinalizeReceiptResult =
  | { status: "ok"; finalizedAt: string }
  /** Blocked: this many items still need a claim. */
  | { status: "unclaimed"; unclaimedCount: number }
  | { status: "error"; error: FinalizeError; message: string };

/**
 * The slice of the Supabase client finalizing uses, so tests can pass a fake.
 */
export type FinalizeClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export type FinalizeOptions = {
  /** Supabase client. Defaults to the app's client. */
  client?: FinalizeClient | null;
};

/* eslint-disable @typescript-eslint/naming-convention -- RPC field names */
/** What `finalize_receipt` returns. */
type FinalizeRpcResult = {
  success?: unknown;
  error?: unknown;
  message?: unknown;
  finalized_at?: unknown;
  unclaimed_count?: unknown;
};
/* eslint-enable @typescript-eslint/naming-convention */

/** Error codes the RPC can send back, other than UNCLAIMED_ITEMS. */
const RPC_ERRORS: readonly FinalizeError[] = [
  "NOT_SIGNED_IN",
  "NOT_FOUND",
  "NOT_UPLOADER",
  "NOT_SUBMITTED",
  "ALREADY_FINALIZED",
  "NO_ITEMS",
];

/** Postgres "insufficient privilege", e.g. calling the RPC while signed out. */
const FORBIDDEN_CODE = "42501";

/** Shown when the server's answer isn't in the expected shape. */
const UNEXPECTED_RESPONSE = "Unexpected response from server.";

/**
 * Builds a failed result.
 * @param error Machine-readable reason
 * @param message Text to show the user
 * @returns The failure result
 */
function failure(error: FinalizeError, message: string): FinalizeReceiptResult {
  return { status: "error", error, message };
}

/**
 * Picks the client.
 * @param options Finalize options
 * @returns The client, or null when Supabase isn't configured
 */
function clientFor(options?: FinalizeOptions): FinalizeClient | null {
  if (options?.client !== undefined) return options.client;
  // The full client's types are too deep to check against this narrow type
  // (TS2589), so it's cast through unknown.
  return SUPABASE as unknown as FinalizeClient | null;
}

/**
 * Turns the RPC's answer into a result.
 * @param data What `finalize_receipt` returned
 * @returns The result
 */
function toResult(data: unknown): FinalizeReceiptResult {
  if (typeof data !== "object" || data === null) {
    return failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }
  const result = data as FinalizeRpcResult;

  if (result.success === true) {
    return typeof result.finalized_at === "string"
      ? { status: "ok", finalizedAt: result.finalized_at }
      : failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }

  if (result.error === "UNCLAIMED_ITEMS") {
    const count = Number(result.unclaimed_count);
    return Number.isInteger(count) && count > 0
      ? { status: "unclaimed", unclaimedCount: count }
      : failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }

  const known = RPC_ERRORS.find((code) => code === result.error);
  if (result.success !== false || known === undefined) {
    return failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }
  const message =
    typeof result.message === "string" && result.message !== ""
      ? result.message
      : "Couldn't finalize this receipt.";
  return failure(known, message);
}

/**
 * Finalizes a receipt so everyone's share is fixed. Only the uploader can do
 * this, and only once every item is claimed.
 * @param receiptId The receipt to finalize
 * @param options Finalize options
 * @returns Ok with when it was finalized, how many items are still
 *   unclaimed, or why it failed
 */
export async function finalizeReceipt(
  receiptId: string,
  options?: FinalizeOptions
): Promise<FinalizeReceiptResult> {
  if (receiptId.trim() === "") return failure("NOT_FOUND", "Receipt not found.");

  const client = clientFor(options);
  if (!client) {
    return failure("NETWORK_ERROR", "Supabase client is not configured.");
  }

  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { data, error } = await client.rpc("finalize_receipt", { p_receipt_id: receiptId });
    if (error) {
      if (error.code === FORBIDDEN_CODE) {
        return failure("NOT_SIGNED_IN", "Please sign in and try again.");
      }
      return failure(
        "NETWORK_ERROR",
        error.message || "Failed to communicate with server."
      );
    }
    return toResult(data);
  } catch (err: unknown) {
    return failure(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network error occurred."
    );
  }
}
