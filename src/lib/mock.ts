/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Toggle between local mock group data and Supabase backend.
 */
export const USE_MOCK = true;

/**
 * Seed groups list for offline development.
 * Initially only Apartment 402 is joined so users can test joining Road Trip 2026 or Office Lunch Crew.
 */
export const mockGroups = [
  { id: "mock-1", name: "Apartment 402" },
];


export type MockMember = {
  user_id: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export type MockReceipt = {
  id: string;
  title: string;
  total_cents: number;
  created_at: string;
};

export type MockGroupDetail = {
  group: {
    id: string;
    name: string;
    invite_code?: string;
    created_by: string;
    created_at: string;
  };
  members: MockMember[];
  receipts: MockReceipt[];
};

/**
 * Detailed mock group records including members and receipts.
 */
export const mockGroupDetails: Record<string, MockGroupDetail> = {


  "mock-1": {
    group: {
      id: "mock-1",
      name: "Apartment 402",
      invite_code: "JEW5SW2M",
      created_by: "u1",
      created_at: "2026-10-01T12:00:00Z",
    },
    members: [
      { user_id: "u1", display_name: "Alex", role: "owner", joined_at: "2026-10-01T12:00:00Z" },
      { user_id: "u2", display_name: "Sam", role: "member", joined_at: "2026-10-02T09:30:00Z" },
      { user_id: "u3", display_name: "Jordan", role: "member", joined_at: "2026-10-03T18:10:00Z" },
    ],
    receipts: [
      { id: "r1", title: "Costco run", total_cents: 8423, created_at: "2026-10-05T17:00:00Z" },
      { id: "r2", title: "Internet bill", total_cents: 6000, created_at: "2026-10-08T10:00:00Z" },
    ],
  },
  "mock-2": {
    group: {
      id: "mock-2",
      name: "Road Trip 2026",
      invite_code: "K7Q2XPLM",
      created_by: "u2",
      created_at: "2026-09-15T12:00:00Z",
    },
    members: [
      { user_id: "u2", display_name: "Sam", role: "owner", joined_at: "2026-09-15T12:00:00Z" },
      { user_id: "u1", display_name: "Alex", role: "member", joined_at: "2026-09-16T12:00:00Z" },
    ],
    receipts: [], // handy for testing the empty state
  },
  "mock-3": {
    group: {
      id: "mock-3",
      name: "Office Lunch Crew",
      invite_code: "LUNCH123",
      created_by: "u1",
      created_at: "2026-08-20T12:00:00Z",
    },
    members: [{ user_id: "u1", display_name: "Alex", role: "owner", joined_at: "2026-08-20T12:00:00Z" }],
    receipts: [],
  },
  "group-apt402": {
    group: {
      id: "group-apt402",
      name: "Apartment 402",
      invite_code: "APT402",
      created_by: "u1",
      created_at: "2026-10-01T12:00:00Z",
    },
    members: [
      { user_id: "u1", display_name: "Alex", role: "owner", joined_at: "2026-10-01T12:00:00Z" },
      { user_id: "u2", display_name: "Sam", role: "member", joined_at: "2026-10-02T09:30:00Z" },
      { user_id: "u3", display_name: "Jordan", role: "member", joined_at: "2026-10-03T18:10:00Z" },
    ],
    receipts: [
      { id: "r1", title: "Costco run", total_cents: 8423, created_at: "2026-10-05T17:00:00Z" },
      { id: "r2", title: "Internet bill", total_cents: 6000, created_at: "2026-10-08T10:00:00Z" },
    ],
  },
  "group-beach26": {
    group: {
      id: "group-beach26",
      name: "Beach House Trip",
      invite_code: "BEACH26",
      created_by: "u1",
      created_at: "2026-09-01T12:00:00Z",
    },
    members: [
      { user_id: "u1", display_name: "Alex", role: "owner", joined_at: "2026-09-01T12:00:00Z" },
    ],
    receipts: [],
  },
};

/**
 * Line item on a receipt.
 */
export type MockReceiptItem = {
  id: string;
  receipt_id: string;
  name: string;
  amount_cents: number;
  created_at?: string;
};

/**
 * Claim record associating an item with either a member or a guest.
 */
export type MockItemClaim = {
  id: string;
  item_id: string;
  receipt_id: string;
  user_id?: string | null;
  display_name?: string | null;
  guest_name?: string | null;
  claimed_at: string;
};

/**
 * Shareable guest claim link token.
 */
export type MockGuestToken = {
  token: string;
  receipt_id: string;
  created_at: string;
  expires_at?: string | null;
};

/**
 * In-memory receipt line items for mock receipts.
 */
export const mockReceiptItems: Record<string, MockReceiptItem[]> = {
  r1: [
    { id: "item-r1-1", receipt_id: "r1", name: "Paper Towels (12 pack)", amount_cents: 2499 },
    { id: "item-r1-2", receipt_id: "r1", name: "Olive Oil 2L", amount_cents: 1849 },
    { id: "item-r1-3", receipt_id: "r1", name: "Organic Avocados 6ct", amount_cents: 999 },
    { id: "item-r1-4", receipt_id: "r1", name: "Rotisserie Chicken", amount_cents: 499 },
    { id: "item-r1-5", receipt_id: "r1", name: "Sparkling Water 24pk", amount_cents: 1599 },
    { id: "item-r1-6", receipt_id: "r1", name: "Organic Spinach 1lb", amount_cents: 978 },
  ],
  r2: [
    { id: "item-r2-1", receipt_id: "r2", name: "Fiber Gigabit Internet", amount_cents: 6000 },
  ],
};

/**
 * In-memory item claims for mock development.
 */
export const mockItemClaims: MockItemClaim[] = [
  { id: "claim-1", item_id: "item-r1-1", receipt_id: "r1", user_id: "u1", display_name: "Alex", claimed_at: "2026-10-05T17:05:00Z" },
  { id: "claim-2", item_id: "item-r1-2", receipt_id: "r1", user_id: "u1", display_name: "Alex", claimed_at: "2026-10-05T17:05:00Z" },
  { id: "claim-3", item_id: "item-r1-6", receipt_id: "r1", user_id: "u1", display_name: "Alex", claimed_at: "2026-10-05T17:06:00Z" },
  { id: "claim-4", item_id: "item-r1-2", receipt_id: "r1", user_id: "u2", display_name: "Sam", claimed_at: "2026-10-05T17:10:00Z" },
  { id: "claim-5", item_id: "item-r1-4", receipt_id: "r1", user_id: "u2", display_name: "Sam", claimed_at: "2026-10-05T17:10:00Z" },
  { id: "claim-6", item_id: "item-r2-1", receipt_id: "r2", user_id: "u1", display_name: "Alex", claimed_at: "2026-10-08T10:05:00Z" },
  { id: "claim-7", item_id: "item-r2-1", receipt_id: "r2", user_id: "u2", display_name: "Sam", claimed_at: "2026-10-08T10:05:00Z" },
  { id: "claim-8", item_id: "item-r2-1", receipt_id: "r2", user_id: "u3", display_name: "Jordan", claimed_at: "2026-10-08T10:05:00Z" },
];

/**
 * In-memory guest claim tokens.
 */
export const mockGuestTokens: MockGuestToken[] = [
  {
    token: "mock-claim-r1-demo",
    receipt_id: "r1",
    created_at: "2026-10-05T17:00:00Z",
    expires_at: null,
  },
];
