import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/[...path]/route.js';

test('proxy returns retryable JSON when Django disconnects during the response body', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.error(new Error('upstream disconnected'));}}));
  try {
    const response=await GET(new Request('http://localhost/api/state/'),{params:Promise.resolve({path:['state']})});
    assert.equal(response.status,503);
    assert.match((await response.json()).detail,/try again/);
    assert.equal(response.headers.get('cache-control'),'no-store');
  } finally {globalThis.fetch=original;}
});

test('proxy preserves completed JSON responses and session cookies', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json','set-cookie':'sessionid=test; HttpOnly'}});
  try {
    const response=await GET(new Request('http://localhost/api/state/'),{params:Promise.resolve({path:['state']})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true});
    assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  } finally {globalThis.fetch=original;}
});
