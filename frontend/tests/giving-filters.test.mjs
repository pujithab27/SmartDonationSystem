import test from "node:test";
import assert from "node:assert/strict";
import { directoryHref, readDirectoryFilters, matchingNeeds } from "../lib/givingExchange.js";
import { filterOrganizations } from "../lib/itemRequests.js";

test("giving-category links carry the selected category through to matching open NGO needs", () => {
  const organizations = [
    { email: "a@test.invalid", ngoName: "Care & Community", city: "Hyderabad", status: "Verified" },
    { email: "b@test.invalid", ngoName: "Book Bank", city: "Chennai", status: "Verified" },
  ];
  const requests = [
    { ownerEmail: "a@test.invalid", status: "Open", title: "Pantry", items: [{ name: "Rice", category: "Food" }, { name: "Flour", category: "Food" }] },
    { ownerEmail: "b@test.invalid", status: "Closed", title: "Old request", items: [{ name: "Rice", category: "Food" }] },
    { ownerEmail: "b@test.invalid", status: "Open", title: "Reading", items: [{ name: "Textbook", category: "Education" }] },
  ];
  const url = new URL(directoryHref("Food", "Care & Community"), "http://localhost");
  assert.equal(url.pathname, "/dashboard/donor/requirements");
  const filters = readDirectoryFilters(url.search, ["Food", "Education"]);
  assert.equal(filters.query, "Care & Community");
  assert.equal(filters.needsOnly, true);
  assert.equal(matchingNeeds(requests, filters.category).length, 1);
  assert.deepEqual(filterOrganizations(organizations, requests, filters.query, filters.category, filters.needsOnly).map((ngo) => ngo.email), ["a@test.invalid"]);
});

test("directory links tolerate unknown filters and bound external query input", () => {
  assert.deepEqual(readDirectoryFilters("?category=Unknown&needs=all", ["Food"]), { query: "", category: "All", needsOnly: false });
  assert.equal(readDirectoryFilters("?query=" + "a".repeat(350), []).query.length, 200);
  const url = new URL(directoryHref("Healthcare"), "http://localhost");
  assert.deepEqual(readDirectoryFilters(url.search, ["Healthcare"]), { query: "", category: "Healthcare", needsOnly: true });
});
