import test from "node:test";
import assert from "node:assert/strict";
import { createTabSession } from "../lib/tabSession.js";

const key = "allofus.sessionScope";
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const donor = { role: "donor", email: "donor@example.test", name: "Donor" };
const ngo = { role: "ngo", email: "ngo@example.test", name: "NGO" };
let sequence = 0;
const api = () => import(`../lib/api.js?tabs=${++sequence}`);
function storage(initial = []) {
  const values = new Map(initial);
  return { values, getItem: (name) => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
}
function tab(store = storage()) { globalThis.window = { sessionStorage: store }; return store; }
test.afterEach(() => { delete globalThis.window; });

test("tab selector persists on reload, new tabs differ, and storage contains no credentials", () => {
  const first = tab();
  const session = createTabSession().current();
  assert.match(session.scope, /^[a-f0-9]{32}$/);
  session.csrfToken = "private-csrf";
  assert.equal(createTabSession().current().scope, session.scope);
  assert.deepEqual([...first.values], [[key, session.scope]]);
  tab();
  assert.notEqual(createTabSession().current().scope, session.scope);
});

test("invalid or blocked sessionStorage never falls back to a shared browser login", () => {
  tab(storage([[key, "invalid"]]));
  assert.match(createTabSession().current().scope, /^[a-f0-9]{32}$/);
  globalThis.window = { get sessionStorage() { throw new Error("blocked"); } };
  const first = createTabSession(), second = createTabSession();
  assert.equal(first.current(), first.current());
  assert.notEqual(first.current().scope, second.current().scope);
});

test("a login in a duplicated tab uses a fresh scope and preserves the original tab", async () => {
  const originalStore = tab();
  const first = await api();
  const sessions = new Map();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const scope = options.headers["X-Session-Scope"];
    calls.push({ url, scope });
    if (url.endsWith("csrf/")) return reply({ csrfToken: `csrf-${scope}` });
    if (url.endsWith("login/")) {
      const identity = JSON.parse(options.body).role === "donor" ? donor : ngo;
      sessions.set(scope, identity);
      return reply({ session: identity, csrfToken: `rotated-${scope}` });
    }
    if (url.endsWith("logout/")) { sessions.delete(scope); return reply({}); }
    return reply({ session: sessions.get(scope) || null, data: first.emptyData });
  };
  await first.loginAccount("donor", donor.email, "test-password");
  const donorScope = originalStore.getItem(key);
  const duplicate = tab(storage([[key, donorScope]]));
  const second = await api();
  await second.refreshAppData();
  assert.deepEqual(second.getSession(), donor);
  await second.loginAccount("ngo", ngo.email, "test-password");
  assert.notEqual(duplicate.getItem(key), donorScope);
  await Promise.all([first.refreshAppData(true), second.refreshAppData(true)]);
  assert.deepEqual(first.getSession(), donor);
  assert.deepEqual(second.getSession(), ngo);
  await second.clearSession();
  await first.refreshAppData(true);
  assert.equal(second.getSession(), null);
  assert.deepEqual(first.getSession(), donor);
  assert.ok(calls.every((call) => /^[a-f0-9]{32}$/.test(call.scope)));
});

test("a stale refresh cannot restore the previous identity during sign-in", async () => {
  tab();
  const client = await api();
  let resolveOld, resolveLogin;
  globalThis.fetch = () => new Promise((resolve) => { resolveOld = resolve; });
  const old = client.refreshAppData();
  globalThis.fetch = async (url) => {
    if (url.endsWith("csrf/")) return reply({ csrfToken: "token" });
    if (url.endsWith("login/")) return new Promise((resolve) => { resolveLogin = resolve; });
    return reply({ session: ngo, data: client.emptyData });
  };
  const login = client.loginAccount("ngo", ngo.email, "test-password");
  await new Promise((resolve) => setImmediate(resolve));
  resolveOld(reply({ session: donor, data: client.emptyData }));
  await old;
  assert.equal(client.getSession(), null);
  await assert.rejects(client.updateProfile({}), /wait for sign-in/);
  await client.refreshAppData(true);
  assert.equal(client.getSession(), null);
  resolveLogin(reply({ session: ngo, csrfToken: "new-token" }));
  await login;
  assert.deepEqual(client.getSession(), ngo);
});

test("a delayed write keeps its original scope and cannot refresh a different account", async () => {
  tab();
  const client = await api();
  let resolveCsrf, initialScope, writtenScope;
  globalThis.fetch = (url, options) => {
    initialScope = options.headers["X-Session-Scope"];
    return new Promise((resolve) => { resolveCsrf = resolve; });
  };
  const write = client.updateProfile({ firstName: "Old account" });
  const rejected = assert.rejects(write, /Check the original account/);
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("csrf/")) return reply({ csrfToken: "new-csrf" });
    if (url.endsWith("login/")) return reply({ session: ngo, csrfToken: "rotated" });
    if (url.endsWith("profile/")) { writtenScope = options.headers["X-Session-Scope"]; return reply({}); }
    return reply({ session: ngo, data: client.emptyData });
  };
  await client.loginAccount("ngo", ngo.email, "test-password");
  resolveCsrf(reply({ csrfToken: "old-csrf" }));
  await rejected;
  assert.equal(writtenScope, initialScope);
  assert.deepEqual(client.getSession(), ngo);
});

test("concurrent writes share one CSRF initialization", async () => {
  tab();
  const client = await api();
  let csrfCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("csrf/")) { csrfCalls++; return reply({ csrfToken: "one-token" }); }
    if (options.method === "PATCH") assert.equal(options.headers["X-CSRFToken"], "one-token");
    return reply({ session: donor, data: client.emptyData });
  };
  await Promise.all([client.updateProfile({}), client.updateSettings({})]);
  assert.equal(csrfCalls, 1);
});

test("authentication stays locked until its account refresh finishes", async () => {
  tab();
  const client = await api();
  let resolveState;
  globalThis.fetch = async (url) => {
    if (url.endsWith("csrf/")) return reply({ csrfToken: "csrf" });
    if (url.endsWith("login/")) return reply({ session: donor, csrfToken: "rotated" });
    return new Promise((resolve) => { resolveState = resolve; });
  };
  const login = client.loginAccount("donor", donor.email, "test-password");
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(client.clearSession(), /wait for sign-in/);
  await assert.rejects(client.loginAccount("ngo", ngo.email, "test-password"), /wait for sign-in/);
  resolveState(reply({ session: donor, data: client.emptyData }));
  await login;
  assert.deepEqual(client.getSession(), donor);
});

test("logout rejects stale private refreshes and clears the active tab", async () => {
  tab();
  const client = await api();
  globalThis.fetch = async () => reply({ session: donor, data: client.emptyData });
  await client.refreshAppData();
  let resolveOld;
  globalThis.fetch = () => new Promise((resolve) => { resolveOld = resolve; });
  const old = client.refreshAppData(true);
  globalThis.fetch = async (url) => url.endsWith("csrf/") ? reply({ csrfToken: "token" }) : reply({ session: null, data: client.emptyData });
  await client.clearSession();
  resolveOld(reply({ session: donor, data: { ...client.emptyData, users: [donor] } }));
  await old;
  assert.equal(client.getSession(), null);
  assert.deepEqual(client.getSnapshot().data.users, []);
});
