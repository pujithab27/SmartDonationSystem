import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation} from '../lib/localSpeech.js';

let recorder, stopped, last;
const flush = () => new Promise(resolve => setImmediate(resolve));
class Recorder {
  state = 'inactive'; mimeType = 'audio/webm';
  constructor() { recorder = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({data:new Blob(['audio'])}); this.onstop?.(); }
}
test.beforeEach(() => {
  stopped = 0;
  globalThis.window = {MediaRecorder:Recorder};
  Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
});
test.afterEach(() => last?.());
function start(overrides = {}) {
  const result = {texts:[],errors:[],ended:0,cancelled:0};
  const begin = createDictation({supported:()=>true,load:async()=>{},decode:async()=>new Float32Array(16000).fill(.1),transcribe:async()=>'Three shirts.',cancelProcessing:()=>result.cancelled++,...overrides});
  last = result.cancel = begin({onText:text=>result.texts.push(text),onError:error=>result.errors.push(error),onEnd:()=>result.ended++,onStatus:(_,phase)=>result.phase=phase});
  return result;
}
test('local model transcribes after Done and releases the microphone', async () => {
  const result = start(); await flush();
  assert.equal(result.phase,'recording');
  result.cancel.stop(); await flush();
  assert.deepEqual(result.texts,['Three shirts.']);
  assert.equal(result.ended,1); assert.ok(stopped);
});

test('a slow model cannot delay microphone recording; Done retains audio until it is ready', async () => {
  let ready, transcribed = false;
  const result = start({load:()=>new Promise(resolve=>ready=resolve),transcribe:async samples=>{
    transcribed = true; assert.equal(samples.length,16000); return 'Three shirts.';
  }});
  await flush();
  assert.equal(result.phase,'recording'); assert.equal(recorder.state,'recording');
  result.cancel.stop(); await flush();
  assert.equal(result.phase,'processing'); assert.equal(transcribed,false); assert.ok(stopped);
  ready(); await flush();
  assert.deepEqual(result.texts,['Three shirts.']); assert.equal(result.ended,1);
});

test('cancelling while the model loads prevents late transcription', async () => {
  let ready;
  const result = start({load:()=>new Promise(resolve=>ready=resolve),transcribe:()=>assert.fail('cancelled audio transcribed')});
  await flush(); result.cancel.stop(); await flush(); result.cancel(); ready(); await flush();
  assert.deepEqual(result.texts,[]); assert.equal(result.ended,1);
});
test('cancelling during inference prevents a late result from changing fields', async () => {
  let resolve;
  const result = start({transcribe:()=>new Promise(r=>resolve=r)}); await flush();
  result.cancel.stop(); await flush(); result.cancel(); resolve('stale'); await flush();
  assert.deepEqual(result.texts,[]); assert.equal(result.ended,1);
});
test('late microphone permission after cancellation releases the stream', async () => {
  let resolve;
  navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const result=start(); await flush(); result.cancel();
  resolve({getTracks:()=>[{stop(){stopped++;}}]}); await flush();
  assert.equal(stopped,1); assert.deepEqual(result.texts,[]);
});
test('silence never reaches the model or fills a field', async () => {
  const result=start({decode:async()=>new Float32Array(16000),transcribe:()=>assert.fail('silence sent to model')});
  await flush(); result.cancel.stop(); await flush();
  assert.match(result.errors[0],/No clear speech/); assert.deepEqual(result.texts,[]);
});

test('unintelligible model output never becomes a field value', async () => {
  for (const text of ['[inaudible]', '(Inaudible)', 'Donate [inaudible] shirts', '[BLANK_AUDIO]', '[silence]']) {
    const result = start({transcribe:async()=>text});
    await flush(); result.cancel.stop(); await flush();
    assert.deepEqual(result.texts,[]);
    assert.match(result.errors[0],/recording was unclear/);
    assert.equal(result.ended,1);
  }
});

test('a busy or unreadable microphone gives a specific recovery message', async () => {
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error(),{name:'NotReadableError'});};
  const result=start(); await flush();
  assert.match(result.errors[0],/selected microphone/);
  assert.deepEqual(result.texts,[]);
});
test('model load and permission failures are recoverable', async () => {
  const loading=start({load:async()=>{throw new Error('Model unavailable');}}); await flush();
  assert.match(loading.errors[0],/Model unavailable/); assert.equal(loading.ended,1);
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});};
  const permission=start(); await flush(); assert.match(permission.errors[0],/blocked/);
});
