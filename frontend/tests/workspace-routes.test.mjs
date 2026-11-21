import test from "node:test";
import assert from "node:assert/strict";
import { retiredWorkspaceDestination } from "../lib/workspaceRoutes.js";

test("retired donor pages redirect into the item-donation workflow", () => {
  assert.equal(retiredWorkspaceDestination("donor", "campaigns"), "/dashboard/donor/requirements");
  assert.equal(retiredWorkspaceDestination("donor", "saved"), "/dashboard/donor/requirements");
  assert.equal(retiredWorkspaceDestination("donor", "donations"), "/dashboard/donor/items");
  assert.equal(retiredWorkspaceDestination("donor", "settings"), "/dashboard/donor");
  assert.equal(retiredWorkspaceDestination("donor", "ngos", {category: "Food", query: "Care & Community", next: "https://example.test"}), "/dashboard/donor/requirements?category=Food&query=Care+%26+Community");
});

test("retired NGO pages redirect to requests, matches or profile", () => {
  for (const section of ["campaigns", "settings"]) assert.equal(retiredWorkspaceDestination("ngo", section), "/dashboard/ngo");
  assert.equal(retiredWorkspaceDestination("ngo", "create"), null);
  assert.equal(retiredWorkspaceDestination("ngo", "donations"), "/dashboard/ngo/matches");
  assert.equal(retiredWorkspaceDestination("ngo", "verification"), "/dashboard/ngo/profile");
});

test("active pages and administrator tools are not retired", () => {
  for (const role of ["donor", "ngo"]) {
    assert.equal(retiredWorkspaceDestination(role, "nearby"), `/dashboard/${role}`);
    for (const section of ["overview", "create", "requests", "profile", "give", "requirements", "items", "matches", "notifications"]) {
      assert.equal(retiredWorkspaceDestination(role, section), null);
    }
  }
  for (const section of ["donations", "settings", "donors", "ngos", "tracking", "requests"]) assert.equal(retiredWorkspaceDestination("admin", section), null);
  assert.equal(retiredWorkspaceDestination("admin", "campaigns"), "/dashboard/admin/tracking");
  assert.equal(retiredWorkspaceDestination("admin", "reports"), "/dashboard/admin/tracking");
  assert.equal(retiredWorkspaceDestination("constructor", "campaigns"), null);
  assert.equal(retiredWorkspaceDestination("donor", "constructor"), null);
});

test("legacy directory filters are bounded and repeated parameters are ignored", () => {
  const destination = retiredWorkspaceDestination("donor", "ngos", {category: ["Food", "Clothing"], query: "a".repeat(350)});
  const params = new URL(destination, "http://localhost").searchParams;
  assert.equal(params.has("category"), false);
  assert.equal(params.get("query").length, 200);
});
