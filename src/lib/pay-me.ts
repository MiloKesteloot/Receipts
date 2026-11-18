/**
 * User Story 3.5 (Push and Pay me): the uploader nudges everyone who hasn't
 * paid, at most once an hour.
 *
 * Sending goes through the `send-pay-me` Edge Function, which enforces every
 * rule (uploader only, finalized only, who owes, the one-hour cooldown). Who
 * has already paid comes from US 3.4 (`receipt_payments`); this file only
 * turns the server's answers into results the receipt screen can show.
 */

import { isGuestClaimKey } from "@/lib/claims";
import type { Settlement } from "@/lib/settlement";
import { SUPABASE } from "@/lib/supabase";

/** How long a receipt waits between Pay me pushes. */
export const PAY_ME_COOLDOWN_MS = 60 * 60 * 1000;

/** Why a Pay me failed. */
export type PayMeError =
  | "NOT_SIGNED_IN"
  | "NOT_FOUND"
  | "NOT_UPLOADER"
  | "NOT_FINALIZED"
  | "SEND_FAILED"
  | "NETWORK_ERROR";

/** What tapping Pay me did. */
export type PayMeResult =
  /** Pushes went out; `notifiedCount` people had a device to receive one. */
  | { status: "sent"; notifiedCount: number; owingCount: number }
  /** A Pay me went out less than an hour ago; nothing was sent. */
  | { status: "cooldown"; retryAfterSeconds: number }
  /** Everyone has paid, so there's nobody to nudge. */
  | { status: "nobody_owes" }
  | { status: "error"; error: PayMeError; message: string };

export type LastPayMeResult =
  | { status: "ok"; lastSentAt: string | null }
  | { status: "error"; message: string };

type DbError = { code?: string; message: string } | null;

/**
 * The slice of the Supabase client Pay me uses, so tests can pass a fake.
 */
export type PayMeClient = {
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> }
    ): Promise<{
      data: unknown;
      error: { message: string; context?: unknown } | null;
    }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): { maybeSingle(): PromiseLike<{ data: unknown; error: DbError }> };
    };
  };
};

export type PayMeOptions = {
  /** Supabase client. Defaults to the app's client. */
  client?: PayMeClient | null;
};

/** Error codes the server may send back, by name. */
const KNOWN_ERRORS: readonly PayMeError[] = [
  "NOT_SIGNED_IN",
  "NOT_FOUND",
  "NOT_UPLOADER",
  "NOT_FINALIZED",
  "SEND_FAILED",
];

/** Shown when the server's answer isn't in the expected shape. */
const UNEXPECTED_RESPONSE = "Unexpected response from server.";

/**
 * Picks the client.
 * @param options Pay me options
 * @returns The client, or null when Supabase isn't configured
 */
function clientFor(options?: PayMeOptions): PayMeClient | null {
  if (options?.client !== undefined) return options.client;
  // The full client's types are too deep to check against this narrow type
  // (TS2589), so it's cast through unknown.
  return SUPABASE as unknown as PayMeClient | null;
}

/**
 * Reads a known error code from the server.
 * @param value The `error` field the server sent
 * @returns The code, or NETWORK_ERROR for anything unknown
 */
function errorCode(value: unknown): PayMeError {
  return KNOWN_ERRORS.find((code) => code === value) ?? "NETWORK_ERROR";
}

/**
 * Reads a whole, non-negative count.
 * @param value The value as sent
 * @returns The count, or null if it isn't one
 */
function wholeCount(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Turns the Edge Function's JSON answer into a result.
 * @param data What `send-pay-me` answered
 * @returns The result
 */
export function toPayMeResult(data: unknown): PayMeResult {
  if (typeof data !== "object" || data === null) {
    return { status: "error", error: "NETWORK_ERROR", message: UNEXPECTED_RESPONSE };
  }
  const body = data as Record<string, unknown>;

  if (body.status === "sent") {
    const notifiedCount = wholeCount(body.notifiedCount);
    const owingCount = wholeCount(body.owingCount);
    if (notifiedCount !== null && owingCount !== null) {
      return { status: "sent", notifiedCount, owingCount };
    }
  } else if (body.status === "cooldown") {
    const seconds = Number(body.retryAfterSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return { status: "cooldown", retryAfterSeconds: Math.ceil(seconds) };
    }
  } else if (body.status === "nobody_owes") {
    return { status: "nobody_owes" };
  } else if (body.status === "error") {
    return {
      status: "error",
      error: errorCode(body.error),
      message:
        typeof body.message === "string" && body.message !== ""
          ? body.message
          : "Couldn't send a Pay me.",
    };
  }
  return { status: "error", error: "NETWORK_ERROR", message: UNEXPECTED_RESPONSE };
}

/**
 * Reads the JSON body of a failed function call (e.g. a 401 or 502), which
 * still says what went wrong.
 * @param context The error's `context` (a fetch Response)
 * @returns The parsed body, or null
 */
async function errorBody(context: unknown): Promise<unknown> {
  const response = context as { json?: () => Promise<unknown> } | undefined;
  if (typeof response?.json !== "function") return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Asks the server to send a Pay me push to everyone on the receipt who still
 * owes the uploader. Never throws.
 * @param receiptId The finalized receipt
 * @param options Pay me options
 * @returns What happened: sent, cooling down, nobody owes, or an error
 */
export async function sendPayMe(
  receiptId: string,
  options?: PayMeOptions
): Promise<PayMeResult> {
  if (receiptId.trim() === "") {
    return { status: "error", error: "NOT_FOUND", message: "Receipt not found." };
  }
  const client = clientFor(options);
  if (!client) {
    return {
      status: "error",
      error: "NETWORK_ERROR",
      message: "Supabase client is not configured.",
    };
  }

  try {
    const { data, error } = await client.functions.invoke("send-pay-me", {
      body: { receiptId },
    });
    if (error) {
      const body = await errorBody(error.context);
      if (body !== null && typeof body === "object" && "status" in body) {
        return toPayMeResult(body);
      }
      return {
        status: "error",
        error: "NETWORK_ERROR",
        message: error.message || "Failed to communicate with server.",
      };
    }
    return toPayMeResult(data);
  } catch (err: unknown) {
    return {
      status: "error",
      error: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Network error occurred.",
    };
  }
}

/**
 * Loads when the receipt's last Pay me went out, so the countdown survives
 * leaving and reopening the screen (or a Pay me sent from another phone).
 * @param receiptId The receipt
 * @param options Pay me options
 * @returns The last Pay me time (null if never), or an error message
 */
export async function loadLastPayMe(
  receiptId: string,
  options?: PayMeOptions
): Promise<LastPayMeResult> {
  const client = clientFor(options);
  if (!client) return { status: "error", message: "Supabase client is not configured." };

  try {
    const { data, error } = await client
      .from("pay_me_nudges")
      .select("last_sent_at")
      .eq("receipt_id", receiptId)
      .maybeSingle();
    if (error) return { status: "error", message: error.message };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- column name
    const lastSentAt = (data as { last_sent_at?: unknown } | null)?.last_sent_at;
    return { status: "ok", lastSentAt: typeof lastSentAt === "string" ? lastSentAt : null };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Network error occurred.",
    };
  }
}

/**
 * How many people a Pay me would reach: members (guests have no phone) whose
 * share is still unpaid or was reported not received (US 3.4). Marked-paid
 * and confirmed shares, the uploader, and $0 shares are left out. The server
 * decides for real; this is what the card shows.
 * @param settlement The receipt's settlement from computeSettlement
 * @returns The number of people Pay me would nudge
 */
export function countNudgeable(settlement: Settlement): number {
  return settlement.people.filter(
    (p) =>
      !isGuestClaimKey(p.userId) && (p.status === "unpaid" || p.status === "not_received")
  ).length;
}

/**
 * Seconds until the receipt can send another Pay me.
 * @param lastSentAt When the last Pay me went out (ISO string), or null
 * @param nowMs The current time in ms
 * @returns Whole seconds left, or 0 when a Pay me can go out now
 */
export function cooldownSecondsLeft(lastSentAt: string | null, nowMs: number): number {
  if (!lastSentAt) return 0;
  const sentMs = Date.parse(lastSentAt);
  if (Number.isNaN(sentMs)) return 0;
  return Math.max(0, Math.ceil((sentMs + PAY_ME_COOLDOWN_MS - nowMs) / 1000));
}

/**
 * Formats a countdown, e.g. 95 -> "1:35" and 3725 -> "1:02:05".
 * @param seconds Seconds left
 * @returns The countdown text
 */
export function formatCooldown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
