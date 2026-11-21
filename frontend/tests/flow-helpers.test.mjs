import test from "node:test";
import assert from "node:assert/strict";
import { loginDestination } from "../lib/loginDestination.js";
import { directoryHref, readDirectoryFilters } from "../lib/givingExchange.js";
import { matchesSearch } from "../lib/search.js";
import { formErrorMessage } from "../lib/formErrors.js";
import { validateProfile } from "../lib/validation.js";

test("login preserves selected NGO filters from the homepage through open requirements", () => {
  const target = directoryHref("Food", "Care & Community");
  const afterLogin = loginDestination("donor", target);
  assert.equal(afterLogin, target);
  assert.equal(loginDestination("donor", "/dashboard/donor/ngos?category=Food&query=Kitchen"), "/dashboard/donor/requirements?category=Food&query=Kitchen");
  assert.deepEqual(readDirectoryFilters(new URL(afterLogin, "http://localhost").search, ["Food"]), { category: "Food", query: "Care & Community", needsOnly: true });
});
test("login returns to a campaign amount or private receipt", () => {
  assert.equal(loginDestination("donor", "/campaigns/req-1?amount=250.50#donate"), "/campaigns/req-1?amount=250.50#donate");
  assert.equal(loginDestination("donor", "/donations/AOU-123"), "/donations/AOU-123");
  assert.equal(loginDestination("donor", "/campaigns/req-1?amount=99999999#donate"), "/campaigns/req-1#donate");
});
test("login return paths cannot redirect off-site or into another role workspace", () => {
  for (const target of [null, "//evil.test", "https://evil.test", "/\\evil.test", "/dashboard/admin", "/ngos/../../admin/login", "/ngos\n", "/%2f%2fevil.test"]) {
    assert.equal(loginDestination("donor", target), "/dashboard/donor", String(target));
  }
  assert.equal(loginDestination("ngo", directoryHref("Food")), "/dashboard/ngo");
  assert.equal(loginDestination("admin", "/ngos"), "/dashboard/admin");
});
test("search accepts extra whitespace, mixed case and words in a different order", () => {
  assert.ok(matchesSearch("Community School supplies Hyderabad", "  HYDERABAD   school  "));
  assert.ok(matchesSearch("First Aid Kit Healthcare", "kit first"));
  assert.ok(matchesSearch("Rice Food", "  "));
  assert.equal(matchesSearch("Rice Food", "rice education"), false);
});
test("validation errors use readable labels and keep the original explanation", () => {
  assert.equal(formErrorMessage({ deliveryPincode: ["Enter six digits."], non_field_errors: ["Check your details."] }), "Delivery PIN code: Enter six digits. Check your details.");
  assert.equal(formErrorMessage({ detail: "Account awaiting approval.", approvalStatus: "Pending" }), "Account awaiting approval.");
  assert.equal(formErrorMessage({ items: [{ quantity: ["Enter a positive quantity."] }] }), "Requested items: Quantity: Enter a positive quantity.");
  assert.equal(formErrorMessage({ items: [{}, { quantity: ["Enter a positive quantity."] }] }), "Requested items: Quantity: Enter a positive quantity.");
  assert.match(formErrorMessage({}), /could not be completed/);
});
test("profile validation accepts formatted phone numbers and rejects invalid phone, PIN code and confirmation", () => {
  const profile = { firstName:"Test", lastName:"Donor", email:"test@example.invalid", phone:"+91 98765 43210", address:"Sample road", city:"Hyderabad", state:"Telangana", pincode:"500001", password:"SamplePass!36", confirmPassword:"SamplePass!36" };
  assert.deepEqual(validateProfile(profile, "donor"), {});
  const invalid = validateProfile({ ...profile, phone:"123", pincode:"000001", confirmPassword:"different" }, "donor");
  assert.ok(invalid.phone && invalid.pincode && invalid.confirmPassword);
  assert.equal(validateProfile({ ...profile, password:undefined, confirmPassword:undefined }, "donor", false).password, undefined);
});
