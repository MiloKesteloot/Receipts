// Pure logic for the send-pay-me Edge Function (User Story 3.5). No Deno or
// network APIs here: index.ts passes them in, so Node unit tests can run this
// file directly (tests/unit/pay-me.test.ts).

/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

/** Android channel the app creates for Pay me notifications. */
export const PAY_ME_CHANNEL_ID = "pay-me";

/** One Expo push message. */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: string;
  data: { receiptId: string; url: string };
};

/** One Expo push ticket, in the same order as the messages sent. */
export type PushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** A member who still owes, with every device they've registered. */
export type Recipient = { userId: string; tokens: string[] };

/** What the function answers. Sent as JSON. */
export type PayMeBody =
  | { status: "sent"; notifiedCount: number; owingCount: number }
  | { status: "cooldown"; retryAfterSeconds: number }
  | { status: "nobody_owes" }
  | { status: "error"; error: string; message: string };

export type PayMeResponse = { httpStatus: number; body: PayMeBody };

/** Everything the handler needs from the outside world. */
export type PayMeDeps = {
  /** The signed-in user's id from the request's JWT, or null. */
  getUserId(authHeader: string | null): Promise<string | null>;
  /** Calls `start_pay_me` with the service role. */
  startPayMe(
    receiptId: string,
    userId: string,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  /** Sends one batch (at most 100) to Expo. Throws if Expo can't be reached. */
  sendPush(messages: PushMessage[]): Promise<PushTicket[]>;
  /** Removes tokens Expo says are no longer registered. */
  deleteTokens(tokens: string[]): Promise<void>;
  /** Lets the uploader try again right away (nothing was sent). */
  clearCooldown(receiptId: string): Promise<void>;
};

/** Errors start_pay_me can return that are passed straight to the app. */
const PASS_THROUGH_ERRORS = [
  "NOT_SIGNED_IN",
  "NOT_FOUND",
  "NOT_UPLOADER",
  "NOT_FINALIZED",
];

const ok = (body: PayMeBody): PayMeResponse => ({ httpStatus: 200, body });

const fail = (httpStatus: number, error: string, message: string): PayMeResponse => ({
  httpStatus,
  body: { status: "error", error, message },
});

/**
 * Splits a list into chunks of at most `size`.
 */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Builds one push per device of everyone who still owes.
 */
export function buildPushMessages(
  recipients: Recipient[],
  receiptId: string,
  receiptTitle: string,
  uploaderName: string,
): { message: PushMessage; userId: string }[] {
  const title = `${uploaderName} says: Pay me`;
  const body = `Settle up for "${receiptTitle}".`;
  const data = { receiptId, url: `/receipts/${receiptId}` };
  return recipients.flatMap((r) =>
    r.tokens.map((to) => ({
      userId: r.userId,
      message: { to, title, body, sound: "default" as const, channelId: PAY_ME_CHANNEL_ID, data },
    })),
  );
}

/**
 * Reads the recipients list from start_pay_me, dropping anything malformed.
 */
export function readRecipients(value: unknown): Recipient[] {
  if (!Array.isArray(value)) return [];
  const out: Recipient[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { user_id: userId, tokens } = entry as { user_id?: unknown; tokens?: unknown };
    if (typeof userId !== "string") continue;
    out.push({
      userId,
      tokens: Array.isArray(tokens)
        ? tokens.filter((t): t is string => typeof t === "string" && t !== "")
        : [],
    });
  }
  return out;
}

/**
 * Reads `{ receiptId }` from the request body.
 */
export function readReceiptId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { receiptId?: unknown }).receiptId;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

/**
 * Handles one Pay me request: checks who's asking, lets start_pay_me apply
 * every rule (uploader, finalized, who owes, one-hour cooldown), then sends.
 */
export async function handlePayMe(
  authHeader: string | null,
  requestBody: unknown,
  deps: PayMeDeps,
): Promise<PayMeResponse> {
  const receiptId = readReceiptId(requestBody);
  if (!receiptId) return fail(400, "NOT_FOUND", "Missing receipt id.");

  const userId = await deps.getUserId(authHeader);
  if (!userId) return fail(401, "NOT_SIGNED_IN", "Please sign in and try again.");

  const { data, error } = await deps.startPayMe(receiptId, userId);
  if (error || typeof data !== "object" || data === null) {
    return fail(500, "SERVER_ERROR", error?.message ?? "Unexpected response from database.");
  }

  const result = data as Record<string, unknown>;
  if (result.success !== true) {
    if (result.error === "NOBODY_OWES") return ok({ status: "nobody_owes" });
    if (result.error === "COOLDOWN") {
      const seconds = Number(result.retry_after_seconds);
      return ok({
        status: "cooldown",
        retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1,
      });
    }
    if (typeof result.error === "string" && PASS_THROUGH_ERRORS.includes(result.error)) {
      const message =
        typeof result.message === "string" && result.message !== ""
          ? result.message
          : "Couldn't send a Pay me.";
      return ok({ status: "error", error: result.error, message });
    }
    return fail(500, "SERVER_ERROR", "Unexpected response from database.");
  }

  const recipients = readRecipients(result.recipients);
  const owingCount = Number(result.owing_count);
  const outgoing = buildPushMessages(
    recipients,
    receiptId,
    typeof result.receipt_title === "string" ? result.receipt_title : "a receipt",
    typeof result.uploader_name === "string" ? result.uploader_name : "Someone",
  );

  const notified = new Set<string>();
  const deadTokens: string[] = [];
  let reachedExpo = outgoing.length === 0;

  for (const batch of chunk(outgoing, EXPO_BATCH_SIZE)) {
    let tickets: PushTicket[];
    try {
      tickets = await deps.sendPush(batch.map((b) => b.message));
      reachedExpo = true;
    } catch {
      continue;
    }
    tickets.forEach((ticket, i) => {
      const sent = batch[i];
      if (!sent) return;
      if (ticket?.status === "ok") notified.add(sent.userId);
      else if (ticket?.details?.error === "DeviceNotRegistered") deadTokens.push(sent.message.to);
    });
  }

  if (deadTokens.length > 0) {
    try {
      await deps.deleteTokens(deadTokens);
    } catch {
      // Cleanup only; the Pay me itself still went out.
    }
  }

  if (!reachedExpo) {
    await deps.clearCooldown(receiptId);
    return fail(502, "SEND_FAILED", "Couldn't reach the notification service. Try again.");
  }

  return ok({
    status: "sent",
    notifiedCount: notified.size,
    owingCount: Number.isInteger(owingCount) && owingCount > 0 ? owingCount : recipients.length,
  });
}
