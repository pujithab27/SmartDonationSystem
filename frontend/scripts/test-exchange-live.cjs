/* Interactive DOM integration checks against the real Next.js/Django API.
 * First run backend/scripts/prepare_exchange_qa.py. This adds only QA records.
 * jsdom supplies the DOM; Next routing and image decoding are test adapters.
 * This is not a visual browser, camera, microphone, or map-tile test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const swc = require('next/dist/build/swc');
const frontend = path.resolve(__dirname, '..');
const output = path.resolve(frontend, '../output/qa-private');
const fixture = JSON.parse(fs.readFileSync(path.join(output, 'accounts.json'), 'utf8'));
const origin = fixture.origin;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: origin });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'FormData', 'File', 'FileReader']) global[name] = dom.window[name];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event('close')); };
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const root = createRoot(document.getElementById('root'));
const realFetch = global.fetch;
// Match a real browser: roles share cookies, with independent tab API state.
const browserCookies = new Map();
let activeRole = 'anonymous', route = new URL('/dashboard/ngo', origin), pageKey = 0;
const httpLog = [], checks = [], snapshots = {};
global.fetch = async (input, options = {}) => {
  const url = new URL(input, origin);
  assert.equal(url.origin, origin, 'Live tests must stay on the local app');
  const jar = browserCookies;
  const headers = new Headers(options.headers);
  headers.set('Origin', origin);
  if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  if (url.pathname === '/api/item-donations/analyse-photo/') return new Response(JSON.stringify({status:'unsupported',itemId:'',quantity:null,warning:'QA synthetic image is not a donation item.'}), {status:200,headers:{'Content-Type':'application/json'}});
  const response = await realFetch(url, { ...options, headers });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const split = pair.indexOf('=');
    jar.set(pair.slice(0, split), pair.slice(split + 1));
  }
  httpLog.push({ role: activeRole, method: options.method || 'GET', path: url.pathname + url.search, status: response.status });
  return response;
};
let cache = new Map();
const router = { push(url) { route = new URL(url, origin); }, replace(url) { route = new URL(url, origin); }, refresh() {} };
function load(filename) {
  filename = path.resolve(filename);
  if (!path.extname(filename)) filename += '.js';
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const source = fs.readFileSync(filename, 'utf8');
  const code = swc.transformSync(source, { filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'commonjs' } }).code;
  function dependency(name) {
    if (name === 'next/navigation') return { useRouter: () => router, useSearchParams: () => route.searchParams, usePathname: () => route.pathname };
    if (name === 'next/link') return function Link({ href, children, prefetch, scroll, replace, ...props }) { return React.createElement('a', { ...props, href }, children); };
    if (name === 'next/image') return function Image({ fill, priority, sizes, unoptimized, ...props }) { return React.createElement('img', props); };
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), name);
      // jsdom has no bitmap decoder/canvas. Keep PhotoInput's real event/busy/
      // preview logic and send the actual fixture PNG for server validation.
      if (resolved === path.join(frontend, 'lib/photoUpload')) return { prepareDonationImage: async (file) => { assert.equal(file.type, 'image/png'); return fixture.proof; } };
      return load(resolved);
    }
    return require(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(dependency, module, module.exports);
  return module.exports;
}
let api, Dashboard;
const tabModules = {};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const text = () => document.body.textContent.replace(/\s+/g, ' ').trim();
function pass(name) { checks.push(name); console.log(`PASS: ${name}`); }
function query(selector) { const element = document.querySelector(selector); assert.ok(element, `Missing ${selector}\n${text()}`); return element; }
function linkFor(href) { return [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === href); }
function button(label, scope = document) { const matches = [...scope.querySelectorAll('button')].filter(el => el.textContent.trim() === label); assert.equal(matches.length, 1, `Expected one button ${label}; got ${matches.length}`); return matches[0]; }
async function waitFor(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await act(async () => { await delay(30); });
    if (predicate()) return;
  }
  throw new Error(`Timed out: ${label}\n${text()}`);
}
async function click(element) { assert.ok(!element.disabled, `Disabled: ${element.textContent}`); await act(async () => { element.click(); }); }
async function input(element, value) {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  assert.equal(element.value, value);
}
async function submit(element) { await act(async () => { element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }
async function upload(label) {
  const element = query(`input[aria-label="${label}"]`);
  const file = new File([Buffer.from(fixture.proof.split(',')[1], 'base64')], 'qa-proof.png', { type: 'image/png' });
  Object.defineProperty(element, 'files', { configurable: true, value: [file] });
  await act(async () => { element.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitFor(() => !!document.querySelector('.donation-preview'), 'photo preview');
}
async function state() { await act(async () => { await api.refreshAppData(true); }); return api.getSnapshot(); }
async function useRole(role) {
  await act(async () => root.render(null));
  activeRole = role;
  if (!tabModules[role]) {
    window.sessionStorage.clear();
    cache = new Map();
    tabModules[role] = {
      api: load(path.join(frontend, 'lib/api.js')),
      Dashboard: load(path.join(frontend, 'components/dashboard/DashboardShell.js')).default,
    };
    // Initialize the new tab before another role changes sessionStorage.
    await tabModules[role].api.refreshAppData(true);
  }
  ({ api, Dashboard } = tabModules[role]);
  if (role !== 'anonymous' && !api.getSession()) {
    const account = fixture.accounts[role];
    await api.loginAccount(role, account.email, account.password);
  } else await state();
  assert.equal(api.getSnapshot().session?.role || 'anonymous', role);
}
async function mount(url) {
  route = new URL(url, origin);
  const [, , role, section = 'overview'] = route.pathname.split('/');
  await act(async () => root.render(React.createElement(Dashboard, { key: ++pageKey, role, section })));
  await waitFor(() => !!document.querySelector('.dashboard-layout'), url);
  assert.equal(document.querySelector('.sidebar-identity strong')?.textContent, api.getSession().name);
}
function snapshot(label) { snapshots[label] = structuredClone(api.getSnapshot()); fs.writeFileSync(path.join(output, 'snapshots.json'), JSON.stringify(snapshots, null, 2)); }
async function expectRejected(action, status) { await act(async () => { await assert.rejects(action, err => err.status === status); }); }
async function apiAction(action) { let result; await act(async () => { result = await action(); }); return result; }

async function run() {
  await useRole('ngo');
  snapshot('ngo-empty');
  await mount('/dashboard/ngo/create');
  assert.match(text(), /Create a request/);
  await submit(query('.goods-compose form'));
  assert.match(text(), /Choose at least one donation item/);
  await input(query('input[name="title"]'), `QA rice and notebooks ${fixture.suffix}`);
  await input(query('input[aria-label="Search donation items"]'), 'rice');
  await click(query('button[aria-label="Add Rice"]'));
  await input(query('input[aria-label="Quantity for Rice"]'), '10');
  await input(query('input[aria-label="Search donation items"]'), 'notebook');
  await click(query('button[aria-label="Add Notebook"]'));
  await input(query('input[aria-label="Quantity for Notebook"]'), '5');
  for (const [name, value] of Object.entries({deliveryAddress:'QA NGO Road',deliveryCity:'Hyderabad',deliveryState:'Telangana',deliveryPincode:'500001',contactPhone:'9876543212'})) { assert.equal(query(`input[name="${name}"]`).value, ''); await input(query(`input[name="${name}"]`), value); }
  await submit(query('.goods-compose form'));
  await waitFor(() => route.pathname.endsWith('/requests'), 'NGO request published');
  await mount(route.pathname + route.search);
  let entry = api.getSnapshot().data.itemRequests.find(r => r.title.includes(fixture.suffix));
  assert.ok(entry); const requestId = entry.id;
  assert.equal(entry.items.length, 2);
  pass('NGO publishes a request containing 10 kg rice and 5 notebooks with delivery/contact details');
  await mount(`/dashboard/ngo/create?edit=${requestId}`);
  await input(query('textarea[name="notes"]'), 'QA sample request - delivery between 10 am and 4 pm.');
  await submit(query('.goods-compose form'));
  await waitFor(() => route.pathname.endsWith('/requests'), 'request edited');
  await mount(route.pathname + route.search);
  await click(button('Close request'));
  await waitFor(() => text().includes('Request closed.'), 'request closed');
  await useRole('donor');
  assert.ok(!api.getSnapshot().data.itemRequests.some(r => r.id === requestId));
  await mount('/dashboard/donor/requirements');
  assert.ok(!document.querySelector(`a[href*="request=${requestId}"]`));
  await useRole('ngo'); await mount('/dashboard/ngo/requests');
  await click(button('Closed'));
  await click(button('Reopen request'));
  await waitFor(() => text().includes('Request reopened'), 'request reopened');
  pass('NGO edits, closes and reopens requests; closed requests disappear from donor browsing');
  await useRole('donor'); snapshot('donor-before');
  await mount('/dashboard/donor/requirements');
  await input(query('input[aria-label="Search requirements"]'), 'QA rice');
  await input(query('select[aria-label="Request category"]'), 'Food');
  const donateLink = linkFor(`/dashboard/donor/give?item=rice&request=${requestId}`);
  assert.ok(donateLink, 'Rice donation link includes the selected request');
  assert.ok(!document.querySelector(`a[href*="item=notebook&request=${requestId}"]`));
  await mount(donateLink.getAttribute('href'));
  await waitFor(() => query('select[name="itemId"]').value === 'rice', 'selected rice');
  assert.match(text(), /QA Community Kitchen/);
  assert.match(text(), /10 kg of Rice needed/);
  assert.equal(query('select[name="itemId"]').querySelectorAll('option').length, api.getSnapshot().data.itemCatalog.length + 1, 'All catalog items remain available');
  assert.equal(document.querySelectorAll('.donation-compose input[readonly]').length, 0, 'Classification no longer adds redundant form fields');
  assert.ok([...document.querySelectorAll('.donation-compose details')].every(el => !el.open), 'Optional tools start collapsed');
  await click(button('Notebook', query('.donation-quick-picks')));
  assert.equal(query('select[name="itemId"]').value, 'notebook');
  assert.equal(query('input[name="quantity"]').inputMode, 'numeric');
  await click(button('Rice', query('.donation-quick-picks')));
  assert.equal(query('input[name="quantity"]').inputMode, 'numeric');
  await input(query('input[name="quantity"]'), '10');
  assert.match(query('.donation-summary').textContent, /10 kg of Rice/);
  await click([...document.querySelectorAll('.donation-compose summary')].find(el => el.textContent.includes('Fill details from a photo')));
  assert.ok(query('.photo-input').closest('details').open);
  for (const [name, value] of Object.entries({address:'QA Donor Road',city:'Hyderabad',state:'Telangana',pincode:'500001'})) { assert.equal(query(`input[name="${name}"]`).value, ''); await input(query(`input[name="${name}"]`), value); }
  await upload('Upload item photo');
  await waitFor(() => !text().includes('Recognizing the item and quantity'), 'photo analysis completed');
  await input(query('textarea[name="notes"]'), 'QA sample sealed rice bags.');
  await submit(query('.donation-compose form'));
  await waitFor(() => route.pathname.endsWith('/matches'), 'donation redirects to matches');
  assert.equal(route.searchParams.get('request'), String(requestId));
  const donationId = Number(route.searchParams.get('donation'));
  assert.ok(donationId);
  await mount(route.pathname + route.search);
  await waitFor(() => !!document.querySelector('.match-candidate'), 'automatic NGO suggestions without another click');
  await click(button('Refresh suggestions'));
  await waitFor(() => !!document.querySelector('.match-candidate'), 'refreshed NGO suggestions');
  const preferred = query('.match-candidate.preferred');
  assert.match(preferred.textContent, /Your selected request/);
  assert.match(preferred.textContent, new RegExp(fixture.suffix));
  assert.equal(preferred.querySelector('input[type=number]'), null);
  assert.match(preferred.textContent, /10 kg to donate/);
  await submit(preferred.querySelector('form'));
  await waitFor(() => !!document.querySelector('.pickup-form'), 'pickup form');
  let match = api.getSnapshot().data.matches.find(m => m.donationId === donationId);
  assert.equal(match.requestId, requestId); assert.equal(match.quantity, 10);
  const matchId = match.id;
  entry = api.getSnapshot().data.itemRequests.find(r => r.id === requestId);
  assert.equal(entry.items.find(i => i.itemId === 'rice').reserved, 10);
  assert.equal(entry.items.find(i => i.itemId === 'rice').fulfilled, 0);
  snapshot('donor-reserved');
  pass('Donor requirement link preserves the item and NGO request through saving, matching and reservation');
  await expectRejected(() => api.createMatch({ donationId, requestId, quantity: 1 }), 409);
  const pickup = new Date(Date.now() + 86400000);
  const local = new Date(pickup.getTime() - pickup.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await input(query('input[type="datetime-local"]'), local);
  const pickupAddress = [...document.querySelectorAll('.pickup-form label')].find(el => el.textContent.startsWith('Donor pickup address')).querySelector('input');
  await input(pickupAddress, 'QA donor pickup point, 25 Sample Street');
  await submit(query('.pickup-form'));
  await waitFor(() => text().includes('Pickup schedule saved.'), 'pickup saved');
  assert.equal(document.querySelector('.pickup-form'), null);
  assert.ok(button('Edit pickup'));
  match = api.getSnapshot().data.matches.find(m => m.id === matchId);
  assert.equal(match.status, 'Pickup scheduled');
  assert.notEqual(match.pickupAddress, match.deliveryAddress);
  snapshot('donor-scheduled');
  await expectRejected(() => api.updateMatch(matchId, { action: 'confirm', version: match.version, deliveryProof: fixture.proof, itemMatchConfirmed: true }), 403);
  pass('Donor schedules pickup; duplicate matching and donor receipt confirmation are blocked');
  await useRole('ngo');
  await mount(`/dashboard/ngo/matches?match=${matchId}`);
  await waitFor(() => text().includes('Confirm physical receipt'), 'NGO confirmation action');
  assert.match(text(), /QA donor pickup point/);
  assert.match(text(), /Pickup scheduled/);
  assert.ok(api.getSnapshot().data.notifications.some(n => n.title.includes('Pickup')));
  await click(button('Confirm physical receipt'));
  assert.ok(query('dialog[open]').open);
  assert.ok(button('Confirm receipt').disabled);
  await expectRejected(() => api.updateMatch(matchId, { action: 'confirm', version: match.version }), 400);
  await upload('Upload received item photo');
  await click(button('Check against donation'));
  await waitFor(() => !!document.querySelector('.receipt-check-result'), 'receipt photo comparison');
  assert.ok(!query('.receipt-review input').disabled, 'Live receipt QA requires a real matching item photo and an available comparison service; synthetic or mismatched proof cannot complete delivery.');
  await click(query('.receipt-review input'));
  await input(query('dialog[open] textarea'), 'QA sample: all 10 kg received in good condition.');
  await click(button('Confirm receipt'));
  await waitFor(() => api.getSnapshot().data.matches.find(m => m.id === matchId)?.status === 'Completed', 'receipt completed');
  await waitFor(() => !!document.querySelector('img[alt^="Proof of received"]'), 'proof displayed');
  await state(); snapshot('ngo-completed');
  match = api.getSnapshot().data.matches.find(m => m.id === matchId);
  assert.equal(match.hasDeliveryProof, true);
  assert.deepEqual(match.events.map(e => e.title), ['Donation matched', 'Pickup scheduled', 'Donation completed']);
  await expectRejected(() => api.updateMatch(matchId, { action: 'confirm', version: match.version, deliveryProof: fixture.proof, itemMatchConfirmed: true }), 400);
  await mount('/dashboard/ngo');
  entry = api.getSnapshot().data.itemRequests.find(r => r.id === requestId);
  const rice = entry.items.find(i => i.itemId === 'rice');
  assert.deepEqual([rice.fulfilled, rice.reserved, rice.remaining], [10, 0, 0]);
  assert.match(text(), /10 kg of 10 kg received/);
  assert.ok(!text().includes('% received'));
  pass('NGO confirms receipt with a photo; tracking, notifications and mixed-item fulfillment update once');
  await mount('/dashboard/ngo/notifications');
  assert.match(text(), /Donation completed/);
  await click(button('Mark all as read', query('main > section.exchange-panel')));
  await waitFor(() => api.getSnapshot().data.unreadNotifications === 0, 'read notifications');
  await state(); assert.equal(api.getSnapshot().data.unreadNotifications, 0);
  pass('NGO notification list and bell persist the read state');
  await useRole('donor');
  await mount(`/dashboard/donor/matches?match=${matchId}`);
  await waitFor(() => !!document.querySelector('img[alt^="Proof of received"]'), 'donor sees proof');
  assert.match(text(), /all 10 kg received in good condition/);
  await mount('/dashboard/donor/impact');
  assert.match(text(), /Your giving story/);
  assert.match(text(), /all 10 kg received in good condition/);
  assert.ok(linkFor(`/dashboard/donor/matches?match=${matchId}`));
  pass('Confirmed delivery appears in donor impact with receipt note and tracking link');
  await mount('/dashboard/donor/items');
  assert.match(text(), /Completed/);
  await input(query('select[aria-label="Donation status"]'), 'Completed');
  assert.match(text(), /10 kg received/);
  await mount('/dashboard/donor/requirements');
  assert.ok(!linkFor(`/dashboard/donor/give?item=rice&request=${requestId}`));
  assert.ok(linkFor(`/dashboard/donor/give?item=notebook&request=${requestId}`));
  snapshot('donor-completed');
  pass('Donor sees completed history and receipt proof; fulfilled rice is hidden while notebooks remain available');

  // Run cancellation and stale-update checks through the same production client.
  const offer = await apiAction(() => api.createItemDonation({ clientId: crypto.randomUUID(), itemId: 'notebook', quantity: 2, city: 'Hyderabad', address: 'QA Donor Road', state: 'Telangana', pincode: '500001' }));
  let pending = await apiAction(() => api.createMatch({ donationId: offer.id, requestId, quantity: 2 }));
  await expectRejected(() => api.updateMatch(pending.id, { action: 'cancel', version: pending.version + 1 }), 409);
  await mount(`/dashboard/donor/matches?match=${pending.id}`);
  await waitFor(() => !!document.querySelector('.match-detail'), 'cancel detail');
  await click(button('Cancel match', query('.match-detail')));
  await click(button('Cancel match', query('dialog[open]')));
  await waitFor(() => api.getSnapshot().data.matches.find(m => m.id === pending.id)?.status === 'Cancelled', 'cancellation');
  assert.equal(api.getSnapshot().data.itemDonations.find(d => d.id === offer.id).available, 2);
  assert.equal(api.getSnapshot().data.itemRequests.find(r => r.id === requestId).items.find(i => i.itemId === 'notebook').remaining, 5);
  pass('Cancellation releases both quantities and stale match updates are rejected');

  // Edit and delete unused offers/requests through their actual UI controls.
  const unused = await apiAction(() => api.createItemDonation({clientId:crypto.randomUUID(),itemId:'notebook',quantity:3,city:'Hyderabad',address:'QA New Address',state:'Telangana',pincode:'500001'}));
  await mount(`/dashboard/donor/give?edit=${unused.id}`);
  await waitFor(() => !!document.querySelector('input[name="quantity"]'), 'donor edit loaded');
  assert.equal(query('input[name="quantity"]').value,'3');
  assert.equal(query('input[name="address"]').value,'QA New Address');
  await input(query('input[name="quantity"]'),'4');
  await submit(query('.donation-compose form'));
  await waitFor(() => route.pathname.endsWith('/items'),'donor edit saved');
  assert.equal(api.getSnapshot().data.itemDonations.find(d=>d.id===unused.id).quantity,4);
  await mount('/dashboard/donor/items');
  const unusedRow = [...document.querySelectorAll('tbody tr')].find(row=>row.querySelector(`a[href="/dashboard/donor/give?edit=${unused.id}"]`));
  await click(button('Delete',unusedRow)); await click(button('Keep it',unusedRow));
  assert.ok(api.getSnapshot().data.itemDonations.some(d=>d.id===unused.id));
  await click(button('Delete',unusedRow)); await click(button('Confirm delete',unusedRow));
  await waitFor(() => !api.getSnapshot().data.itemDonations.some(d=>d.id===unused.id),'donor delete saved');
  pass('Donor can edit and delete an unused offer; declining deletion preserves it');
  await useRole('ngo');
  const disposable = await apiAction(() => api.createItemRequest({title:`QA disposable ${fixture.suffix}`,items:[{itemId:'book',quantity:2}],contactPhone:'9876543212',deliveryAddress:'QA NGO Street',deliveryCity:'Hyderabad',deliveryState:'Telangana',deliveryPincode:'500001',notes:'',priority:'Medium',neededBy:null}));
  await mount('/dashboard/ngo/requests');
  await input(query('input[aria-label="Search your requests"]'),`QA disposable ${fixture.suffix}`);
  await click(button('Delete',query('.goods-request-list')));
  await click(button('Confirm delete',query('.goods-request-list')));
  await waitFor(() => !api.getSnapshot().data.itemRequests.some(r=>r.id===disposable.id),'NGO delete saved');
  pass('NGO can delete an unused request through the separate request-list page');

  // Every active role page renders with the real populated API snapshot.
  const pages = { donor: ['', '/profile', '/give', '/requirements', '/items', '/impact', '/matches', '/notifications'], ngo: ['', '/available', '/create', '/requests', '/matches', '/notifications', '/profile'] };
  for (const role of ['donor', 'ngo']) {
    await useRole(role);
    for (const section of pages[role]) {
      await mount(`/dashboard/${role}${section}`);
      assert.ok(query('#workspace-content').textContent.trim().length > 20);
      assert.equal(document.querySelectorAll('.sidebar-menu a').length, pages[role].length);
      assert.equal(document.querySelectorAll('.dash-header a.btn').length, 0, `${role}${section}: no unrelated global action`);
      if (!['/give', '/create'].includes(section)) {
        assert.equal(document.querySelectorAll('.field-microphone').length, 0, `${role}${section}: voice belongs only in item forms`);
      }
      if (['/notifications', '/profile'].includes(section)) {
        const creationLinks = [...document.querySelectorAll('#workspace-content a[href="/dashboard/donor/give"], #workspace-content a[href="/dashboard/ngo/create"]')].filter((link) => !link.closest('.workspace-finder'));
        assert.equal(creationLinks.length, 0, `${role}${section}: no unrelated donation CTA`);
      }
    }
    await mount(`/dashboard/${role}/profile`);
    await input(query('input[name="phone"]'), role === 'donor' ? '9876543211' : '9876543212');
    await submit(query('form.form'));
    await waitFor(() => text().includes('has been updated') || text().includes('have been updated'), `${role} profile saved`);
    await state();
    assert.equal(api.getSnapshot().data.users[0].phone, role === 'donor' ? '9876543211' : '9876543212');
    pass(`${role}: all ${pages[role].length} active pages render, profile saves`);
    await act(async () => { await api.clearSession(); });
    await apiAction(() => api.loginAccount(role, fixture.accounts[role].email, fixture.accounts[role].password));
    assert.ok(api.getSnapshot().data.matches.some(m => m.id === matchId && m.status === 'Completed'));
    pass(`${role}: completed donation survives logout and fresh login`);
  }
  await useRole('anonymous');
  for (const key of ['itemDonations', 'matches', 'notifications', 'itemRequests']) assert.deepEqual(api.getSnapshot().data[key], []);
  await expectRejected(() => api.request(`matches/${matchId}/`), 403);
  pass('Anonymous sessions cannot read private requests, matches, photos or notifications');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, requestId, donationId, matchId, httpLog, limitations: ['DOM simulation, not visual browser verification', 'Bitmap decoding is adapted; server validates the real PNG', 'Live microphone/camera/geolocation and map providers are not tested'] }, null, 2));
  console.log(`\n${checks.length} live integration groups passed; request #${requestId}, donation #${donationId}, match #${matchId}.`);
}
run().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'failure.html'), document.documentElement.outerHTML); fs.writeFileSync(path.join(output, 'http-failure.json'), JSON.stringify(httpLog, null, 2)); process.exitCode = 1; }).finally(async () => { await act(async () => root.unmount()); dom.window.close(); });
