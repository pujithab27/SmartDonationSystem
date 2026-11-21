// Actual microphone capture, WASM model inference and form filling; no writes.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const origin = process.env.VOICE_TEST_ORIGIN || 'http://127.0.0.1:3011';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({channel:'chrome',headless:true,args:[
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('../output/qa-private/voice-cases/complete-details.wav')}%noloop`,
]});
try {
  const page = await browser.newPage();
  // Deliberately slow model assets: recording must start independently.
  await page.route('**/voice/models/**/*.onnx', async route => {
    await new Promise(resolve => setTimeout(resolve, 10000));
    await route.continue();
  });
  const forbidden = [], errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') {forbidden.push(route.request().url()); return route.abort();}
    return route.fulfill({json:{session:{role:'donor',email:'voice-test@example.com',name:'Voice Test'},data:{users:[],ngos:[],requests:[],donations:[],saved:{},settings:{},flags:[],contacts:[],accountActivity:[],itemCatalog:[{id:'shirt',name:'Shirt',category:'Clothing',unit:'piece'}],itemRequests:[],itemDonations:[],matches:[],notifications:[],unreadNotifications:0}}});
  });
  await page.goto(`${origin}/dashboard/donor/give`);
  await page.getByText('Use voice instead',{exact:true}).click();
  const started = performance.now();
  await page.getByRole('button',{name:'Voice input',exact:true}).click();
  const done = page.getByRole('button',{name:'Done',exact:true});
  await done.waitFor({timeout:120000});
  const microphoneReadyMs = Math.round(performance.now()-started);
  assert.ok(microphoneReadyMs < 5000, 'Microphone must not wait for the model download');
  await page.waitForTimeout(15000);
  await done.click();
  const processing = performance.now();
  await page.getByRole('button',{name:'Voice input',exact:true}).waitFor({timeout:180000});
  const fields = await page.locator('.donation-compose form').evaluate(form=>Object.fromEntries(new FormData(form)));
  const report = {microphoneReadyMs,transcribeMs:Math.round(performance.now()-processing),transcript:await page.getByLabel('Donation transcript',{exact:true}).inputValue(),fields,status:await page.locator('.voice-panel').innerText(),errors,forbidden};
  fs.writeFileSync('../output/qa-private/local-whisper-results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.ok(report.transcript.length > 10, 'Real model must produce a transcript');
  assert.equal(fields.itemId,'shirt'); assert.equal(fields.quantity,'3');
  assert.deepEqual(errors,[]); assert.deepEqual(forbidden,[]);
} finally {await browser.close();}
