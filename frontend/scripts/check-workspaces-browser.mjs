import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('../output/qa-private/accounts.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
try {
 for(const role of ['donor','ngo']) {
  const context=await browser.newContext();const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(fixture.origin)&&r.status()>=500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  await page.goto(`${fixture.origin}/${role}/login`);
  await page.locator('input[name="email"]').fill(fixture.accounts[role].email);
  await page.locator('input[name="password"]').fill(fixture.accounts[role].password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/dashboard/${role}`,{timeout:30000});
  const pages=role==='donor'?['impact','items','matches','requirements','give','notifications','profile']:['requests','available','create','matches','notifications','profile'];
  for(const section of pages){await page.goto(`${fixture.origin}/dashboard/${role}/${section}`);await page.locator('#workspace-content h1').waitFor();console.log('PASS authenticated',role,section);}
  await context.close();
 }
 const page=await browser.newPage();await page.goto(fixture.origin+'/campaigns');await page.waitForURL('**/ngos');console.log('PASS campaign redirect');
 console.log('Server or browser errors:',errors.length);if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
