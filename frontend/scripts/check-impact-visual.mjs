import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const origin='http://localhost:3000';
const baseline=await (await fetch(origin+'/api/state/')).json();
const donor={id:9001,name:'Asha Rao',email:'asha@example.test',role:'donor',approvalStatus:'Approved',canLogin:true,isActive:true,city:'Hyderabad',joinedAt:'2026-11-01'};
const ngo={id:9002,name:'Community Kitchen',email:'kitchen@example.test',role:'ngo',approvalStatus:'Approved',canLogin:true,isActive:true,city:'Hyderabad',joinedAt:'2026-11-01'};
const match={id:901,donationId:902,requestId:903,name:'Rice',quantity:10,unit:'kg',status:'Completed',ngoName:ngo.name,ngoEmail:ngo.email,donorName:donor.name,donorEmail:donor.email,deliveryCity:'Hyderabad',createdAt:'2026-11-20T10:00:00Z',completedAt:'2026-11-21T10:00:00Z',deliveryNote:'Thank you for the rice. All 10 kg arrived in good condition.',events:[{id:1,title:'Donation completed',message:'The NGO confirmed physical receipt.',actorRole:'ngo',createdAt:'2026-11-21T10:00:00Z'}]};
const data={...baseline.data,users:[donor,ngo],ngos:[],itemDonations:[{id:902,name:'Rice',quantity:10,unit:'kg',completed:10,available:0,donorName:donor.name,donorEmail:donor.email,status:'Completed',createdAt:match.createdAt}],itemRequests:[],matches:[match],contacts:[],flags:[],accountActivity:[],settings:{},unreadNotifications:0,notifications:[]};
let role='donor';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/state/',route=>route.fulfill({json:{session:role==='donor'?donor:{name:'Community Admin',email:'admin@example.test',role:'admin'},data}}));
mkdirSync('../output/impact-tracking',{recursive:true});
for(const [section,r] of [['impact','donor'],['tracking','admin'],['donors','admin']]) {
 role=r;await page.goto(`${origin}/dashboard/${r}/${section}`); await page.locator('#workspace-content').waitFor();
 await page.screenshot({path:`../output/impact-tracking/${r}-${section}.png`,fullPage:true});
 console.log(section,await page.locator('h1').textContent());
 if(section==='impact'||section==='tracking') {await page.setViewportSize({width:390,height:844});await page.screenshot({path:`../output/impact-tracking/${r}-mobile.png`,fullPage:true});console.log('mobile overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.setViewportSize({width:1440,height:1000});}
}
console.log('browser errors',errors);await browser.close();if(errors.length)process.exitCode=1;
