import test from 'node:test';
import assert from 'node:assert/strict';
import {browserDonationSpeech} from '../lib/donationSpeech.js';
const catalog = ['Shirt','Book','Notebook','Blanket','Backpack','Rice','School Bag','T-Shirt'].map(name=>({name,id:name.toLowerCase().replaceAll(' ','-')}));
test('unpunctuated speech fills every spoken field without leaking labels', () => {
  const result = browserDonationSpeech('donate three shirts pickup address twelve Main Road city Guntur state Andhra Pradesh pin code five two two zero zero one notes new and packed', catalog);
  assert.deepEqual(result.fields, {itemId:'shirt',quantity:'3',address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001',notes:'new and packed'});
});
test('natural pickup phrases and quantity after item are understood', () => {
  const result = browserDonationSpeech('Rice ten kilograms pick up from twelve Main Road Guntur Andhra Pradesh pin code 522001', catalog);
  assert.deepEqual(result.fields, {itemId:'rice',quantity:'10',address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001'});
});
test('condition does not become a city and notes retain multiple sentences', () => {
  const result = browserDonationSpeech('Donate three shirts. They are in good condition. Washed and packed. My city is Guntur. State Andhra Pradesh.', catalog);
  assert.equal(result.fields.city,'Guntur');
  assert.equal(result.fields.notes,'in good condition. Washed and packed');
  assert.equal(browserDonationSpeech('Donate three shirts in good condition.',catalog).fields.city,undefined);
});
test('browser transcript fills explicit donation details locally', () => {
  const result = browserDonationSpeech('Donate three shirts. Pickup at twelve Main Road, Guntur, Andhra Pradesh. PIN five two two zero zero one. They are new.',catalog);
  assert.deepEqual(result.fields,{itemId:'shirt',quantity:'3',address:'12 Main Road',city:'Guntur',state:'Andhra Pradesh',pincode:'522001',notes:'new'});
});
test('address numbers never become item quantities and labelled followups preserve unspecified fields', () => {
  const result=browserDonationSpeech('Pickup at house number twenty five, Lake Road, Guntur, Andhra Pradesh. PIN five two two zero zero one. I want to donate seven notebooks. They are unused.',catalog);
  assert.equal(result.fields.quantity,'7'); assert.match(result.fields.address,/25/); assert.equal(result.fields.city,'Guntur');
  assert.deepEqual(browserDonationSpeech('My city is Hyderabad.',catalog).fields,{city:'Hyderabad'});
  assert.deepEqual(browserDonationSpeech('PIN five two two zero zero one.',catalog).fields,{pincode:'522001'});
});
test('mixed items clear suggestions and compound names do not overlap', () => {
  const result=browserDonationSpeech('Two books and three blankets in Guntur.',catalog);
  assert.equal(result.fields.itemId,''); assert.equal(result.fields.quantity,''); assert.match(result.warnings[0],/one item type/);
  assert.equal(browserDonationSpeech('Three tee shirts in Guntur.',catalog).fields.itemId,'t-shirt');
});
test('corrections, missing quantities and decimals are handled conservatively', () => {
  assert.equal(browserDonationSpeech('Donate five, sorry, three school bags in Vijayawada.',catalog).fields.quantity,'3');
  assert.equal(browserDonationSpeech('Donate shirts in Chennai.',catalog).fields.quantity,'');
  assert.equal(browserDonationSpeech('Donate two point five kg of rice.',catalog).fields.quantity,'');
  assert.equal(browserDonationSpeech('Rice to donate. The quantity is ten kilograms. My city is Hyderabad.',catalog).fields.quantity,'10');
  assert.deepEqual(browserDonationSpeech('I want to help.',catalog).fields,{});
});
test('kilogram shorthand and a trailing Andhra Pradesh city fill their fields', () => {
  assert.deepEqual(browserDonationSpeech('5 kgs rice Tenali',catalog).fields,{itemId:'rice',quantity:'5',city:'Tenali'});
});
test('quantity-only follow-up recordings fill quantity without repeating item or location', () => {
  assert.deepEqual(browserDonationSpeech('quantity six kg',catalog).fields,{quantity:'6'});
  assert.deepEqual(browserDonationSpeech('6 kgs',catalog).fields,{quantity:'6'});
  assert.deepEqual(browserDonationSpeech('rice quantity 6 kg Tenali',catalog).fields,{itemId:'rice',quantity:'6',city:'Tenali'});
});
test('spoken door-number separators become hyphens and a slash in the pickup address', () => {
  assert.equal(browserDonationSpeech('Pickup at 8 dash 34 dash 47 by 1 Vijayanagar Colony',catalog).fields.address,'8-34-47/1 Vijayanagar Colony');
});
