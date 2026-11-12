/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  loadGroupDetail,
  loadGroupList,
  type GroupDetail,
  type GroupsClient,
} from "@/lib/group-data";

/** Options for fake groups client. */
type FakeGroupsData = {
  groups?: { id: string; name: string }[];
  detail?: GroupDetail;
};

/**
 * Creates a fake groups client for testing.
 * @param data Mocked response data
 * @returns Fake GroupsClient
 */
function createFakeGroupsClient(data: FakeGroupsData) {
  const client: GroupsClient = {
    from() {
      return {
        select() {
          return {
            order() {
              return Promise.resolve({
                data: data.groups ?? [],
                error: null,
              });
            },
          };
        },
      };
    },
    rpc(fn: string) {
      if (fn === "get_group" && data.detail) {
        return Promise.resolve({ data: data.detail, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { code: "42501", message: "Forbidden" },
      });
    },
  };
  return client;
}

describe("groups page data loading", () => {
  const fakeGroups = [
    { id: "g1", name: "Apartment 402" },
    { id: "g2", name: "Road Trip" },
  ];
  const fakeDetail: GroupDetail = {
    group: {
      id: "g1",
      name: "Apartment 402",
      invite_code: "APT402XY",
      created_by: "u1",
      created_at: "2026-10-01T00:00:00Z",
    },
    members: [
      {
        user_id: "u1",
        display_name: "Alex",
        role: "owner",
        joined_at: "2026-10-01T00:00:00Z",
      },
    ],
    receipts: [],
  };

  it("lists groups for the user", async () => {
    const client = createFakeGroupsClient({ groups: fakeGroups });
    const res = await loadGroupList({ client });
    assert.equal(res.status, "ok");
    if (res.status === "ok") {
      assert.equal(res.groups.length, 2);
      assert.equal(res.groups[0].name, "Apartment 402");
    }
  });

  it("loads detail for a valid group", async () => {
    const client = createFakeGroupsClient({ detail: fakeDetail });
    const res = await loadGroupDetail("g1", { client });
    assert.equal(res.status, "ok");
    if (res.status === "ok") {
      assert.equal(res.detail.group.id, "g1");
      assert.equal(res.detail.group.name, "Apartment 402");
      assert.equal(res.detail.members.length, 1);
      assert.equal(res.detail.members[0].role, "owner");
    }
  });

  it("returns forbidden for unknown or unauthorized group", async () => {
    const client = createFakeGroupsClient({});
    const res = await loadGroupDetail("unknown-group", { client });
    assert.equal(res.status, "forbidden");
  });
});
