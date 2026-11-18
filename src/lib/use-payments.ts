/**
 * User Story 3.4 (Mark paid and confirm), Task 3: loads a finalized receipt's
 * payments and lets the screen mark a share paid or answer a payment.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPayments,
  markSharePaid,
  respondToPayment,
  type PaymentActionResult,
} from "@/lib/payments";
import type { PaymentRecord } from "@/lib/settlement";

/** `busyKey` while the signed-in member's own share is being marked paid. */
export const MY_SHARE_BUSY_KEY = "me";

export type UsePaymentsResult = {
  payments: PaymentRecord[];
  loading: boolean;
  /** Why the last load failed, if it did. */
  error: string | null;
  /** The payer key whose action is in flight (or MY_SHARE_BUSY_KEY), if any. */
  busyKey: string | null;
  reload: () => Promise<void>;
  /** Marks the signed-in member's share paid. */
  markPaid: () => Promise<PaymentActionResult>;
  /** The uploader confirms (true) or rejects (false) someone's payment. */
  respond: (payerKey: string, received: boolean) => Promise<PaymentActionResult>;
};

/** Returned when an action can't start. */
const NOT_READY: PaymentActionResult = {
  status: "error",
  error: "NOT_FOUND",
  message: "Receipt not found.",
};

/** Returned while another payment action is still running. */
const BUSY: PaymentActionResult = {
  status: "error",
  error: "NETWORK_ERROR",
  message: "Please wait for the last change to finish.",
};

/**
 * Replaces one payer's record, or adds it.
 * @param current The current records
 * @param payment The new record
 * @returns The updated records
 */
function upsertPayment(current: PaymentRecord[], payment: PaymentRecord): PaymentRecord[] {
  const others = current.filter((p) => p.payerKey !== payment.payerKey);
  return [...others, payment];
}

/**
 * Tracks a receipt's payments.
 * @param receiptId The receipt, or undefined while unknown
 * @param enabled True once the receipt is finalized
 * @returns The payments, load state, and actions
 */
export function usePayments(
  receiptId: string | undefined,
  enabled: boolean
): UsePaymentsResult {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Refs so overlapping loads and fast taps see the latest state.
  const latestLoadRef = useRef(0);
  const busyRef = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    if (!receiptId || !enabled) return;
    latestLoadRef.current += 1;
    const loadId = latestLoadRef.current;
    setLoading(true);

    let result: Awaited<ReturnType<typeof getPayments>>;
    try {
      result = await getPayments(receiptId);
    } catch (err: unknown) {
      result = {
        status: "error",
        message: err instanceof Error ? err.message : "Couldn't load payments.",
      };
    }
    if (loadId !== latestLoadRef.current) return;

    if (result.status === "ok") {
      setPayments(result.payments);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [receiptId, enabled]);

  useEffect(() => {
    if (!enabled) {
      latestLoadRef.current += 1;
      setPayments([]);
      setError(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, reload]);

  /**
   * Runs one payment action, tracking which share is busy.
   * @param key The busy key for the share
   * @param run Makes the request
   * @returns The action's result
   */
  const runAction = useCallback(
    async (
      key: string,
      run: (id: string) => Promise<PaymentActionResult>
    ): Promise<PaymentActionResult> => {
      if (!receiptId || !enabled) return NOT_READY;
      if (busyRef.current) return BUSY;

      busyRef.current = true;
      setBusyKey(key);
      let result: PaymentActionResult;
      try {
        result = await run(receiptId);
      } catch (err: unknown) {
        result = {
          status: "error",
          error: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Network error occurred.",
        };
      } finally {
        busyRef.current = false;
        setBusyKey(null);
      }

      if (result.status === "ok") {
        const payment = result.payment;
        // Newer than anything an in-flight load could return.
        latestLoadRef.current += 1;
        setLoading(false);
        setPayments((current) => upsertPayment(current, payment));
      } else if (result.error === "ALREADY_CONFIRMED") {
        void reload();
      }
      return result;
    },
    [receiptId, enabled, reload]
  );

  const markPaid = useCallback(
    () => runAction(MY_SHARE_BUSY_KEY, (id) => markSharePaid(id)),
    [runAction]
  );

  const respond = useCallback(
    (payerKey: string, received: boolean) =>
      runAction(payerKey, (id) => respondToPayment(id, payerKey, received)),
    [runAction]
  );

  return { payments, loading, error, busyKey, reload, markPaid, respond };
}
