import { normalizeSpokenNumbers } from './spokenNumbers.js';
import { normalizeSpokenAddress } from './spokenAddress.js';

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = value => value.trim().replace(/^[, .]+|[, .]+$/g, '');
const states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh'];
const trailingCities = ['Tenali','Guntur','Vijayawada','Visakhapatnam','Rajahmundry','Kakinada','Nellore','Ongole','Tirupati','Anantapur','Eluru','Kadapa','Chittoor'];

// Speech services often omit punctuation. Delimit labelled fields before
// extraction so an address or note cannot swallow the fields that follow it.
function prepareTranscript(text) {
  return text
    .replace(/\bpin\s+code\b/gi, 'pincode')
    .replace(/\b(?:pick\s*up (?:location|address)|full (?:pickup )?address|my address|address)(?:\s+is)?\s*:?\s*/gi, 'pickup address is ')
    .replace(/\b(?:i live in|i am located in|i'm located in)\s+/gi, 'city is ')
    .replace(/\b(?:it's|it is|these are)\s+/gi, 'they are ')
    .replace(/\b(?:my|the)\s+(?=(?:city|state|quantity|pincode)\b)/gi, '')
    .replace(/\s+(?=(?:city|state|quantity|pincode|postal code|pickup address|notes?|condition is)\b)/gi, '. ')
    .replace(/\.+\s*\./g, '.');
}

// Browser speech supplies text only. Extract explicit labels and catalog
// phrases locally; uncertain or unspoken values remain available for typing.
export function browserDonationSpeech(text, catalog) {
  const fields = {}, warnings = [];
  let normalized = normalizeSpokenNumbers(prepareTranscript(text).replace(/\boh\b/gi, 'zero'))
    .replace(/\bnote books?\b/gi, 'notebook').replace(/\bback packs?\b/gi, 'backpack')
    .replace(/\b(?:tee|t)[ -]shirts?\b/gi, 't-shirt')
    .replace(/\b(?:a|one) dozen\b/gi, '12').replace(/\b(\d+) dozen\b/gi, (_, n) => String(Number(n) * 12));
  normalized = normalized.replace(/\b\d+(?:\.\d+)?\s*[, ]+(?:sorry|I mean|make that)\s*[, ]*(?=\d)/gi, '');
  const itemText = normalized.split(/\b(?:pick\s*up (?:at|from)|pickup address|address is|house number|my city|city is|pin(?:\s*code)?|postal code|they are|condition is|notes?)\b/i)[0];
  const candidates = [];
  for (const item of [...catalog].sort((a, b) => b.name.length - a.name.length)) {
    const name = escape(item.name).replace(/ /g, '\\s+');
    const plural = /[^aeiou]y$/i.test(item.name) ? `${escape(item.name.slice(0, -1))}ies` : `${name}(?:s|es)?`;
    const pattern = new RegExp(`\\b(?:${plural})\\b`, 'gi');
    for (const match of itemText.matchAll(pattern)) {
      if (!candidates.some(other => match.index >= other.start && match.index < other.end)) {
        candidates.push({item, start:match.index, end:match.index+match[0].length});
      }
    }
  }
  const ids = new Set(candidates.map(candidate => candidate.item.id));
  // A separately labelled donation may follow the pickup address.
  if (!candidates.length) {
    // Let a short follow-up recording fill quantity without repeating the item.
    const labelledQuantity = normalized.match(/\b(?:the\s+)?quantity(?:\s+is)?\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1];
    const standaloneQuantity = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*(?:kgs?|kilograms?|litres?|liters?|pieces?|pairs?|units?)\s*(?:of\s*)?[,.!?]*$/i)?.[1];
    const quantity = labelledQuantity || standaloneQuantity;
    if (quantity) {
      const value = Number(quantity);
      fields.quantity = Number.isInteger(value) && value >= 1 && value <= 1000000 ? String(value) : '';
      if (!fields.quantity) warnings.push('Use a whole quantity between 1 and 1,000,000.');
    }
    const afterAddress = normalized.match(/\b(?:I want to donate|donate|donating)\s+(.+)/i);
    if (afterAddress && afterAddress.index > 0) {
      const later = browserDonationSpeech(afterAddress[1], catalog);
      Object.assign(fields, later.fields); warnings.push(...later.warnings);
    }
  } else if (ids.size > 1) {
    fields.itemId = ''; fields.quantity = '';
    warnings.push('Please describe one item type at a time.');
  } else {
    fields.itemId = candidates[0].item.id;
    const quantities = candidates.map(candidate => itemText.slice(0, candidate.start).match(/\b(\d+(?:\.\d+)?|a|an)\s*(?:(?:kgs?|kilograms?|litres?|liters?|pieces?|pairs?|units?|boxes?|packets?|strips?|bottles?)\s*(?:of\s+)?)?(?:(?:new|used|unused|packed|sealed|clean)\s+)*$/i)?.[1]).filter(Boolean);
    const labelled = normalized.match(/\b(?:the\s+)?quantity(?:\s+is)?\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1];
    const afterItem = itemText.slice(candidates[0].end).match(/^\s*[, :\-]?\s*(\d+(?:\.\d+)?)\s*(?:kgs?|kilograms?|litres?|liters?|pieces?|pairs?|units?|boxes?|packets?|strips?|bottles?)\b/i)?.[1];
    const quantity = labelled || quantities[quantities.length - 1] || afterItem;
    if (quantity) {
      const value = /^(a|an)$/i.test(quantity) ? 1 : Number(quantity);
      fields.quantity = Number.isInteger(value) && value >= 1 && value <= 1000000 ? String(value) : '';
      if (!fields.quantity) warnings.push('Use a whole quantity between 1 and 1,000,000.');
    } else fields.quantity = '';
  }
  const pin = normalized.match(/\b(?:pin(?:\s*code)?|postal code)(?:\s+is)?\s*:?\s*((?:\d[ -]*){6})(?!\d)/i);
  if (pin) { const digits = pin[1].replace(/\D/g, ''); if (/^[1-9]\d{5}$/.test(digits)) fields.pincode = digits; }
  const state = normalized.match(new RegExp(`\\b(${states.map(escape).join('|')})\\b`, 'i'));
  if (state) fields.state = states.find(value => value.toLowerCase() === state[1].toLowerCase());
  let city = normalized.match(/\b(?:my\s+)?city(?:\s+is)?\s*:?\s*([a-z][a-z -]*?)(?=[,.!?]|\s+(?:state|pin|pickup|pick up|they|the quantity)\b|$)/i)
    || normalized.match(/\bin\s+([a-z][a-z -]*?)(?=[,.!?]|\s+(?:state|pin|pickup|pick up|they)\b|$)/i);
  if (!city && candidates.length === 1) {
    const candidate = candidates[0];
    const remainder = tidy(normalized.slice(candidate.end));
    const quantityLead = '(?:(?:the\\s+)?quantity(?:\\s+is)?\\s*:?\\s*)?\\d+(?:\\.\\d+)?\\s*(?:kgs?|kilograms?|litres?|liters?|pieces?|pairs?|units?)?\\s*(?:of\\s+)?';
    const match = trailingCities.find(name => new RegExp(`^(?:${quantityLead})?${escape(name)}$`, 'i').test(remainder));
    if (match) city = [remainder, match];
  }
  if (city && !/^(?:good|excellent|new|used|sealed|original|working)\b/i.test(city[1])) fields.city = tidy(city[1]);
  const pickup = normalized.match(/\b(?:pick\s*up (?:at|from)|pickup address(?: is)?|(?:my )?address is)\s*:?\s*(.+?)(?=\b(?:city|state|quantity|pin(?:\s*code)?|postal code|I want to donate|donate|they are|condition is|notes?)\b|$)/i);
  if (pickup) {
    let address = tidy(pickup[1]);
    address = normalizeSpokenAddress(address);
    if (fields.state) address = tidy(address.replace(new RegExp(`\\b${escape(fields.state)}\\b`, 'i'), ''));
    if (!fields.city) {
      const knownCity = trailingCities.find(name => new RegExp(`\\b${escape(name)}$`, 'i').test(address));
      if (knownCity) {
        fields.city = knownCity;
        address = tidy(address.slice(0, -knownCity.length));
      }
    }
    const parts = address.split(',').map(tidy).filter(Boolean);
    if (parts.length >= 2 && fields.state && !fields.city) fields.city = parts.pop();
    address = parts.join(', ');
    if (fields.city) address = tidy(address.replace(new RegExp(`(?:,\\s*|\\s+in\\s+)${escape(fields.city)}$`, 'i'), ''));
    if (address) fields.address = address;
  }
  const notes = normalized.match(/\b(?:they are|condition(?: is)?|notes?(?: is| are)?)[ :]+(.+?)(?=\b(?:city|state|quantity|pin(?:\s*code)?|postal code|pickup address)\b|$)/i);
  if (notes) fields.notes = tidy(notes[1]);
  const limits = {address:300,city:100,state:100,notes:2000};
  for (const [key, limit] of Object.entries(limits)) if (fields[key]?.length > limit) delete fields[key];
  return {text, fields, warnings};
}
