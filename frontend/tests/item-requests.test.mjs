import test from "node:test";
import assert from "node:assert/strict";
import { filterOrganizations, formatItemQuantity, deliveryLocation, requestProgress } from "../lib/itemRequests.js";

const ngos = [
  {email: "kitchen@example.com", ngoName: "Community Kitchen", status: "Verified", city: "Hyderabad", state: "Telangana", description: "Family support"},
  {email: "school@example.com", ngoName: "Learning Together", status: "Verified", city: "Chennai", state: "Tamil Nadu", description: "School supplies"},
  {email: "pending@example.com", ngoName: "Pending NGO", status: "Pending", city: "Hyderabad"},
];
const requests = [
  {ownerEmail: ngos[0].email, status: "Open", title: "Kitchen supplies", items: [{name: "Rice", category: "Food"}]},
  {ownerEmail: ngos[1].email, status: "Closed", title: "Books for school", items: [{name: "Textbook", category: "Education"}]},
];

test("NGO search matches names, cities and open-request items across words", () => {
  for (const query of ["  KITCHEN  ", "hyderabad", "rice", "Hyderabad rice"])
    assert.deepEqual(filterOrganizations(ngos, requests, query).map((ngo) => ngo.email), [ngos[0].email]);
  assert.equal(filterOrganizations(ngos, requests, "Chennai rice").length, 0);
  assert.equal(filterOrganizations(ngos, requests, "textbook").length, 0);
});
test("NGO filters exclude pending accounts and closed needs", () => {
  assert.equal(filterOrganizations(ngos, requests).length, 2);
  assert.equal(filterOrganizations(ngos, requests, "", "All", true).length, 1);
  assert.equal(filterOrganizations(ngos, requests, "", "Food").length, 1);
  assert.equal(filterOrganizations(ngos, requests, "", "Education").length, 0);
});
test("quantities retain the item's unit and fractional weights", () => {
  assert.equal(formatItemQuantity({quantity: "25.50", unit: "kg"}), "25.5 kg");
  assert.equal(formatItemQuantity({quantity: "10.00", unit: "pair"}), "10 pairs");
  assert.equal(formatItemQuantity({quantity: "1.00", unit: "box"}), "1 box");
  assert.equal(formatItemQuantity({quantity: "2.00", unit: "box"}), "2 boxes");
  assert.equal(formatItemQuantity({quantity: "1.50", unit: "litre"}), "1.5 litres");
});
test("delivery location uses the NGO request address", () => {
  assert.equal(deliveryLocation({deliveryAddress: "12 Community Road", deliveryCity: "Hyderabad", deliveryState: "Telangana", deliveryPincode: "500001"}), "12 Community Road, Hyderabad, Telangana, 500001");
});

test("request progress reports physical receipt separately from reservations", () => {
  const request = {status: "Open", items: [{quantity: 30, fulfilled: 10, reserved: 0}]};
  assert.deepEqual(requestProgress(request), {percent: 33, complete: false, status: "Partly fulfilled"});
  assert.deepEqual(requestProgress({status: "Open", items: [{quantity: 30, fulfilled: 0, reserved: 30}]}), {percent: 0, complete: false, status: "Awaiting delivery"});
  assert.deepEqual(requestProgress({status: "Open", items: [{quantity: 30, fulfilled: 30}]}), {percent: 100, complete: true, status: "Fulfilled"});
  assert.equal(requestProgress({...request, status: "Closed"}).status, "Closed");
});

test("mixed units use average item fulfillment and cannot round unfinished requests to complete", () => {
  const mixed = {status: "Open", items: [{quantity: 100, fulfilled: 100, unit: "kg"}, {quantity: 2, fulfilled: 0, unit: "piece"}]};
  assert.equal(requestProgress(mixed).percent, 50);
  assert.deepEqual(requestProgress({status: "Open", items: [{quantity: 1000, fulfilled: 999}]}), {percent: 99, complete: false, status: "Partly fulfilled"});
  assert.deepEqual(requestProgress({status: "Open", items: []}), {percent: 0, complete: false, status: "Open"});
});
