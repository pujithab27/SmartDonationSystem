// Exercise real API clients as independent tabs sharing ONE browser cookie jar.
// Uses only the labelled local QA accounts prepared by prepare_exchange_qa.py.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM, CookieJar } from 'jsdom';

const output = new URL('../../output/qa-private/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('accounts.json', output), 'utf8'));
const origin = fixture.origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const cookieJar = new CookieJar();
const realFetch = globalThis.fetch;
const tabs = [], checks = [];
let instance = 0;
const key = 'allofus.sessionScope';
function pass(name) { checks.push(name); console.log(`PASS: ${name}`); }

globalThis.fetch = async (path, options = {}) => {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin);
  const headers = new Headers(options.headers);
  headers.set('Origin', origin);
  headers.set('Cookie', cookieJar.getCookieStringSync(url.href));
  const response = await realFetch(url, { ...options, headers });
  for (const cookie of response.headers.getSetCookie()) cookieJar.setCookieSync(cookie, url.href);
  return response;
};

async function openTab(inheritedScope) {
  const dom = new JSDOM('', { url: origin, cookieJar });
  if (inheritedScope) dom.window.sessionStorage.setItem(key, inheritedScope);
  globalThis.window = dom.window;
  const api = await import(`../lib/api.js?live-tab=${++instance}`);
  await api.refreshAppData(true);
  assert.equal(api.getSnapshot().error, '');
  const tab = { dom, api };
  tabs.push(tab);
  return tab;
}
async function login(tab, role) {
  globalThis.window = tab.dom.window;
  const account = fixture.accounts[role];
  await tab.api.loginAccount(role, account.email, account.password);
  assert.equal(tab.api.getSnapshot().error, '');
  assert.equal(tab.api.getSession().email, account.email);
}
async function identity(tab, role) {
  globalThis.window = tab.dom.window;
  await tab.api.refreshAppData(true);
  assert.equal(tab.api.getSnapshot().error, '');
  assert.equal(tab.api.getSession()?.email || null, role ? fixture.accounts[role].email : null);
  if (role) assert.deepEqual(tab.api.getSnapshot().data.users.map(user => user.email), [fixture.accounts[role].email]);
}

try {
  const donor = await openTab();
  await login(donor, 'donor');
  const donorScope = donor.dom.window.sessionStorage.getItem(key);
  const ngo = await openTab();
  await login(ngo, 'ngo');
  const ngoScope = ngo.dom.window.sessionStorage.getItem(key);
  assert.notEqual(donorScope, ngoScope);
  await Promise.all([identity(donor, 'donor'), identity(ngo, 'ngo')]);
  pass('Donor and NGO remain signed in with one shared browser cookie jar');

  const reload = await openTab(donorScope);
  await identity(reload, 'donor');
  await identity(ngo, 'ngo');
  pass('Reload restores the correct donor without changing the NGO tab');

  for (const [tab, role, phone] of [[donor, 'donor', '9876543211'], [ngo, 'ngo', '9876543212']]) {
    globalThis.window = tab.dom.window;
    const fields = fixture.accounts[role].fields;
    const profile = Object.fromEntries(['firstName', 'lastName', 'ngoName', 'registrationNumber', 'description', 'phone', 'address', 'city', 'state', 'pincode'].filter(name => name in fields).map(name => [name, fields[name]]));
    const updated = await tab.api.updateProfile({ ...profile, phone });
    assert.equal(updated.user.email, fixture.accounts[role].email);
    assert.equal(updated.user.phone, phone);
  }
  await Promise.all([identity(donor, 'donor'), identity(ngo, 'ngo')]);
  pass('Both profiles save using cached CSRF tokens after the other role signs in');

  // Duplicate/open-from-another-tab may copy sessionStorage. A new sign-in
  // must create a new context without logging out the copied donor session.
  const duplicate = await openTab(donorScope);
  await login(duplicate, 'ngo');
  await identity(donor, 'donor');
  assert.notEqual(duplicate.dom.window.sessionStorage.getItem(key), donorScope);
  globalThis.window = duplicate.dom.window;
  await duplicate.api.clearSession();
  await Promise.all([identity(donor, 'donor'), identity(ngo, 'ngo')]);
  pass('Signing in and out of a duplicated tab preserves both original accounts');

  const fresh = await openTab();
  await identity(fresh, null);
  const hidden = fresh.api.getSnapshot().data;
  for (const name of ['users', 'itemRequests', 'itemDonations', 'matches', 'notifications']) assert.deepEqual(hidden[name], []);
  pass('A fresh tab cannot inherit another tab’s private data from shared cookies');

  globalThis.window = donor.dom.window;
  await donor.api.clearSession();
  await identity(donor, null);
  await identity(ngo, 'ngo');
  await identity(reload, null);
  pass('Donor logout revokes that session and its copied view, while NGO stays signed in');

  await login(donor, 'donor');
  await Promise.all([identity(donor, 'donor'), identity(ngo, 'ngo')]);
  const stored = [...cookieJar.serializeSync().cookies].filter(cookie => cookie.key.startsWith('allofus_sessionid_'));
  assert.ok(stored.length >= 2);
  assert.ok(stored.every(cookie => cookie.httpOnly && cookie.sameSite === 'lax'));
  assert.ok(!stored.some(cookie => donor.dom.window.document.cookie.includes(cookie.value)));
  assert.deepEqual(Object.keys(donor.dom.window.sessionStorage), [key]);
  pass('Re-login works; session credentials remain HttpOnly and outside web storage');

  // End only the QA sessions opened by this script.
  for (const tab of [donor, ngo]) { globalThis.window = tab.dom.window; await tab.api.clearSession(); }
  writeFileSync(new URL('tab-sessions-result.json', output), JSON.stringify({ checks, cookieModel: 'One shared cookie jar; per-tab sessionStorage and API modules', limitation: 'jsdom + live HTTP, not real browser UI automation' }, null, 2));
  console.log(`\n${checks.length} shared-cookie tab checks passed.`);
} finally {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  for (const tab of tabs) tab.dom.window.close();
}
