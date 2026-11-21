import { normalizeSpokenNumbers } from "./spokenNumbers.js";
export const amount = (value) => new Intl.NumberFormat("en-IN", {maximumFractionDigits: 2}).format(Number(value) || 0);
export function quantityLabel(quantity, unit) {
  const label = Number(quantity) === 1 || unit === "kg" ? unit : unit === "box" ? "boxes" : `${unit}s`;
  return `${amount(quantity)} ${label}`;
}
export function parseDonationSpeech(text, catalog) {
  const normalized = text.toLowerCase().replace(/\bback packs?\b/g, "backpack").replace(/\bnote books?\b/g, "notebook").replace(/\bt shirts?\b/g, "t-shirt");
  const escaped = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = catalog.filter((item) => new RegExp(`\\b${escaped(item.name.toLowerCase())}s?\\b`).test(normalized));
  // Prefer the longest item name so "school bag" does not become a different item.
  matches.sort((a, b) => b.name.length - a.name.length);
  const item = matches[0];
  const numbered = normalizeSpokenNumbers(normalized);
  const quantity = numbered.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kilograms?|litres?|liters?|pieces?|units?|pairs?|boxes?|packets?|strips?|bottles?)?\b/);
  const city = text.match(/\b(?:in|at|from)\s+([a-zA-Z][a-zA-Z -]{1,70})(?=[,.!?]|$)/i);
  return {...(item ? {itemId: item.id} : {}), ...(quantity ? {quantity: Number.isInteger(Number(quantity[1])) && Number(quantity[1]) > 0 ? String(Number(quantity[1])) : ""} : {}), ...(city ? {city: city[1].replace(/[. ]+$/, "").trim()} : {})};
}

// Only allow supported, bounded suggestions to reach controlled form fields.
// The model extracts each value in context; do not guess from the first number.
export function donationSpeechFields(result, catalog) {
  const raw = result?.fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const limits = {itemId:80,quantity:20,address:300,city:100,state:100,pincode:6,notes:2000};
  const fields = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof raw[key] !== 'string' || raw[key].length > limit) continue;
    const value = raw[key].trim();
    if (key === 'itemId' && value && !catalog.some(item=>item.id===value)) continue;
    if (key === 'quantity' && value && (!/^\d+$/.test(value) || Number(value)<1 || Number(value)>1000000)) continue;
    if (key === 'pincode' && value && !/^[1-9]\d{5}$/.test(value)) continue;
    fields[key] = value;
  }
  return fields;
}
export function localDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

export function openRequestItems(request, today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date())) {
  if (!request || request.status !== "Open" || (request.neededBy && request.neededBy < today)) return [];
  return request.items.filter((item) => Number(item.remaining ?? item.quantity) > 0);
}

export function requestDonationHref(requestId, itemId) {
  const params = new URLSearchParams({item: itemId, request: String(requestId)});
  return `/dashboard/donor/give?${params}`;
}

export function donationMatchesHref(donationId, requestId) {
  const params = new URLSearchParams({donation: String(donationId)});
  if (requestId) params.set("request", String(requestId));
  return `/dashboard/donor/matches?${params}`;
}

export function prioritizeRequestCandidates(candidates, requestId) {
  return [...candidates].sort((first, second) => Number(String(second.requestId) === String(requestId)) - Number(String(first.requestId) === String(requestId)));
}
