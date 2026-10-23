import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mockGroupDetails, mockGroups } from "@/lib/mock";

describe("groups page mock data", () => {
  it("lists at least one group", () => {
    assert.ok(mockGroups.length > 0);
  });

  it("has a detail record for every listed group", () => {
    for (const g of mockGroups) {
      assert.ok(mockGroupDetails[g.id], `missing details for ${g.id}`);
    }
  });

  it("detail name and id match the list entry", () => {
    for (const g of mockGroups) {
      const d = mockGroupDetails[g.id];
      assert.equal(d.group.id, g.id);
      assert.equal(d.group.name, g.name);
    }
  });

  it("every group has exactly one owner", () => {
    for (const g of mockGroups) {
      const owners = mockGroupDetails[g.id].members.filter(
        (m: { role: string }) => m.role === "owner"
      );
      assert.equal(owners.length, 1, `${g.id} should have one owner`);
    }
  });

  it("unknown ids have no details (screen shows 'not a member')", () => {
    assert.equal(mockGroupDetails["does-not-exist"], undefined);
  });
});