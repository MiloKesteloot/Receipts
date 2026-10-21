// Flip to false when you want the real Supabase data again.
export const USE_MOCK = true;

export const mockGroups = [
  { id: "mock-1", name: "Apartment 402" },
  { id: "mock-2", name: "Road Trip 2026" },
  { id: "mock-3", name: "Office Lunch Crew" },
];

// Same shape that get_group returns.
export const mockGroupDetails: Record<string, any> = {
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
};