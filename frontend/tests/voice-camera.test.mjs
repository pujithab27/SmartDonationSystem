import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost'});
for (const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','File']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { act } = React;
const { createRoot } = require('react-dom/client');
const swc = require('next/dist/build/swc');
const base = path.resolve('components');
let root, cache, mocks, spoken, navigated;
function load(filename) {
  filename = path.resolve(filename); if (!path.extname(filename)) filename += '.js';
  if (mocks[filename]) return mocks[filename];
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}}; cache.set(filename,module);
  const code = swc.transformSync(fs.readFileSync(filename,'utf8'), {filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}}).code;
  const dependency = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename),name)) : name === 'next/navigation' ? {useRouter:()=>({push(url){navigated.push(url);},replace(url){navigated.push(url);}}),useSearchParams:()=>new URLSearchParams()} : name === 'next/link' ? ({href,children,...props})=>React.createElement('a',{href,...props},children) : require(name);
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename})(dependency,module,module.exports);
  return module.exports;
}
class Speech {
  constructor(){ spoken=this; this.aborted=false; }
  start(){}
  abort(){this.aborted=true;}
  result(text, details){this.onresult?.({results:[[{transcript:text}]],details});this.onend?.();}
}
test.beforeEach(()=>{
  cache=new Map();mocks={};navigated=[];window.SpeechRecognition=Speech;
  mocks[path.resolve('lib/whisperClient.js')] = {};
  // UI tests drive the speech adapter; recording/worker lifecycle is covered separately.
  const speechModule = load(path.resolve('lib/speechInput.js'));
  let cancelActive;
  mocks[path.resolve('lib/speechInput.js')] = {...speechModule, speechSupported:()=>true,
    beginDictation({onText,onError,onEnd,onStatus,mode}) {
      cancelActive?.();
      const recognition = new Speech(); recognition.mode=mode; let ended = false;
      const finish=()=>{if (!ended) {ended=true;onEnd();}};
      recognition.onresult=event=>{onText(event.results[0][0].transcript,event.details);finish();};
      recognition.onerror=()=>{onError('Microphone access was blocked. Allow it in your browser or type instead.');finish();};
      const cancel=()=>{recognition.abort();finish();}; cancel.stop=cancel;
      cancelActive=cancel;onStatus?.('Listening. Speak in English, then choose Use recording.', 'recording');return cancel;
    }
  };
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
  root=createRoot(document.getElementById('root'));
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});}}});
});
test.afterEach(async()=>{await act(async()=>root.unmount());});
test.after(()=>dom.window.close());
const click = async node => {assert.ok(node);await act(async()=>node.click());};
const button = text => [...document.querySelectorAll('button')].find(b=>b.textContent.startsWith(text));

test('login uses normal email and password fields without voice controls', async () => {
  mocks[path.resolve('lib/api.js')] = {loginAccount: async () => {}};
  const Login = load(path.join(base, 'LoginForm.js')).default;
  for (const role of ['donor', 'ngo', 'admin']) {
    await act(async () => root.render(React.createElement(Login, {role})));
    assert.ok(document.querySelector('input[type="email"]'));
    assert.equal(document.querySelectorAll('.field-microphone').length, 0);
    await click(document.querySelector('[aria-label="Show password"]'));
    assert.equal(document.querySelector('input[name="password"]').type, 'text');
    assert.equal(document.querySelectorAll('.field-microphone').length, 0);
    await click(document.querySelector('[aria-label="Hide password"]'));
  }
});

test('page finder searches actions, stays within the current role, and supports keyboard navigation', async () => {
  const Search=load(path.join(base,'dashboard/WorkspaceSearch.js')).default;
  const pages=[['overview','Dashboard','grid'],['requests','My requests','box'],['matches','Donor matches','link'],['profile','Organization profile','user']];
  await act(async()=>root.render(React.createElement(Search,{role:'ngo',pages})));
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})));
  assert.equal(document.querySelector('dialog').open,true);
  const search=document.querySelector('input[aria-label="Search workspace pages"]');
  assert.equal(document.activeElement,search);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'pickup');search.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(document.querySelectorAll('.workspace-search-results a').length,1);
  assert.equal(document.querySelector('.workspace-search-results a').getAttribute('href'),'/dashboard/ngo/matches');
  await act(async()=>document.querySelector('.workspace-finder form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(navigated,['/dashboard/ngo/matches']);
  assert.equal(document.querySelector('dialog').open,false);
  await click(document.querySelector('.workspace-search-trigger'));
  assert.equal(search.value,'');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'unknown action');search.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(document.querySelector('.workspace-search-results').textContent,/No matching pages/);
  await click(document.querySelector('[aria-label="Close page search"]'));
  assert.equal(document.querySelector('dialog').open,false);
  assert.equal(document.querySelectorAll('.field-microphone').length,0);
});

test('dashboard activity filters and need search show real records and preserve the donation destination', async () => {
  const Overview=load(path.join(base,'dashboard/CommunityOverview.js')).default;
  const data={itemDonations:[{id:1,name:'Rice',category:'Food',unit:'kg',quantity:5,status:'Pending'},{id:2,name:'Book',category:'Education',unit:'unit',quantity:4,status:'Completed'}],matches:[],unreadNotifications:0,itemRequests:[
    {id:7,title:'Kitchen supplies',ngoName:'Care Kitchen',deliveryCity:'Hyderabad',status:'Open',items:[{itemId:'rice',name:'Rice',category:'Food',unit:'kg',quantity:10,remaining:8}]},
    {id:8,title:'School supplies',ngoName:'Learning NGO',deliveryCity:'Chennai',status:'Open',items:[{itemId:'book',name:'Book',category:'Education',unit:'unit',quantity:5,remaining:5}]},
    {id:9,title:'Closed need',ngoName:'Closed NGO',status:'Closed',items:[{itemId:'rice',name:'Rice',category:'Food',unit:'kg',quantity:5}]}
  ]};
  await act(async()=>root.render(React.createElement(Overview,{role:'donor',data})));
  assert.equal(document.querySelectorAll('.community-record').length,2);
  await click([...document.querySelectorAll('.overview-tabs button')].find(node=>node.textContent==='Active'));
  assert.equal(document.querySelectorAll('.community-record').length,1);
  assert.match(document.querySelector('.community-record').textContent,/Rice/);
  await click([...document.querySelectorAll('.overview-tabs button')].find(node=>node.textContent==='Completed'));
  assert.match(document.querySelector('.community-record').textContent,/Book/);
  assert.equal(document.querySelectorAll('.community-need-row').length,2);
  const search=document.querySelector('[aria-label="Search community needs"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'hyderabad');search.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(document.querySelectorAll('.community-need-row').length,1);
  assert.equal(document.querySelector('.community-need-row a').getAttribute('href'),'/dashboard/donor/give?item=rice&request=7');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'');search.dispatchEvent(new Event('input',{bubbles:true}));});
  const category=document.querySelector('[aria-label="Community need category"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(category,'Education');category.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(document.querySelectorAll('.community-need-row').length,1);
  assert.match(document.querySelector('.community-need-row').textContent,/School supplies/);
  assert.match(document.querySelector('.overview-caught-up').textContent,/caught up/);
});

test('mobile navigation opens, closes with Escape and restores the menu trigger focus', async () => {
  const session={role:'donor',email:'donor@test',name:'QA Donor'};
  const data={settings:{},users:[],notifications:[],unreadNotifications:0};
  mocks[path.resolve('lib/useAppData.js')]={__esModule:true,default:()=>({data,session,ready:true})};
  mocks[path.resolve('lib/api.js')]={refreshAppData(){}};
  for(const component of ['DonorWorkspace','NgoWorkspace','AdminWorkspace']) mocks[path.resolve(`components/dashboard/${component}.js`)]={__esModule:true,default:()=>null};
  const Shell=load(path.join(base,'dashboard/DashboardShell.js')).default;
  await act(async()=>root.render(React.createElement(Shell,{role:'donor',section:'notifications'})));
  const toggle=document.querySelector('.workspace-menu-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  await click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(document.activeElement,toggle);
  await click(toggle);
  await click(document.querySelector('.sidebar-menu a[href="/dashboard/donor/notifications"]'));
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(document.querySelectorAll('.dash-header a.btn').length,0);
});

test('NGO dictation stays in the request form and disappears on the request list', async () => {
  mocks[path.resolve('lib/api.js')] = {};
  const Requests = load(path.join(base, 'dashboard/NgoRequests.js')).default;
  const props = {session: {email: 'ngo@test'}, ngo: {status: 'Verified'}, data: {itemCatalog: [], itemRequests: []}};
  await act(async () => root.render(React.createElement(Requests, {...props, mode: 'create'})));
  assert.ok(document.querySelector('input[name="title"]'));
  assert.ok(document.querySelectorAll('form .field-microphone').length > 0);
  assert.equal(document.querySelectorAll('.field-microphone').length, document.querySelectorAll('form .field-microphone').length);
  await act(async () => root.render(React.createElement(Requests, {...props, mode: 'requests'})));
  assert.ok(document.querySelector('input[aria-label="Search your requests"]'));
  assert.equal(document.querySelectorAll('.field-microphone').length, 0);
});

test('field dictation updates controlled values and FormData; new listening cancels the previous field',async()=>{
  const {VoiceInput,VoiceTextarea}=load(path.join(base,'VoiceField.js'));
  function Form(){const [city,setCity]=React.useState('');return React.createElement('form',null,React.createElement(VoiceInput,{name:'city',value:city,onChange:e=>setCity(e.target.value)}),React.createElement(VoiceTextarea,{name:'notes'}),React.createElement('output',null,city));}
  await act(async()=>root.render(React.createElement(Form)));
  await click(document.querySelector('[aria-label="Dictate city"]'));
  await act(async()=>spoken.result('Hyderabad.'));
  assert.equal(document.querySelector('output').textContent,'Hyderabad');
  assert.equal(new window.FormData(document.querySelector('form')).get('city'),'Hyderabad');
  await click(document.querySelector('[aria-label="Dictate city"]'));const prior=spoken;
  await click(document.querySelector('[aria-label="Dictate notes"]'));assert.equal(prior.aborted,true);
  await act(async()=>spoken.result('Sealed boxes'));
  assert.equal(document.querySelector('textarea').value,'Sealed boxes');
});
test('dictation preserves manual edits, excludes passwords and readonly fields, and reports denial',async()=>{
  const {VoiceInput}=load(path.join(base,'VoiceField.js'));
  await act(async()=>root.render(React.createElement('div',null,React.createElement(VoiceInput,{name:'city'}),React.createElement(VoiceInput,{name:'password',type:'password'}),React.createElement(VoiceInput,{value:'fixed',readOnly:true}))));
  assert.equal(document.querySelectorAll('.field-microphone').length,1);
  await click(document.querySelector('.field-microphone'));
  document.querySelector('input').value='Manual city';
  await act(async()=>spoken.result('Spoken city'));
  assert.equal(document.querySelector('input').value,'Manual city');
  assert.match(document.body.textContent,/You edited this field/);
  await click(document.querySelector('.field-microphone'));
  await act(async()=>spoken.onerror({error:'not-allowed'}));
  assert.match(document.body.textContent,/Microphone access was blocked/);
});
test('camera requests front-facing video, captures a photo, and releases every track',async()=>{
  let stopped=0, requested;
  navigator.mediaDevices.getUserMedia=async options=>{requested=options;return {getTracks:()=>[{stop:()=>stopped++}]};};
  dom.window.HTMLMediaElement.prototype.play=async()=>{};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  dom.window.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new window.Blob(['photo'],{type:'image/jpeg'}));};
  mocks[path.resolve('lib/photoUpload.js')]={prepareDonationImage:async file=>{assert.equal(file.type,'image/jpeg');return 'data:image/jpeg;base64,cGhvdG8=';}};
  const Photo=load(path.join(base,'dashboard/PhotoInput.js')).default;
  let value;
  await act(async()=>root.render(React.createElement(Photo,{onChange:v=>value=v})));
  await click(button('Open front camera'));
  assert.equal(requested.video.facingMode.ideal,'user');assert.equal(requested.audio,false);
  const video=document.querySelector('video');Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480}});
  await act(async()=>video.dispatchEvent(new Event('loadedmetadata')));
  await click(button('Take picture'));
  assert.equal(value,'data:image/jpeg;base64,cGhvdG8=');assert.equal(stopped,1);assert.equal(document.querySelector('video'),null);
});
test('closing camera before permission resolves stops late streams and denied access has a fallback',async()=>{
  let resolve,stopped=0;
  navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const Photo=load(path.join(base,'dashboard/PhotoInput.js')).default;
  await act(async()=>root.render(React.createElement(Photo,{onChange(){}})));
  await click(button('Open front camera'));await click(button('Close camera'));
  await act(async()=>resolve({getTracks:()=>[{stop:()=>stopped++}]}));assert.equal(stopped,1);
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});};
  await click(button('Open front camera'));
  assert.match(document.body.textContent,/Camera access was blocked/);assert.ok(document.querySelector('input[capture="user"]'));
});
test('new donor fields are blank and photo suggestions fill catalog fields while stale results are ignored',async()=>{
  let photoChange,resolve;
  mocks[path.resolve('components/dashboard/PhotoInput.js')]={__esModule:true,default:({onChange})=>{photoChange=onChange;return null;}};
  mocks[path.resolve('lib/api.js')]={analyseDonationPhoto:()=>new Promise(r=>resolve=r)};
  const Form=load(path.join(base,'dashboard/ItemDonationForm.js')).default;
  const catalog=[{id:'book',name:'Book',category:'Education',unit:'unit'}];
  await act(async()=>root.render(React.createElement(Form,{session:{email:'donor@test'},data:{users:[{email:'donor@test',address:'Saved address',city:'Saved city'}],itemCatalog:catalog}})));
  assert.ok(document.querySelectorAll('form .field-microphone').length > 0);
  for(const name of ['quantity','city','address','state','pincode']) assert.equal(document.querySelector(`[name="${name}"]`).value,'');
  await act(async()=>{photoChange('first-photo');});
  const stale=resolve;
  await act(async()=>{photoChange('second-photo');});
  await act(async()=>stale({status:'recognized',itemId:'book',quantity:99}));
  assert.equal(document.querySelector('[name="quantity"]').value,'');
  await act(async()=>resolve({status:'recognized',itemId:'book',name:'Book',category:'Education',unit:'unit',quantity:4,warning:'Review details'}));
  assert.equal(document.querySelector('[name="itemId"]').value,'book');
  assert.equal(document.querySelector('[name="quantity"]').value,'4');
  await act(async()=>{photoChange('unsupported-photo');});
  await act(async()=>resolve({status:'unsupported',itemId:'',quantity:null,warning:'Unsupported image'}));
  assert.equal(document.querySelector('[name="quantity"]').value,'');assert.equal(document.querySelector('[name="itemId"]').value,'');
  assert.match(document.body.textContent,/Unsupported image/);
});

test('donation voice fills all spoken fields, preserves manual edits and supports a partial followup',async()=>{
  mocks[path.resolve('lib/api.js')]={};
  mocks[path.resolve('components/dashboard/PhotoInput.js')]={__esModule:true,default:()=>null};
  const Form=load(path.join(base,'dashboard/ItemDonationForm.js')).default;
  const catalog=[{id:'shirt',name:'Shirt',category:'Clothing',unit:'piece'},{id:'book',name:'Book',category:'Education',unit:'unit'}];
  await act(async()=>root.render(React.createElement(Form,{session:{email:'donor@test'},data:{users:[],itemCatalog:catalog}})));
  await click(button('Voice input'));
  assert.equal(spoken.mode,'donation');
  const city=document.querySelector('[name="city"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(city,'Manual city');city.dispatchEvent(new Event('input',{bubbles:true}));});
  const fields={itemId:'shirt',quantity:'3',address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',notes:'New shirts'};
  await act(async()=>spoken.result('Three shirts. Pickup at 12 Main Road, Guntur, Andhra Pradesh. Condition is New shirts.'));
  for (const [key,value] of Object.entries({...fields,city:'Manual city'})) assert.equal(document.querySelector(`[name="${key}"]`).value,value);
  assert.match(document.querySelector('.voice-panel').textContent,/Still needed: PIN code/);
  assert.deepEqual(navigated,[],'Dictation does not save or navigate');
  await click(button('Voice input'));
  await act(async()=>spoken.result('PIN five two two zero zero one.',{fields:{pincode:'522001'},warnings:[]}));
  assert.equal(document.querySelector('[name="pincode"]').value,'522001');
  assert.equal(document.querySelector('[name="quantity"]').value,'3');
  assert.equal(document.querySelector('[name="city"]').value,'Manual city');
  assert.match(document.querySelector('.voice-panel').textContent,/Review all filled details/);
  await click(button('Voice input'));
  await act(async()=>spoken.result('Quantity six kg', {text:'Quantity six kg'}));
  assert.equal(document.querySelector('[name="quantity"]').value,'6');
  assert.equal(document.querySelector('[name="itemId"]').value,'shirt');
  assert.equal(document.querySelector('[name="city"]').value,'Manual city');
  await click(button('Voice input'));
  await act(async()=>spoken.result('Two books and three shirts.',{fields:{itemId:'',quantity:''},warnings:['Please describe one item type at a time.']}));
  assert.equal(document.querySelector('[name="itemId"]').value,'');
  assert.equal(document.querySelector('[name="quantity"]').value,'');
  assert.match(document.querySelector('.voice-panel').textContent,/one item type at a time/);
});

test('typed transcript fills every text field and corrections can be reapplied without recording', async () => {
  mocks[path.resolve('lib/api.js')]={};
  mocks[path.resolve('components/dashboard/PhotoInput.js')]={__esModule:true,default:()=>null};
  const Form=load(path.join(base,'dashboard/ItemDonationForm.js')).default;
  const catalog=[{id:'shirt',name:'Shirt',category:'Clothing',unit:'piece'}];
  await act(async()=>root.render(React.createElement(Form,{session:{email:'donor@test'},data:{users:[],itemCatalog:catalog}})));
  const transcript=document.querySelector('[aria-label="Donation transcript"]');
  const type = async text => act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(transcript,text);
    transcript.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await type('Donate three new shirts pickup address 12 Main Road city Guntur state Andhra Pradesh pin code 522001 notes washed and packed');
  await click(button('Fill from text'));
  for (const [key,value] of Object.entries({itemId:'shirt',quantity:'3',address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001',notes:'washed and packed'})) {
    assert.equal(document.querySelector(`[name="${key}"]`).value,value,key);
  }
  await type('Quantity five');
  await click(button('Fill from text'));
  assert.equal(document.querySelector('[name="quantity"]').value,'5');
  assert.equal(document.querySelector('[name="address"]').value,'12 Main Road');
  assert.deepEqual(navigated,[]);
});

test('map confirmation updates donor and NGO profile FormData without submitting', async () => {
  const location = {address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001'};
  let submitted = 0;
  mocks[path.join(base,'dashboard/LocationPicker.js')] = {__esModule:true,default:({onConfirm,onClose})=>React.createElement('div',null,
    React.createElement('button',{type:'button',onClick:()=>onConfirm(location)},'Confirm test location'),
    React.createElement('button',{type:'button',onClick:onClose},'Cancel test location'))};
  const Fields = load(path.join(base,'ProfileFields.js')).default;
  for (const role of ['donor','ngo']) {
    await act(async()=>root.render(React.createElement('form',{onSubmit:e=>{e.preventDefault();submitted++;}},React.createElement(Fields,{role,disabledEmail:true}))));
    await click(button('Choose address on map')); await click(button('Confirm test location'));
    const data = new dom.window.FormData(document.querySelector('form'));
    for (const [key,value] of Object.entries(location)) assert.equal(data.get(key),value);
    await click(button('Choose address on map'));await click(button('Cancel test location'));
    assert.equal(document.querySelector('[name="address"]').value,location.address);
  }
  assert.equal(submitted,0);
});

test('NGO map confirmation fills controlled delivery fields', async () => {
  mocks[path.join(base,'dashboard/LocationPicker.js')] = {__esModule:true,default:({onConfirm})=>React.createElement('button',{type:'button',onClick:()=>onConfirm({address:'10 Lake Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001'})},'Confirm test location')};
  const Requests=load(path.join(base,'dashboard/NgoRequests.js')).default;
  await act(async()=>root.render(React.createElement(Requests,{data:{itemCatalog:[],itemRequests:[]},session:{email:'ngo@example.com'},ngo:{status:'Verified'},mode:'create'})));
  await click(button('Choose address on map'));await click(button('Confirm test location'));
  for (const [key,value] of Object.entries({deliveryAddress:'10 Lake Road',deliveryCity:'Guntur',deliveryState:'Andhra Pradesh',deliveryPincode:'522001'})) assert.equal(document.querySelector(`[name="${key}"]`).value,value);
});

test('matching uses the suggested quantity without asking the donor to enter it again', async () => {
  const sent=[];
  mocks[path.resolve('lib/api.js')]={request:async()=>[{requestId:2,ngoName:'Book NGO',title:'Books needed',city:'Guntur',available:4,suggestedQuantity:4,priority:'Medium'}],createMatch:async payload=>{sent.push(payload);return {id:8};}};
  const Matches=load(path.join(base,'dashboard/Matches.js')).default;
  await act(async()=>root.render(React.createElement(Matches,{data:{itemDonations:[{id:1,name:'Book',unit:'unit',available:10}],matches:[]},session:{role:'donor'}})));
  const select=document.querySelector('.exchange-panel select');
  await act(async()=>{select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));});
  const candidate=document.querySelector('.match-candidate');assert.ok(candidate);
  assert.equal(candidate.querySelector('input'),null);assert.match(candidate.textContent,/4 units to donate/);
  await act(async()=>candidate.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(sent,[{donationId:1,requestId:2,quantity:4}]);
});

test('pickup save collapses the form, edit reopens it, and failed saves retain the form', async () => {
  HTMLElement.prototype.scrollIntoView = function() {};
  let fail=true, saved;
  mocks[path.resolve('lib/api.js')]={request:async()=>({}),updateMatch:async(id,payload)=>{if(fail)throw new Error('Please try again');saved=payload;}};
  const Matches=load(path.join(base,'dashboard/Matches.js')).default;
  const match={id:8,version:1,name:'Book',quantity:4,unit:'unit',ngoName:'Book NGO',status:'Pending',pickupAddress:'12 Main Road',pickupCity:'Guntur',pickupState:'Andhra Pradesh',pickupPincode:'522001'};
  const render=async()=>act(async()=>root.render(React.createElement(Matches,{data:{itemDonations:[],matches:[{...match}]},session:{role:'donor'}})));
  await render();await click(button('View details'));
  const date=document.querySelector('input[type="datetime-local"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2030-11-07T15:21');date.dispatchEvent(new Event('input',{bubbles:true}));});
  const submit=async()=>act(async()=>document.querySelector('.pickup-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await submit();assert.ok(document.querySelector('.pickup-form'));assert.match(document.body.textContent,/Please try again/);
  fail=false;await submit();assert.equal(document.querySelector('.pickup-form'),null);assert.match(document.body.textContent,/Awaiting NGO collection/);assert.equal(saved.action,'schedule');
  Object.assign(match,saved,{status:'Pickup scheduled',version:2});await render();
  assert.equal(document.querySelector('.pickup-form'),null);
  await click(button('Edit pickup'));assert.ok(document.querySelector('.pickup-form'));assert.equal(document.querySelector('input[type="datetime-local"]').value,'2030-11-07T15:21');
  await click(button('Cancel changes'));assert.equal(document.querySelector('.pickup-form'),null);
});

test('receipt confirmation blocks mismatched photos and requires checking each replacement', async () => {
  HTMLElement.prototype.scrollIntoView=function(){};
  let result='mismatch', confirmed=0;
  mocks[path.join(base,'dashboard/PhotoInput.js')]={__esModule:true,default:({onChange})=>React.createElement('button',{type:'button',onClick:()=>onChange('data:image/png;base64,test')},'Upload test proof')};
  mocks[path.resolve('lib/api.js')]={request:async()=>({}),analyseReceivedItem:async()=>({status:result,expectedItem:'Book',observedItem:'Jacket',explanation:'Different item'}),updateMatch:async()=>{confirmed++;},refreshAppData:async()=>{}};
  const Matches=load(path.join(base,'dashboard/Matches.js')).default;
  await act(async()=>root.render(React.createElement(Matches,{data:{itemDonations:[],matches:[{id:8,version:1,status:'Pickup scheduled',name:'Book',quantity:3,unit:'unit',ngoName:'Book NGO'}]},session:{role:'ngo'}})));
  await click(button('View details'));await click(button('Confirm physical receipt'));await click(button('Upload test proof'));
  assert.equal(button('Confirm receipt').disabled,true);
  assert.match(document.body.textContent,/Not matching/);assert.equal(button('Confirm receipt').disabled,true);
  assert.equal(document.querySelector('.receipt-review input').disabled,true);
  result='match';await click(button('Upload test proof'));
  await click(document.querySelector('.receipt-review input'));assert.equal(button('Confirm receipt').disabled,false);
  await click(button('Upload test proof'));assert.equal(button('Confirm receipt').disabled,true);
  await click(document.querySelector('.receipt-review input'));await click(button('Confirm receipt'));
  assert.equal(confirmed,1);
});

test('completed photo history can check saved proof and display a mismatch warning', async () => {
  mocks[path.resolve('lib/api.js')]={request:async()=>({deliveryProof:'saved-proof',donationImage:'saved-original'}),analyseReceivedItem:async(id,proof)=>{assert.equal(proof,'saved-proof');return {status:'mismatch',expectedItem:'Book',observedItem:'Jacket',explanation:'Different item types'};}};
  const Photos=load(path.join(base,'dashboard/Matches.js')).MatchPhotos;
  await act(async()=>root.render(React.createElement(Photos,{match:{id:8,version:1,status:'Completed',name:'Book'}})));
  await click(button('Check saved photos'));
  assert.match(document.querySelector('[role="alert"]').textContent,/Not matching/);
});

test('map dropdown searches as typed, confirms missing PIN and does not submit parent form', async () => {
  const calls=[]; let chosen, submitted=0;
  mocks[path.resolve('lib/api.js')]={request:async url=>{calls.push(url);return [{id:'1',label:'Kompalli',detail:'Medchal, Telangana, India',name:'Kompalli, Telangana',lat:17.54,lon:78.48,fields:{address:'Kompalli',city:'Kompalli',state:'Telangana',pincode:''}}];}};
  const Picker=load(path.join(base,'dashboard/LocationPicker.js')).default;
  await act(async()=>root.render(React.createElement('form',{onSubmit:event=>{event.preventDefault();submitted++;}},React.createElement(Picker,{onClose(){},onConfirm(value){chosen=value;}}))));
  const input=document.querySelector('[aria-label="Search address location"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'kompally');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,650));});
  assert.deepEqual(calls,['places/suggest/?q=kompally']);
  assert.match(document.querySelector('[role="listbox"]').textContent,/Medchal, Telangana/);
  await act(async()=>document.querySelector('.location-picker-search').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(submitted,0);
  assert.match(calls.at(-1),/places\/search/);
  // A normal address result can omit its postcode and still be selected.
  mocks[path.resolve('lib/api.js')].request=async()=>[];
  await click(document.querySelector('[role="option"]'));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1250));});
  await click(button('Confirm Location'));
  assert.equal(chosen.city,'Kompalli');
  assert.equal(chosen.pincode,'');
  assert.equal(submitted,0);
});

test('admin tracking filters accounts and loads receipt proof without mutation controls', async () => {
  const entry={id:1,donationId:2,requestId:3,name:'Rice',unit:'kg',quantity:5,status:'Completed',donorName:'Asha',donorEmail:'asha@example.test',ngoName:'Kitchen',ngoEmail:'kitchen@example.test',completedAt:'2026-11-21',createdAt:'2026-11-20',events:[{id:1,title:'Receipt confirmed',message:'Items received',actorRole:'ngo',createdAt:'2026-11-21'}]};
  const calls=[];
  mocks[path.resolve('lib/api.js')]={request:async url=>{calls.push(url);return {...entry,deliveryNote:'Thank you',donationImage:'',deliveryProof:''};}};
  const Tracking=load(path.join(base,'dashboard/AdminTracking.js')).default;
  const data={matches:[entry],itemDonations:[{id:2,donorEmail:entry.donorEmail}],itemRequests:[],users:[{id:1,name:'Asha',email:entry.donorEmail,role:'donor',approvalStatus:'Approved',canLogin:true},{id:2,name:'Other',email:'other@example.test',role:'donor',approvalStatus:'Pending'}]};
  await act(async()=>root.render(React.createElement(Tracking,{data})));
  assert.match(document.body.textContent,/Asha.*Kitchen/);
  await click(button('View donation & receipt photos'));
  assert.deepEqual(calls,['matches/1/']);
  assert.equal(button('Confirm physical receipt'),undefined);
  assert.equal(button('Check saved photos'),undefined);
  const select=document.querySelector('[aria-label="Track an account"]');
  await act(async()=>{select.value='other@example.test';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.match(document.body.textContent,/No records in this view/);
});

test('donor impact celebrates received items without counting pending matches', async () => {
  const Impact=load(path.join(base,'dashboard/DonorImpact.js')).default;
  await act(async()=>root.render(React.createElement(Impact,{session:{name:'Asha'},data:{matches:[{id:4,status:'Completed',name:'Rice',unit:'kg',quantity:5,ngoName:'Kitchen',completedAt:'2026-11-21',deliveryNote:'Received with thanks'},{id:5,status:'Pending',quantity:100,name:'Rice',unit:'kg',ngoName:'Kitchen'}]}})));
  assert.match(document.body.textContent,/Thank you, Asha/);
  assert.match(document.body.textContent,/Received with thanks/);
  assert.equal(document.querySelectorAll('.impact-milestones .earned').length,1);
  assert.equal(document.querySelectorAll('.impact-story article').length,1);
  assert.ok(document.querySelector('a[href="/dashboard/donor/matches?match=4"]'));
});

test('available offers ask only for quantity and reuse the NGO profile', async () => {
  const calls=[];
  const offer={id:77,name:'Rice',unit:'kg',category:'Food',city:'Hyderabad',available:10,requests:[]};
  mocks[path.resolve('lib/api.js')]={request:async(url,options)=>{if(options){calls.push({url,body:options.body});return {detail:'Interest sent'};}return [offer];},refreshAppData:async()=>{}};
  const Available=load(path.join(base,'dashboard/AvailableDonations.js')).default;
  const profile={email:'ngo@example.test',address:'NGO Road',city:'Hyderabad',state:'Telangana',pincode:'500001',phone:'9876543210'};
  await act(async()=>root.render(React.createElement(Available,{data:{users:[profile]},session:{email:profile.email}})));
  const field=document.querySelector('input[aria-label="Quantity needed for Rice"]');
  assert.ok(field);
  assert.equal(document.querySelectorAll('form input').length,1);
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'3');field.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(calls,[{url:'item-donations/77/interest/',body:{quantity:3}}]);
  assert.match(document.body.textContent,/Interest sent/);
});

test('admin account details show only the selected account across activity tabs', async () => {
  const Details=load(path.join(base,'dashboard/AdminAccountDetails.js')).default;
  const account={id:1,name:'Asha',email:'asha@example.test',role:'donor',approvalStatus:'Approved',canLogin:true,isActive:true};
  const data={users:[account],ngos:[],matches:[{id:1,donorEmail:account.email,ngoName:'Kitchen',name:'Rice',unit:'kg',quantity:3,status:'Completed'},{id:2,donorEmail:'other@example.test',ngoName:'Other',name:'Private other item',status:'Completed'}],itemDonations:[{id:3,name:'Rice',donorEmail:account.email,unit:'kg',quantity:3,status:'Completed'}],itemRequests:[]};
  await act(async()=>root.render(React.createElement(Details,{account,data,onBack(){}})));
  assert.match(document.body.textContent,/Items offered/);
  await click(button('Delivered items'));
  assert.match(document.body.textContent,/Kitchen/);
  assert.doesNotMatch(document.body.textContent,/Private other item/);
  assert.equal(document.querySelector('[aria-label="Track an account"]'),null);
});

test('compact request register links each request to its own details and delivery status', async () => {
  const List=load(path.join(base,'dashboard/NgoRequestList.js')).default;
  const items=[{itemId:'rice',name:'Rice',quantity:10,fulfilled:0,reserved:5,unit:'kg'}];
  await act(async()=>root.render(React.createElement(List,{requests:[{id:1,title:'Kitchen',status:'Open',items},{id:2,title:'School',status:'Open',items}],matches:[{id:3,requestId:1,status:'Pickup scheduled'}]})));
  const rows=document.querySelectorAll('.request-register-row');
  assert.equal(rows[0].getAttribute('href'),'/dashboard/ngo/requests?request=1');
  assert.match(rows[0].textContent,/1 pickup scheduled/);
  assert.equal(rows[1].getAttribute('href'),'/dashboard/ngo/requests?request=2');
  assert.match(rows[1].textContent,/Waiting for a donor/);
  assert.equal(document.querySelector('.ngo-delivery-updates'),null);
});

test('NGO request updates follow donor acceptance, pickup and receipt without mixing requests', async () => {
  const Updates=load(path.join(base,'dashboard/NgoDeliveryUpdates.js')).default;
  const entry={id:19,requestId:8,donorName:'Asha',name:'Rice',quantity:5,unit:'kg',status:'Pending'};
  const render=async(matches)=>act(async()=>root.render(React.createElement(Updates,{matches,requestId:8})));
  await render([]);assert.match(document.body.textContent,/Waiting for a donor to accept/);
  await render([entry,{...entry,id:20,requestId:9,donorName:'Other donor'}]);
  assert.match(document.body.textContent,/Donor accepted/);
  assert.doesNotMatch(document.body.textContent,/Other donor/);
  assert.equal(document.querySelector('a').getAttribute('href'),'/dashboard/ngo/matches?match=19');
  await render([{...entry,status:'Pickup scheduled',pickupAt:'2026-11-22T10:00:00Z',pickupAddress:'Donor Road'}]);
  assert.match(document.body.textContent,/Ready for collection/);
  assert.match(document.body.textContent,/Donor Road/);
  await render([{...entry,status:'Completed'}]);assert.match(document.body.textContent,/Your NGO confirmed receipt/);
  await render([{...entry,status:'Cancelled'}]);assert.match(document.body.textContent,/no longer reserved/);
});

test('admin directories separate roles and filter activity before opening a profile', async () => {
  const Directory=load(path.join(base,'dashboard/AdminDirectory.js')).default;
  const donor={id:1,name:'Asha',email:'asha@example.test',role:'donor',city:'Hyderabad',approvalStatus:'Approved',canLogin:true};
  const other={...donor,id:2,name:'Ravi',email:'ravi@example.test'};
  const ngo={...donor,id:3,name:'Kitchen',email:'kitchen@example.test',role:'ngo'};
  const data={users:[donor,other,ngo],itemDonations:[{donorEmail:donor.email}],itemRequests:[{ownerEmail:ngo.email}],matches:[{donorEmail:donor.email,ngoEmail:ngo.email,status:'Completed'},{donorEmail:other.email,ngoEmail:ngo.email,status:'Cancelled'}]};
  let selected;
  await act(async()=>root.render(React.createElement(Directory,{data,role:'donor',onOpenAccount:id=>{selected=id;}})));
  assert.equal(document.querySelectorAll('.directory-card').length,2);
  assert.doesNotMatch(document.querySelector('.directory-grid').textContent,/Kitchen/);
  const select=document.querySelector('select');
  await act(async()=>{select.value='completed';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(document.querySelectorAll('.directory-card').length,1);
  await click(button('Open profile'));assert.equal(selected,1);
  await act(async()=>{select.value='ongoing';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.match(document.body.textContent,/No profiles found/);
  await act(async()=>root.render(React.createElement(Directory,{key:'ngo',data,role:'ngo',onOpenAccount:id=>{selected=id;}})));
  assert.equal(document.querySelectorAll('.directory-card').length,1);
  assert.match(document.querySelector('.directory-card').textContent,/Kitchen/);
  assert.equal(document.querySelector('.directory-stats dd').textContent,'1');
  const input=document.querySelector('input');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'missing');input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(document.body.textContent,/No profiles found/);
});
