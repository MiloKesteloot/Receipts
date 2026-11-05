import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isEmptyScan,
  scanReceipt,
  type ScannedReceipt,
} from "@/lib/scan-receipt";

/** Maximum image size accepted by the scanner's free tier. */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;
/** Default maximum time for one scanner request. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Default number of retries after a scanner failure. */
const DEFAULT_RETRIES = 1;

/** Scanner errors that can be shown or handled by the capture flow. */
export type ScanErrorCode =
  | "missing-photo"
  | "photo-too-large"
  | "empty-scan"
  | "timeout"
  | "scanner"
  | "unknown";

/** An error with a stable code and a user-facing message. */
export class ScanReceiptError extends Error {
  readonly code: ScanErrorCode;

  /**
   * Creates a typed scanner error.
   * @param code Failure category
   * @param message Friendly error text
   */
  constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = "ScanReceiptError";
    this.code = code;
  }
}

/**
 * Resolves a scanner request or rejects when it exceeds the timeout.
 * @param promise Scanner request
 * @param timeoutMs Maximum wait in milliseconds
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ScanReceiptError("timeout", "The scan took too long.")),
      timeoutMs,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Scans one captured image, checking the upload size and retrying transient
 * scanner failures once. Empty results become a retake-friendly error.
 * @param base64 Image data without a data URI prefix
 * @param client Supabase client
 * @param options Timeout and retry settings for tests or slower connections
 * @param options.timeoutMs Maximum time for one request
 * @param options.retries Number of retries after a failure
 * @returns The mapped receipt
 */
export async function scanReceiptPhoto(
  base64: string | null | undefined,
  client: SupabaseClient | null,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<ScannedReceipt> {
  if (!base64) {
    throw new ScanReceiptError(
      "missing-photo",
      "We couldn't read that photo. Take it again or choose another photo.",
    );
  }
  if (base64.length * 0.75 > MAX_SCAN_BYTES) {
    throw new ScanReceiptError(
      "photo-too-large",
      "That photo is too large to scan. Move a little farther away and try again.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await withTimeout(scanReceipt(base64, client), timeoutMs);
      if (isEmptyScan(result)) {
        throw new ScanReceiptError(
          "empty-scan",
          "We couldn't find a readable receipt. Try again with the receipt flat, brighter, and fully in frame.",
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      if (error instanceof ScanReceiptError && error.code === "empty-scan") {
        throw error;
      }
      if (attempt === retries) break;
    }
  }

  if (lastError instanceof ScanReceiptError) throw lastError;
  throw new ScanReceiptError(
    "scanner",
    "We couldn't read that receipt. Check your connection and try again.",
  );
}
