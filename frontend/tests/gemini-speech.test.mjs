import test from 'node:test';
import assert from 'node:assert/strict';
import {createDictation, encodeWav} from '../lib/geminiSpeech.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
let stopped, cancel;
class Recorder {
  state = 'inactive'; mimeType = 'audio/webm';
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({data:new Blob(['audio'])}); this.onstop?.(); }
}
test.beforeEach(() => {
  stopped = 0; globalThis.window = {MediaRecorder:Recorder};
  Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
});
test.afterEach(() => cancel?.());
function start(transcribe, decode = async()=>new Float32Array(16000).fill(.1)) {
  const result = {texts:[], errors:[], ended:0};
  cancel = createDictation({supported:()=>true,decode,transcribe})({mode:'donation',onText:(text,data)=>result.texts.push(data),onError:error=>result.errors.push(error),onEnd:()=>result.ended++});
  return result;
}
test('encodes bounded mono 16kHz PCM WAV for the server', () => {
  const wav = Buffer.from(encodeWav(new Float32Array(400000).fill(.5)), 'base64');
  assert.equal(wav.toString('ascii',0,4),'RIFF'); assert.equal(wav.readUInt32LE(24),16000);
  assert.equal(wav.readUInt16LE(22),1); assert.equal(wav.readUInt16LE(34),16);
  assert.equal(wav.length,640044); assert.equal(wav.readInt16LE(44),16383);
});
test('Done sends audio and donation mode and preserves structured fields', async () => {
  const response = {text:'Three shirts',fields:{itemId:'shirt',quantity:'3'},warnings:[]};
  const result = start(async(audio,mode,signal)=>{assert.equal(mode,'donation');assert.equal(signal.aborted,false);assert.equal(Buffer.from(audio,'base64').length,32044);return response;});
  await flush(); cancel.stop(); await flush(); assert.deepEqual(result.texts,[response]); assert.equal(result.ended,1);assert.ok(stopped);
});
test('cancel aborts a pending request and ignores its late response', async () => {
  let resolve, signal; const result = start((audio,mode,s)=>{signal=s;return new Promise(r=>resolve=r);});
  await flush();cancel.stop();await flush();cancel();assert.equal(signal.aborted,true);resolve({text:'stale'});await flush();assert.deepEqual(result.texts,[]);assert.equal(result.ended,1);
});
test('silence never uploads and provider errors leave fields unchanged', async () => {
  let result = start(()=>assert.fail('silent upload'),async()=>new Float32Array(16000));
  await flush();cancel.stop();await flush();assert.equal(result.errors.length,1);assert.deepEqual(result.texts,[]);
  result=start(async()=>{throw new Error('Voice quota reached');});await flush();cancel.stop();await flush();assert.deepEqual(result.errors,['Voice quota reached']);assert.deepEqual(result.texts,[]);
});
