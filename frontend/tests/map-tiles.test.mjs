import test from 'node:test';
import assert from 'node:assert/strict';
import {addMapTiles} from '../lib/mapTiles.js';
function setup() {
  const handlers = {}, messages = [];
  let redraws = 0, options;
  const layer = {on(name, fn) {handlers[name]=fn;return this;},off(){for(const name of Object.keys(handlers)) delete handlers[name];},addTo(){return this;},redraw(){redraws++;}};
  const control = addMapTiles({tileLayer(url, opts){options=opts;return layer;}}, {}, message=>messages.push(message));
  return {handlers,messages,control,get redraws(){return redraws;},options};
}
test('a recovered tile clears the error only when all failed tiles recover', () => {
  const s=setup(), a={},b={};
  try {
    s.handlers.tileerror({tile:a});s.handlers.tileerror({tile:b});
    s.handlers.tileload({tile:a});assert.notEqual(s.messages.at(-1),'');
    s.handlers.tileload({tile:b});assert.equal(s.messages.at(-1),'');
    assert.equal(s.options.referrerPolicy,'strict-origin-when-cross-origin');
  } finally {s.control.dispose();}
});
test('failed tiles retry once automatically and manual retry remains available', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const s=setup();
  try {
    s.handlers.tileerror({tile:{}});t.mock.timers.tick(1500);assert.equal(s.redraws,1);
    s.handlers.tileerror({tile:{}});t.mock.timers.tick(3000);assert.equal(s.redraws,1);
    s.control.retry();assert.equal(s.redraws,2);assert.equal(s.messages.at(-1),'');
  } finally {s.control.dispose();}
});
test('closing a map cancels pending retries', t => {
  t.mock.timers.enable({apis:['setTimeout']});const s=setup();
  s.handlers.tileerror({tile:{}});s.control.dispose();t.mock.timers.tick(1500);
  assert.equal(s.redraws,0);assert.deepEqual(s.handlers,{});
});
