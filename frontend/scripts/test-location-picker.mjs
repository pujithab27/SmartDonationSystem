import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const origin=process.env.MAP_TEST_ORIGIN || 'http://127.0.0.1:3011';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({channel:'chrome',headless:true});
const location={id:'map-1',name:'34-147/1 Main Road, Bengaluru, Karnataka, 560001',lat:12.9716,lon:77.5946,fields:{address:'34-147/1 Main Road',city:'Bengaluru',state:'Karnataka',pincode:'560001'}};
try {
  const context=await browser.newContext({permissions:['geolocation'],geolocation:{latitude:12.9716,longitude:77.5946}});
  const page=await context.newPage(), errors=[], writes=[];
  let reverseCalls=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**', route=>{
    const url=route.request().url();
    if(route.request().method()!=='GET') {writes.push(url);return route.abort();}
    if(url.includes('places/search')) return route.fulfill({json:[location]});
    if(url.includes('places/reverse')) {reverseCalls++;return route.fulfill({json:{...location,name:'Selected pin, Bengaluru',fields:{...location.fields,address:'Selected pin road'}}});}
    return route.fulfill({json:{session:{role:'donor',email:'map-test@example.com',name:'Map Test'},data:{users:[],ngos:[],requests:[],donations:[],saved:{},settings:{},flags:[],contacts:[],accountActivity:[],itemCatalog:[{id:'shirt',name:'Shirt',category:'Clothing',unit:'piece'}],itemRequests:[],itemDonations:[],matches:[],notifications:[],unreadNotifications:0}}});
  });
  await page.goto(`${origin}/dashboard/donor/give`);
  const open=()=>page.getByRole('button',{name:'Choose location on map',exact:true}).click();
  await page.locator('[name="address"]').fill('Keep original');
  await open();
  const modal=page.getByRole('dialog');
  assert.equal(await modal.isVisible(),true);
  assert.equal(await modal.getByRole('button',{name:'Confirm Location'}).isDisabled(),true);
  await modal.getByLabel('Search pickup location').fill('Main Road Bengaluru');
  await modal.getByRole('button',{name:'Search',exact:true}).click();
  await modal.getByRole('button',{name:location.name,exact:true}).click();
  assert.equal(await page.locator('[name="address"]').inputValue(),'Keep original');
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await modal.locator('.leaflet-tile-loaded').first().waitFor({timeout:15000});
    assert.ok(await modal.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'No horizontal overflow');
    await modal.screenshot({path:`../output/qa-private/location-picker-${width}.png`});
  }
  await modal.getByRole('button',{name:'Confirm Location'}).click();
  for(const [name,value] of Object.entries(location.fields)) assert.equal(await page.locator(`[name="${name}"]`).inputValue(),value);
  await open(); await page.keyboard.press('Escape');
  assert.equal(await modal.count(),0);
  assert.equal(await page.locator('[name="address"]').inputValue(),location.fields.address);
  await open();
  await modal.getByRole('button',{name:'Use Current Location'}).click();
  await modal.getByText('Selected pin, Bengaluru',{exact:true}).waitFor();
  const before=reverseCalls;
  const map=modal.getByRole('region',{name:'Pickup location map'});
  await map.click({position:{x:100,y:140}});
  await page.waitForFunction(()=>document.querySelector('.location-picker-selection p')?.textContent==='Selected pin, Bengaluru');
  await page.waitForTimeout(1500);
  assert.ok(reverseCalls>before,'Map click resolves address');
  const pin=modal.locator('.pickup-map-pin');
  const box=await pin.boundingBox();
  const dragBefore=reverseCalls;
  await page.mouse.move(box.x+15,box.y+14);await page.mouse.down();await page.mouse.move(box.x+45,box.y+40,{steps:6});await page.mouse.up();
  await page.waitForTimeout(1500);assert.ok(reverseCalls>dragBefore,'Pin drag resolves address');
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('[name="address"]').inputValue(),location.fields.address);
  await context.clearPermissions();
  await context.grantPermissions([]);
  await page.addInitScript(()=>{});
  await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=(_success,fail)=>fail({code:1});});
  await open();await modal.getByRole('button',{name:'Use Current Location'}).click();
  assert.match(await modal.getByRole('alert').innerText(),/denied/);
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('PASS: desktop/mobile layout, search, confirmation, Escape, cancellation, current location, map click, pin drag and denied permission. No donation writes.');
} finally {await browser.close();}
