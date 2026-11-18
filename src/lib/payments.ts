/**
 * User Story 3.4 (Mark paid and confirm), Task 2: loading and changing
 * payments on a finalized receipt.
 *
 * Writes go through two RPCs that enforce every rule on the server:
 * `mark_share_paid` (a member marks their own share paid) and
 * `respond_to_payment` (the uploader confirms a payment or says it wasn't
 * received). Members of the group can read `receipt_payments` directly.
 */

import type { PaymentRecord, PaymentState } from "@/lib/settlement";
import { SUPABASE } from "@/lib/supabase";

/** Why a payment action failed. Every code but NETWORK_ERROR comes from the RPCs. */
export type PaymentError =
  | "NOT_SIGNED_IN"
  | "NOT_FOUND"
  | "NOT_FINALIZED"
  | "IS_UPLOADER"
  | "NOT_UPLOADER"
  | "NO_SHARE"
  | "ALREADY_CONFIRMED"
  | "NOT_MARKED_PAID"
  | "NETWORK_ERROR";

export type PaymentActionResult =
  | { status: "ok"; payment: PaymentRecord }
  | { status: "error"; error: PaymentError; message: string };

export type GetPaymentsResult =
  | { status: "ok"; payments: PaymentRecord[] }
  | { status: "error"; message: string };

type DbError = { code?: string; message: string } | null;

/* eslint-disable @typescript-eslint/naming-convention -- database column names */
/** A row of `receipt_payments`, or what the RPCs return. */
type PaymentRow = {
  payer_key?: unknown;
  state?: unknown;
  marked_paid_at?: unknown;
  responded_at?: unknown;
};

/** What the RPCs return. */
type PaymentRpcResult = PaymentRow & {
  success?: unknown;
  error?: unknown;
  message?: unknown;
};
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The slice of the Supabase client payments use, so tests can pass a fake.
 */
export type PaymentsClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: DbError }>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): PromiseLike<{ data: unknown[] | null; error: DbError }>;
    };
  };
};

export type PaymentsOptions = {
  /** Supabase client. Defaults to the app's client. */
  client?: PaymentsClient | null;
};

/** Error codes the RPCs can send back. */
const RPC_ERRORS: readonly PaymentError[] = [
  "NOT_SIGNED_IN",
  "NOT_FOUND",
  "NOT_FINALIZED",
  "IS_UPLOADER",
  "NOT_UPLOADER",
  "NO_SHARE",
  "ALREADY_CONFIRMED",
  "NOT_MARKED_PAID",
];

/** Stored states this app understands. */
const STATES: readonly PaymentState[] = ["paid", "confirmed", "not_received"];

/** Postgres "insufficient privilege", e.g. calling an RPC while signed out. */
const FORBIDDEN_CODE = "42501";

/** Shown when the server's answer isn't in the expected shape. */
const UNEXPECTED_RESPONSE = "Unexpected response from server.";

/** Shown when no Supabase client is configured. */
const NO_CLIENT = "Supabase client is not configured.";

/**
 * Builds a failed action result.
 * @param error Machine-readable reason
 * @param message Text to show the user
 * @returns The failure result
 */
function failure(error: PaymentError, message: string): PaymentActionResult {
  return { status: "error", error, message };
}

/**
 * Picks the client.
 * @param options Payments options
 * @returns The client, or null when Supabase isn't configured
 */
function clientFor(options?: PaymentsOptions): PaymentsClient | null {
  if (options?.client !== undefined) return options.client;
  // The full client's types are too deep to check against this narrow type
  // (TS2589), so it's cast through unknown.
  return SUPABASE as unknown as PaymentsClient | null;
}

/**
 * Reads an optional timestamp.
 * @param value The stored value
 * @returns The timestamp, or null
 */
function timestampOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Turns a stored row into a payment record.
 * @param row The row or RPC answer
 * @returns The record, or null if it isn't a valid payment
 */
function toPaymentRecord(row: PaymentRow): PaymentRecord | null {
  const state = STATES.find((s) => s === row.state);
  if (typeof row.payer_key !== "string" || row.payer_key === "" || !state) {
    return null;
  }
  return {
    payerKey: row.payer_key,
    state,
    markedPaidAt: timestampOrNull(row.marked_paid_at),
    respondedAt: timestampOrNull(row.responded_at),
  };
}

/**
 * Turns an RPC's answer into a result.
 * @param data What the RPC returned
 * @returns The result
 */
function toActionResult(data: unknown): PaymentActionResult {
  if (typeof data !== "object" || data === null) {
    return failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }
  const result = data as PaymentRpcResult;

  if (result.success === true) {
    const payment = toPaymentRecord(result);
    return payment
      ? { status: "ok", payment }
      : failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }

  const known = RPC_ERRORS.find((code) => code === result.error);
  if (result.success !== false || known === undefined) {
    return failure("NETWORK_ERROR", UNEXPECTED_RESPONSE);
  }
  const message =
    typeof result.message === "string" && result.message !== ""
      ? result.message
      : "Couldn't update this payment.";
  return failure(known, message);
}

/**
 * Calls a payment RPC and turns its answer into a result.
 * @param client Supabase client
 * @param fn The RPC's name
 * @param args The RPC's arguments
 * @returns The result
 */
async function callPaymentRpc(
  client: PaymentsClient,
  fn: string,
  args: Record<string, unknown>
): Promise<PaymentActionResult> {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      if (error.code === FORBIDDEN_CODE) {
        return failure("NOT_SIGNED_IN", "Please sign in and try again.");
      }
      return failure("NETWORK_ERROR", error.message || "Failed to communicate with server.");
    }
    return toActionResult(data);
  } catch (err: unknown) {
    return failure(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : "Network error occurred."
    );
  }
}

/**
 * Loads every payment record on a receipt.
 * @param receiptId The receipt
 * @param options Payments options
 * @returns The records, or why they couldn't be loaded
 */
export async function getPayments(
  receiptId: string,
  options?: PaymentsOptions
): Promise<GetPaymentsResult> {
  if (receiptId.trim() === "") return { status: "error", message: "Receipt not found." };

  const client = clientFor(options);
  if (!client) return { status: "error", message: NO_CLIENT };

  try {
    const { data, error } = await client
      .from("receipt_payments")
      .select("payer_key, state, marked_paid_at, responded_at")
      .eq("receipt_id", receiptId);
    if (error) return { status: "error", message: error.message || "Couldn't load payments." };

    const payments = (data ?? [])
      .map((row) =>
        typeof row === "object" && row !== null ? toPaymentRecord(row as PaymentRow) : null
      )
      .filter((p): p is PaymentRecord => p !== null);
    return { status: "ok", payments };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Network error occurred.",
    };
  }
}

/**
 * Marks the signed-in member's share of a finalized receipt as paid, for the
 * uploader to confirm.
 * @param receiptId The receipt
 * @param options Payments options
 * @returns The member's updated payment record, or why it failed
 */
export async function markSharePaid(
  receiptId: string,
  options?: PaymentsOptions
): Promise<PaymentActionResult> {
  if (receiptId.trim() === "") return failure("NOT_FOUND", "Receipt not found.");

  const client = clientFor(options);
  if (!client) return failure("NETWORK_ERROR", NO_CLIENT);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  return callPaymentRpc(client, "mark_share_paid", { p_receipt_id: receiptId });
}

/**
 * The uploader confirms someone's payment, or says it wasn't received.
 * @param receiptId The receipt
 * @param payerKey The payer's user id, or guest claim key
 * @param received True to confirm, false for "not received"
 * @param options Payments options
 * @returns The updated payment record, or why it failed
 */
export async function respondToPayment(
  receiptId: string,
  payerKey: string,
  received: boolean,
  options?: PaymentsOptions
): Promise<PaymentActionResult> {
  if (receiptId.trim() === "") return failure("NOT_FOUND", "Receipt not found.");
  if (payerKey.trim() === "") return failure("NOT_FOUND", "Payment not found.");

  const client = clientFor(options);
  if (!client) return failure("NETWORK_ERROR", NO_CLIENT);

  return callPaymentRpc(client, "respond_to_payment", {
    /* eslint-disable @typescript-eslint/naming-convention -- RPC argument names */
    p_receipt_id: receiptId,
    p_payer_key: payerKey,
    p_received: received,
    /* eslint-enable @typescript-eslint/naming-convention */
  });
}
