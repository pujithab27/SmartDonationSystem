import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { retiredWorkspaceDestination } from '../lib/workspaceRoutes.js';

const origin = process.argv[2] || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local development server');
const results = [];
const sections = {
  donor: ['', 'profile', 'give', 'requirements', 'items', 'impact', 'matches', 'notifications'],
  admin: ['', 'approvals', 'donors', 'ngos', 'donations', 'requests', 'tracking', 'settings'],
  ngo: ['', 'available', 'create', 'requests', 'matches', 'notifications', 'profile'],
};
for (const [role, pages] of Object.entries(sections)) {
  for (const section of pages) {
    const path = `/dashboard/${role}${section ? '/' + section : ''}`;
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes('Opening your workspace'), `${path}: expected authenticated client entry point`);
    results.push({ path, status: response.status });
    console.log(`PASS: HTTP ${path}`);
  }
}
for (const [role, pages] of Object.entries({ admin: ['campaigns', 'reports'], donor: ['ngos', 'campaigns', 'donations', 'saved', 'settings'], ngo: ['campaigns', 'donations', 'settings', 'verification'] })) {
  for (const section of pages) {
    const path = `/dashboard/${role}/${section}?category=Food&query=QA`;
    const destination = retiredWorkspaceDestination(role, section, { category: 'Food', query: 'QA' });
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    const html = await response.text();
    // In production, streamed redirects use a meta refresh with HTML-escaped
    // query parameters. Parse the actual redirect target as the browser does.
    const actual = response.headers.get('location');
    const document = JSDOM.fragment(html);
    const refresh = document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content');
    const streamedDestination = refresh?.match(/^\s*\d+\s*;\s*url=(.+)$/i)?.[1];
    assert.ok((response.status === 307 && actual === destination) || (response.status === 200 && streamedDestination === destination), `${path}: expected ${destination}; got ${response.status}, ${actual || streamedDestination}`);
    results.push({ path, status: response.status, destination });
    console.log(`PASS: Redirect ${role}/${section} -> ${destination}`);
  }
}
mkdirSync(new URL('../../output/qa-private/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../output/qa-private/routes.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(`${results.length} live route checks passed.`);
