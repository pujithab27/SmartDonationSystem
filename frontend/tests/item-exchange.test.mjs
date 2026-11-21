import test from "node:test";
import assert from "node:assert/strict";
import { parseDonationSpeech, quantityLabel, localDateTime, openRequestItems, requestDonationHref, donationMatchesHref, prioritizeRequestCandidates } from "../lib/itemExchange.js";
test('voice handles compound quantities and common split item names', () => {
  const items = [{id:'notebook',name:'Notebook'}, {id:'backpack',name:'Backpack'}, {id:'rice',name:'Rice'}];
  assert.deepEqual(parseDonationSpeech('Twenty-five note books in Guntur.',items),{itemId:'notebook',quantity:'25',city:'Guntur'});
  assert.deepEqual(parseDonationSpeech('I want to donate one back pack in Guntur',items),{itemId:'backpack',quantity:'1',city:'Guntur'});
  assert.equal(parseDonationSpeech('one hundred and twenty five notebooks',items).quantity,'125');
  assert.equal(parseDonationSpeech('five point two kilograms of rice',items).quantity,'');
  assert.equal(parseDonationSpeech('zero point two five kilograms of rice',items).quantity,'');
  assert.equal(parseDonationSpeech('One backpack in Guntur. I want to donate one backpack in Guntur. I want',items).city,'Guntur');
});
const catalog = [{id: "rice", name: "Rice"}, {id: "book", name: "Book"}, {id: "school-bag", name: "School Bag"}];
test("voice input fills item, quantity and city for review", () => {
  assert.deepEqual(parseDonationSpeech("5 kg of rice in Bengaluru", catalog), {itemId: "rice", quantity: "5", city: "Bengaluru"});
  assert.deepEqual(parseDonationSpeech("five kilograms of rice in Bengaluru", catalog), {itemId: "rice", quantity: "5", city: "Bengaluru"});
  assert.deepEqual(parseDonationSpeech("12 books in Hyderabad", catalog), {itemId: "book", quantity: "12", city: "Hyderabad"});
});
test("voice input leaves unknown items alone and clears unsupported decimal quantities", () => {
  assert.deepEqual(parseDonationSpeech("2.5 kg of rice", catalog), {itemId: "rice", quantity: ""});
  assert.deepEqual(parseDonationSpeech("I want to help", catalog), {});
  assert.equal(parseDonationSpeech("A school bag", catalog).itemId, "school-bag");
});
test("quantity labels keep catalog units and use natural plurals", () => {
  assert.equal(quantityLabel(1, "box"), "1 box");
  assert.equal(quantityLabel(3, "box"), "3 boxes");
  assert.equal(quantityLabel(1, "piece"), "1 piece");
  assert.equal(quantityLabel(12, "piece"), "12 pieces");
  assert.equal(quantityLabel(2.5, "kg"), "2.5 kg");
  assert.equal(quantityLabel(2, "litre"), "2 litres");
});
test("pickup datetime retains the same instant across local conversion", () => {
  const original = new Date("2026-11-12T10:30:00Z");
  assert.equal(new Date(localDateTime(original.toISOString())).getTime(), original.getTime());
  assert.equal(localDateTime(null), "");
});

test("choosing an NGO request carries both item and request through the saved donation", () => {
  const give = new URL(requestDonationHref(42, "school-bag"), "http://localhost:3000");
  assert.equal(give.pathname, "/dashboard/donor/give");
  assert.equal(give.searchParams.get("item"), "school-bag");
  const matches = new URL(donationMatchesHref(17, give.searchParams.get("request")), give.origin);
  assert.equal(matches.pathname, "/dashboard/donor/matches");
  assert.equal(matches.searchParams.get("donation"), "17");
  assert.equal(matches.searchParams.get("request"), "42");
  assert.equal(donationMatchesHref(17), "/dashboard/donor/matches?donation=17");
});

test("selected requests come first without changing eligibility or the order of other matches", () => {
  const candidates = [{requestId: 1, sameCity: true}, {requestId: 2, sameCity: true}, {requestId: 42, sameCity: false}];
  assert.deepEqual(prioritizeRequestCandidates(candidates, "42").map((entry) => entry.requestId), [42, 1, 2]);
  assert.deepEqual(candidates.map((entry) => entry.requestId), [1, 2, 42]);
  assert.deepEqual(prioritizeRequestCandidates(candidates, "999"), candidates);
  assert.deepEqual(prioritizeRequestCandidates(candidates, null), candidates);
  assert.deepEqual(prioritizeRequestCandidates([], "42"), []);
});

test("request donation actions exclude closed, expired, reserved and fulfilled needs", () => {
  const request = {status: "Open", neededBy: "2026-10-29", items: [
    {itemId: "rice", quantity: 10, remaining: 2.5},
    {itemId: "book", quantity: 5, remaining: 0, reserved: 5},
    {itemId: "school-bag", quantity: 3, remaining: 0, fulfilled: 3},
  ]};
  assert.deepEqual(openRequestItems(request, "2026-10-29").map((entry) => entry.itemId), ["rice"]);
  assert.deepEqual(openRequestItems(request, "2026-10-30"), []);
  assert.deepEqual(openRequestItems({...request, status: "Closed"}, "2026-10-29"), []);
  assert.deepEqual(openRequestItems(null, "2026-10-29"), []);
  assert.deepEqual(openRequestItems({...request, neededBy: null}, "2026-10-30").map((entry) => entry.itemId), ["rice"]);
});
