import test from 'node:test';
import assert from 'node:assert/strict';
import {beginDictation, speechSupported} from '../lib/browserSpeech.js';
let recognition, run;
class Recognition {
  constructor() { recognition = this; this.aborted = 0; this.stopped = 0; }
  start() { this.onstart?.(); }
  stop() { this.stopped++; }
  abort() { this.aborted++; }
  result(parts) { this.onresult?.({results:parts.map(([text, isFinal]) => Object.assign([{transcript:text}], {isFinal}))}); }
}
function start(mode) {
  const result = {texts:[],previews:[],errors:[],ended:0,phase:''};
  result.cancel = beginDictation({mode,onPreview:text=>result.previews.push(text),onText:text=>result.texts.push(text),onError:error=>result.errors.push(error),onEnd:()=>result.ended++,onStatus:(_,phase)=>result.phase=phase});
  run = result;
  return result;
}
test.beforeEach(() => {
  globalThis.window = {isSecureContext:true,webkitSpeechRecognition:Recognition};
  globalThis.fetch = () => {assert.fail('Browser speech must never call the app or Gemini API');};
});
test.afterEach(() => run?.cancel());
test('supports standard and prefixed browser recognition without MediaRecorder', () => {
  assert.equal(speechSupported(), true);
  window = {isSecureContext:true,SpeechRecognition:Recognition};
  assert.equal(speechSupported(),true);
  window.isSecureContext = false; assert.equal(speechSupported(),false);
});
test('Done waits for final native results and never duplicates revised results', () => {
  const result = start();
  assert.equal(recognition.lang,'en-IN'); assert.equal(recognition.continuous,true);
  recognition.result([['Three shirts.',true],['in Gun',false]]);
  recognition.result([['Three shirts.',true],['in Guntur.',true]]);
  assert.deepEqual(result.texts,[]);
  result.cancel.stop(); assert.equal(recognition.stopped,1);
  recognition.onend();
  assert.deepEqual(result.texts,['Three shirts. in Guntur.']); assert.equal(result.ended,1);
});
test('natural browser end applies final text and ignores unfinished hypotheses', () => {
  const result=start(); recognition.result([['Three shirts.',true],['possibly',false]]); recognition.onend();
  assert.deepEqual(result.texts,['Three shirts.']);
});
test('cancel and switching fields discard late transcripts', () => {
  const first=start(), old=recognition, late=old.onresult, end=old.onend;
  const second=start();
  late({results:[Object.assign([{transcript:'stale'}],{isFinal:true})]}); end();
  assert.ok(old.aborted); assert.deepEqual(first.texts,[]); assert.equal(first.ended,1);
  recognition.result([['New field',true]]); recognition.onend();
  assert.deepEqual(second.texts,['New field']);
});
test('browser errors are actionable and never call another provider', () => {
  for (const [error, message] of [['not-allowed',/blocked/],['network',/internet/],['audio-capture',/microphone/],['no-speech',/No speech/]]) {
    const result=start(); recognition.onerror({error});
    assert.match(result.errors[0],message); assert.equal(result.ended,1); assert.deepEqual(result.texts,[]);
  }
});
test('unsupported browsers and empty final results leave fields unchanged', () => {
  window = {isSecureContext:true}; const unsupported=start(); assert.equal(unsupported.ended,1); assert.match(unsupported.errors[0],/unavailable/);
  window.webkitSpeechRecognition=Recognition;
  const empty=start(); recognition.result([['uncertain',false]]); recognition.onend();
  assert.deepEqual(empty.texts,[]); assert.match(empty.errors[0],/No words/);
});
test('recording limit stops native recognition and finalization is bounded', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const result=start(); const native=recognition;
  t.mock.timers.tick(30000); assert.equal(native.stopped,1); assert.equal(result.phase,'processing');
  t.mock.timers.tick(3000); assert.equal(result.ended,1); assert.match(result.errors[0],/too long/); assert.ok(native.aborted);
});

test('full donation recordings allow ninety seconds and show interim text without committing it', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const result=start('donation');
  recognition.result([['Donate three shirts.',true],['Pickup at twelve',false]]);
  assert.equal(result.previews.at(-1),'Donate three shirts. Pickup at twelve');
  assert.deepEqual(result.texts,[]);
  t.mock.timers.tick(20000); assert.equal(recognition.stopped,0);
  t.mock.timers.tick(70000); assert.equal(recognition.stopped,1);
  result.cancel.stop(); // Repeated Done must not discard the result.
  t.mock.timers.tick(3000);
  assert.deepEqual(result.texts,['Donate three shirts.']);
});

test('a network interruption preserves confirmed speech and reports the incomplete recording', () => {
  const result=start('donation');
  recognition.result([['Donate three shirts.',true],['unfinished address',false]]);
  recognition.onerror({error:'network'});
  assert.deepEqual(result.texts,['Donate three shirts.']);
  assert.match(result.errors[0],/ended early/);
  assert.equal(result.ended,1);
});
test('cancel before permission completes cannot fill a field', () => {
  class Pending extends Recognition { start() {} }
  window.webkitSpeechRecognition=Pending;
  const result=start(), lateStart=recognition.onstart;
  result.cancel(); lateStart(); assert.equal(result.ended,1); assert.deepEqual(result.texts,[]); assert.ok(recognition.aborted);
});
