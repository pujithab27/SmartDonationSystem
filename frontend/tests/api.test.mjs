import test from "node:test";
import assert from "node:assert/strict";

const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const session = { role: "donor", email: "donor@example.com", name: "Donor" };
let instance = 0;
const api = () => import(`../lib/api.js?test=${++instance}`);

test("signup sends CSRF and credentials without establishing a login session", async () => {
  const client = await api();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("csrf/")) return reply({ csrfToken: "first-token" });
    if (url.endsWith("signup/")) return reply({ session: null, user: { approvalStatus: "Pending" }, csrfToken: "rotated-token" }, 201);
    return reply({ session: null, data: client.emptyData });
  };
  await client.registerAccount("donor", { email: session.email, password: "ExamplePassword!", agree: "on" });
  assert.equal(calls[1].options.headers["X-CSRFToken"], "first-token");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(JSON.parse(calls[1].options.body).agree, true);
  assert.equal(client.getSession(), null);
  assert.equal(client.getSnapshot().ready, true);
});

test("invalid credentials never establish a client session", async () => {
  const client = await api();
  globalThis.fetch = async (url) => url.endsWith("csrf/") ? reply({ csrfToken: "token" }) : reply({ detail: "Email, password, or selected role is incorrect." }, 401);
  await assert.rejects(client.loginAccount("donor", "user@example.com", "wrong"), /incorrect/);
  assert.equal(client.getSession(), null);
});

test("field errors from Django are surfaced to forms", async () => {
  const client = await api();
  globalThis.fetch = async (url) => url.endsWith("csrf/") ? reply({ csrfToken: "token" }) : reply({ email: ["Already registered."] }, 400);
  await assert.rejects(client.registerAccount("donor", { agree: true }), (error) => {
    assert.equal(error.fields.email[0], "Already registered.");
    assert.match(error.message, /Email address: Already registered/);
    return true;
  });
});

test("failed refresh clears previous private data and exposes an error", async () => {
  const client = await api();
  globalThis.fetch = async () => reply({ session, data: { ...client.emptyData, donations: [{ id: "private" }] } });
  await client.refreshAppData();
  globalThis.fetch = async () => { throw new Error("offline"); };
  await client.refreshAppData(true);
  assert.equal(client.getSession(), null);
  assert.deepEqual(client.getSnapshot().data.donations, []);
  assert.match(client.getSnapshot().error, /connect to the service/);
});

test("a stale refresh cannot overwrite a newer session response", async () => {
  const client = await api();
  let resolveOld;
  globalThis.fetch = () => new Promise((resolve) => { resolveOld = resolve; });
  const old = client.refreshAppData();
  globalThis.fetch = async () => reply({ session, data: client.emptyData });
  await client.refreshAppData(true);
  resolveOld(reply({ session: null, data: client.emptyData }));
  await old;
  assert.deepEqual(client.getSession(), session);
});

test("pledge resolves to the receipt id only after the server accepts it", async () => {
  const client = await api();
  globalThis.fetch = async (url) => {
    if (url.endsWith("csrf/")) return reply({ csrfToken: "token" });
    if (url.endsWith("donations/")) return reply({ id: "AOU-123" }, 201);
    return reply({ session, data: client.emptyData });
  };
  assert.equal(await client.recordDonation({ campaignId: "req-1", amount: 500, transactionId: "once" }), "AOU-123");
});

test("pending approval response keeps the applicant signed out", async () => {
  const client = await api();
  globalThis.fetch = async (url) => url.endsWith("csrf/") ? reply({ csrfToken: "token" }) : reply({ detail: "Awaiting administrator approval.", approvalStatus: "Pending" }, 403);
  await assert.rejects(client.loginAccount("ngo", "ngo@example.com", "password"), (error) => error.status === 403 && error.fields.approvalStatus === "Pending");
  assert.equal(client.getSession(), null);
});

test("stale admin decision is not reported as successful or followed by a state mutation", async () => {
  const client = await api();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("csrf/") ? reply({ csrfToken: "token" }) : reply({ detail: "Refresh and review this account again." }, 409);
  };
  await assert.rejects(client.reviewAccount({ id: 5, accessVersion: 2 }, "Rejected", "Details incomplete"), (error) => error.status === 409);
  assert.deepEqual(JSON.parse(calls[1].options.body), { action: "Rejected", reason: "Details incomplete", version: 2 });
  assert.equal(calls.length, 2);
});
