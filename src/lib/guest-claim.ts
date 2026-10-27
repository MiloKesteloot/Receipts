/* eslint-disable @typescript-eslint/naming-convention */

import {
  mockGroupDetails,
  mockGuestTokens,
  mockItemClaims,
  mockReceiptItems,
  type MockItemClaim,
  type MockReceiptItem,
  USE_MOCK,
} from "@/lib/mock";
import { SUPABASE } from "@/lib/supabase";

/**
 * Represents a person (registered member or anonymous guest) claiming an item.
 */
export type ItemClaimant = {
  id?: string;
  user_id?: string | null;
  guest_name?: string | null;
  display_name: string;
  is_guest: boolean;
};

/**
 * Line item on a receipt with claimant details and split amounts.
 */
export type ReceiptItemWithClaims = {
  id: string;
  receipt_id: string;
  name: string;
  amount_cents: number;
  claims: ItemClaimant[];
  is_shared: boolean;
  per_person_cents: number;
};

/**
 * Full details of a receipt loaded via guest token.
 */
export type GuestReceiptDetail = {
  token: string;
  receipt_id: string;
  title: string;
  total_cents: number;
  created_at: string;
  expires_at?: string | null;
  items: ReceiptItemWithClaims[];
};

/**
 * Result returned when querying a receipt with a guest token.
 */
export type GetGuestReceiptResult =
  | {
      success: true;
      receipt: GuestReceiptDetail;
    }
  | {
      success: false;
      error: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "NETWORK_ERROR";
      message: string;
    };

/**
 * Result returned after attempting to claim or unclaim an item.
 */
export type ClaimActionResult =
  | {
      success: true;
      item_id: string;
      guest_name: string;
      claimed: boolean;
    }
  | {
      success: false;
      error:
        | "EMPTY_NAME"
        | "INVALID_TOKEN"
        | "EXPIRED_TOKEN"
        | "ITEM_NOT_FOUND"
        | "NETWORK_ERROR";
      message: string;
    };

/**
 * Base URL used when generating shareable web claiming links.
 */
export const DEFAULT_CLAIM_WEB_BASE = "https://receipts.app";

/**
 * Formats a guest claim token into an accessible web URL.
 * In local dev, produces reachable local URLs (http://localhost:8081 or http://<host>:8081).
 * In production or web, formats with the active web origin.
 * @param token The unique claim token
 * @returns Fully qualified web claim URL
 */
export function formatClaimUrl(token: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/claim/${token}`;
  }
  const envUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (envUrl) {
    const trimmed = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    return `${trimmed}/claim/${token}`;
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return `http://localhost:8081/claim/${token}`;
  }
  return `${DEFAULT_CLAIM_WEB_BASE}/claim/${token}`;
}

/**
 * Extracts the raw token from either a full URL or a token string.
 * @param tokenOrUrl URL or bare token
 * @returns Clean token string
 */
export function extractToken(tokenOrUrl: string): string {
  const trimmed = (tokenOrUrl || "").trim();
  const marker = "/claim/";
  const idx = trimmed.indexOf(marker);
  if (idx !== -1) {
    const afterMarker = trimmed.slice(idx + marker.length);
    const queryIdx = afterMarker.indexOf("?");
    return queryIdx === -1 ? afterMarker : afterMarker.slice(0, queryIdx);
  }
  return trimmed;
}

/**
 * Generates a unique guest claim link for a receipt.
 * @param receiptId Unique ID of the receipt to share
 * @returns Generated claim URL containing the token
 */
export async function createGuestClaimLink(receiptId: string): Promise<string> {
  const token = await createGuestClaimToken(receiptId);
  return formatClaimUrl(token);
}

/**
 * Generates and stores a unique guest claim token for a receipt.
 * @param receiptId Unique ID of the receipt to share
 * @returns Unique token string
 */
export async function createGuestClaimToken(receiptId: string): Promise<string> {
  if (USE_MOCK || !SUPABASE) {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const token = `mock-claim-${receiptId}-${randomSuffix}`;
    mockGuestTokens.push({
      token,
      receipt_id: receiptId,
      created_at: new Date().toISOString(),
      expires_at: null,
    });
    return token;
  }

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const token = `claim-${receiptId}-${randomSuffix}`;

  const { error } = await SUPABASE.from("receipt_guest_tokens").insert({
    receipt_id: receiptId,
    token,
  });

  if (error) {
    throw new Error(error.message || "Failed to create guest claim token");
  }

  return token;
}

/**
 * Builds item claim models with split calculations.
 * @param item The receipt item
 * @param claims All claims associated with the item
 * @returns Receipt item with decorated claims and calculated per-person share
 */
export function buildItemWithClaims(
  item: MockReceiptItem,
  claims: MockItemClaim[]
): ReceiptItemWithClaims {
  const itemClaims = claims.filter((c) => c.item_id === item.id);
  const claimants: ItemClaimant[] = itemClaims.map((c) => ({
    id: c.id,
    user_id: c.user_id,
    guest_name: c.guest_name,
    display_name: c.guest_name ?? c.display_name ?? "Member",
    is_guest: Boolean(c.guest_name),
  }));

  const count = Math.max(1, claimants.length);
  const perPersonCents = Math.round(item.amount_cents / count);

  return {
    id: item.id,
    receipt_id: item.receipt_id,
    name: item.name,
    amount_cents: item.amount_cents,
    claims: claimants,
    is_shared: claimants.length > 1,
    per_person_cents: perPersonCents,
  };
}

/**
 * Loads a receipt's itemized data and claimant status using a guest share token.
 * @param tokenOrUrl The guest token or complete claim URL
 * @returns Receipt detail or error status
 */
export async function getReceiptByGuestToken(
  tokenOrUrl: string
): Promise<GetGuestReceiptResult> {
  const token = extractToken(tokenOrUrl);

  if (!token) {
    return {
      success: false,
      error: "INVALID_TOKEN",
      message: "No claim token was provided.",
    };
  }

  if (USE_MOCK || !SUPABASE) {
    const tokenRecord = mockGuestTokens.find((t) => t.token === token);
    if (!tokenRecord) {
      return {
        success: false,
        error: "INVALID_TOKEN",
        message: "This claim link is invalid.",
      };
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return {
        success: false,
        error: "EXPIRED_TOKEN",
        message: "This claim link has expired.",
      };
    }

    // Locate receipt from mockGroupDetails
    let foundReceipt: { id: string; title: string; total_cents: number; created_at: string } | undefined;
    for (const group of Object.values(mockGroupDetails)) {
      const match = group.receipts.find((r) => r.id === tokenRecord.receipt_id);
      if (match) {
        foundReceipt = match;
        break;
      }
    }

    if (!foundReceipt) {
      foundReceipt = {
        id: tokenRecord.receipt_id,
        title: "Receipt",
        total_cents: 0,
        created_at: tokenRecord.created_at,
      };
    }

    const items = mockReceiptItems[tokenRecord.receipt_id] ?? [];
    const decoratedItems = items.map((item) =>
      buildItemWithClaims(item, mockItemClaims)
    );

    return {
      success: true,
      receipt: {
        token: tokenRecord.token,
        receipt_id: tokenRecord.receipt_id,
        title: foundReceipt.title,
        total_cents: foundReceipt.total_cents,
        created_at: foundReceipt.created_at,
        expires_at: tokenRecord.expires_at,
        items: decoratedItems,
      },
    };
  }

  try {
    const { data, error } = await SUPABASE.rpc("get_receipt_by_guest_token", {
      p_token: token,
    });

    if (error || !data) {
      return {
        success: false,
        error: "INVALID_TOKEN",
        message: error?.message || "Invalid or expired claim token.",
      };
    }

    const receiptData = data as GuestReceiptDetail;
    const decoratedItems: ReceiptItemWithClaims[] = (receiptData.items || []).map(
      (item) => {
        const claimants = (item.claims || []).map((c) => ({
          id: c.id,
          user_id: c.user_id,
          guest_name: c.guest_name,
          display_name: c.display_name || c.guest_name || "Member",
          is_guest: Boolean(c.guest_name),
        }));
        const count = Math.max(1, claimants.length);
        return {
          id: item.id,
          receipt_id: item.receipt_id,
          name: item.name,
          amount_cents: item.amount_cents,
          claims: claimants,
          is_shared: claimants.length > 1,
          per_person_cents: Math.round(item.amount_cents / count),
        };
      }
    );

    return {
      success: true,
      receipt: {
        ...receiptData,
        items: decoratedItems,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error occurred.";
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: msg,
    };
  }
}

/**
 * Claims or unclaims a specific receipt item on behalf of an anonymous guest.
 * @param tokenOrUrl Guest claim token or URL
 * @param itemId ID of the item being claimed
 * @param guestName Display name of the guest
 * @param claimed True to claim the item, false to unclaim
 * @returns Result status of the claim action
 */
export async function claimItemAsGuest(
  tokenOrUrl: string,
  itemId: string,
  guestName: string,
  claimed: boolean = true
): Promise<ClaimActionResult> {
  const trimmedName = (guestName || "").trim();
  if (!trimmedName) {
    return {
      success: false,
      error: "EMPTY_NAME",
      message: "Please enter your name before claiming items.",
    };
  }

  const token = extractToken(tokenOrUrl);
  if (!token) {
    return {
      success: false,
      error: "INVALID_TOKEN",
      message: "Invalid claim token.",
    };
  }

  if (USE_MOCK || !SUPABASE) {
    const tokenRecord = mockGuestTokens.find((t) => t.token === token);
    if (!tokenRecord) {
      return {
        success: false,
        error: "INVALID_TOKEN",
        message: "This claim link is invalid.",
      };
    }

    if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
      return {
        success: false,
        error: "EXPIRED_TOKEN",
        message: "This claim link has expired.",
      };
    }

    const items = mockReceiptItems[tokenRecord.receipt_id] ?? [];
    const itemExists = items.some((i) => i.id === itemId);
    if (!itemExists) {
      return {
        success: false,
        error: "ITEM_NOT_FOUND",
        message: "Item not found on this receipt.",
      };
    }

    const existingClaimIndex = mockItemClaims.findIndex(
      (c) =>
        c.item_id === itemId &&
        c.guest_name?.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (claimed) {
      if (existingClaimIndex === -1) {
        mockItemClaims.push({
          id: `claim-guest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          item_id: itemId,
          receipt_id: tokenRecord.receipt_id,
          guest_name: trimmedName,
          display_name: trimmedName,
          claimed_at: new Date().toISOString(),
        });
      }
    } else {
      if (existingClaimIndex !== -1) {
        mockItemClaims.splice(existingClaimIndex, 1);
      }
    }

    return {
      success: true,
      item_id: itemId,
      guest_name: trimmedName,
      claimed,
    };
  }

  try {
    const { data, error } = await SUPABASE.rpc("claim_item_as_guest", {
      p_token: token,
      p_item_id: itemId,
      p_guest_name: trimmedName,
      p_claimed: claimed,
    });

    if (error) {
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: error.message || "Failed to update item claim.",
      };
    }

    return data as ClaimActionResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error occurred.";
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: msg,
    };
  }
}

/**
 * Calculates a guest's running total across all claimed items.
 * Each item's cost is evenly divided among all current claimants.
 * @param items List of receipt items with claims
 * @param guestName Name of the guest
 * @returns Total owed in cents
 */
export function calculateGuestTotalCents(
  items: ReceiptItemWithClaims[],
  guestName: string
): number {
  const trimmed = (guestName || "").trim().toLowerCase();
  if (!trimmed) return 0;

  let total = 0;
  for (const item of items) {
    const isClaimedByGuest = item.claims.some(
      (c) => c.guest_name && c.guest_name.trim().toLowerCase() === trimmed
    );
    if (isClaimedByGuest) {
      const splitCount = Math.max(1, item.claims.length);
      total += Math.round(item.amount_cents / splitCount);
    }
  }
  return total;
}
