import test from 'node:test';
import assert from 'node:assert/strict';
import { dictationValue } from '../lib/speechInput.js';
import { browserDonationSpeech } from '../lib/donationSpeech.js';

test('pickup and delivery dictation preserve mixed house-number separators', () => {
  const cases = [
    ['34-147/1 Main Road', '34-147/1 Main Road'],
    ['34 - 147 / 1 Main Road', '34-147/1 Main Road'],
    ['thirty four dash one hundred and forty seven slash one Main Road', '34-147/1 Main Road'],
    ['a dash 34-147/1 Main Road', 'A-34-147/1 Main Road'],
    ['eight dash thirty four dash forty seven by one Main Road', '8-34-47/1 Main Road'],
    ['34 hyphen 147 forward slash 1 Main Road', '34-147/1 Main Road'],
    ['12 North-West Road', '12 North-West Road'],
  ];
  for (const [spoken, expected] of cases) {
    for (const name of ['address', 'deliveryAddress']) assert.equal(dictationValue(spoken, {name}), expected, spoken);
    assert.equal(browserDonationSpeech(`Pickup address ${spoken}`, []).fields.address, expected, spoken);
  }
});
test('dictation converts quantities, phone/PIN digits and spoken email separators',()=>{
  for(const [words,value] of [['twenty five','25'],['five point two kg','5.2'],['one hundred and twenty five units','125'],['fourteen','14']]) assert.equal(dictationValue(words,{type:'number'}),value);
  assert.equal(dictationValue('five zero zero zero zero one',{inputMode:'numeric',maxLength:6}),'500001');
  assert.equal(dictationValue('plus nine one nine eight seven six five four three two one zero',{type:'tel'}),'+919876543210');
  assert.equal(dictationValue('giver at example dot com.',{type:'email'}),'giver@example.com');
});
test('ambiguous numbers and oversized dictated text do not silently change fields',()=>{
  assert.throws(()=>dictationValue('five hundred',{type:'tel'}));
  assert.throws(()=>dictationValue('a lot',{type:'number'}));
  assert.throws(()=>dictationValue('1234567',{inputMode:'numeric',maxLength:6}));
});
test('whole-number quantity fields reject decimal dictation without rounding',()=>{
  assert.throws(()=>dictationValue('three point three',{type:'number',step:'1'}),/whole number/);
  assert.equal(dictationValue('three',{type:'number',step:'1'}),'3');
  assert.equal(dictationValue('4.0',{type:'number',step:'1'}),'4');
});

test('quantity dictation normalizes hundreds, thousands and dozens with the real input attributes',()=>{
  const props={type:'number',inputMode:'numeric',step:'1',min:'1',max:'1000000'};
  for(const [words,expected] of [['one hundred and twenty five','125'],['quantity is twenty five','25'],['six kgs','6'],['two thousand','2000'],['a dozen','12'],['two dozen','24'],['one','1']]) {
    assert.equal(dictationValue(words,props),expected);
  }
  for(const words of ['five or six','0','1000001','three point five']) assert.throws(()=>dictationValue(words,props));
});
test('text quantity input accepts numeric-keyboard dictation with spoken units',()=>{
  const props={type:'text',name:'quantity',inputMode:'numeric',step:'1',min:'1',max:'1000000',maxLength:7};
  assert.equal(dictationValue('quantity six kg',props),'6');
  assert.equal(dictationValue('six kgs',props),'6');
});

test('individual location fields accept spoken field labels', () => {
  assert.equal(dictationValue('My pin code is five two two zero zero one.', {name:'pincode',inputMode:'numeric',maxLength:6}),'522001');
  assert.equal(dictationValue('My city is Guntur.', {name:'city'}),'Guntur');
  assert.equal(dictationValue('State Andhra Pradesh.', {name:'state'}),'Andhra Pradesh');
});
