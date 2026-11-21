// Default: deterministic native-event simulation. --native: Chrome's speech
// service with an existing synthetic microphone fixture. No Gemini or app
// transcription requests are permitted and no donations are saved.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const native = process.argv.includes('--native');
const origin = process.env.VOICE_TEST_ORIGIN || 'http://127.0.0.1:3000';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const cases = JSON.parse(fs.readFileSync('tests/fixtures/donation-voice-cases.json','utf8'));
const catalog = ['Backpack','Shirt','Notebook','Rice','School Bag','Book','Blanket'].map(name=>({id:name.toLowerCase().replaceAll(' ','-'),name,category:'Test items',unit:'unit'}));
const browser = await chromium.launch({channel:'chrome',headless:true,args:native?[
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('../output/qa-private/voice-cases/single-item.wav')}`,
]:[]});
const report=[];
try {
  for (const entry of native ? cases.slice(0,1) : cases) {
    const page=await browser.newPage();
    const forbidden=[];
    await page.route('**/api/**', async route => {
      const req=route.request();
      if(req.method()!=='GET' || req.url().includes('/speech/')) {
        forbidden.push(req.url()); return route.abort();
      }
      return route.fulfill({json:{session:{role:'donor',email:'voice-test@example.com',name:'Voice Test'},data:{users:[],ngos:[],requests:[],donations:[],saved:{},settings:{},flags:[],contacts:[],accountActivity:[],itemCatalog:catalog,itemRequests:[],itemDonations:[],matches:[],notifications:[],unreadNotifications:0}}});
    });
    if(!native) await page.addInitScript(({sentence}) => {
      class Recognition {
        start() { window.__voiceRecognition=this; queueMicrotask(()=>this.onstart?.()); }
        stop() {
          const results=[Object.assign([{transcript:sentence}],{isFinal:true})];
          this.onresult?.({results}); this.onend?.();
        }
        abort() {}
      }
      window.SpeechRecognition=Recognition;
    },entry);
    try {
      await page.goto(`${origin}/dashboard/donor/give`);
      if(entry.field) {
        const field=page.locator(`[name="${entry.field}"]`).locator('..').locator('..');
        await field.getByRole('button').click();
        await field.getByRole('button',{name:/Done recording/}).click();
      } else {
        await page.getByText('Use voice instead',{exact:true}).click();
        await page.getByRole('button',{name:'Voice input',exact:true}).click();
        if(native) await page.waitForTimeout(6500);
        const done=page.getByRole('button',{name:'Done',exact:true});
        if(await done.count()) await done.click();
      }
      await page.waitForFunction(({expected,matches}) => Object.entries(expected).every(([name,value])=>document.querySelector(`[name="${name}"]`)?.value===value)
        && Object.entries(matches||{}).every(([name,pattern])=>new RegExp(pattern,'i').test(document.querySelector(`[name="${name}"]`)?.value||'')),entry,{timeout:15000});
      if(entry.warning) assert.match(await page.locator('.voice-panel').innerText(),new RegExp(entry.warning,'i'));
      assert.deepEqual(forbidden,[],'Voice must not call a backend transcription API or save a donation');
      if(entry.id==='complete-details') for(const width of [1280,390]) {
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.locator('.voice-panel').screenshot({path:`../output/qa-private/web-speech-${width}.png`});
      }
      report.push({id:entry.id,status:'passed',mode:native?'native':'simulated recognition'});
      console.log(`PASS ${entry.id} (${native?'native':'simulated recognition'})`);
    } catch(error) {
      const display=await page.locator('.voice-panel').innerText().catch(()=>'');
      report.push({id:entry.id,status:'failed',error:error.message,display});
      console.error(`FAIL ${entry.id}: ${display || error.message}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
fs.writeFileSync(`../output/qa-private/web-speech-${native?'native':'integration'}-results.json`,JSON.stringify(report,null,2));
assert.ok(report.every(entry=>entry.status==='passed'),'Web Speech check failed; see output/qa-private/web-speech results.');
