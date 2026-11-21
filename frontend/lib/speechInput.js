import { normalizeSpokenNumbers } from './spokenNumbers.js';
import { normalizeSpokenAddress } from './spokenAddress.js';
export { beginDictation, speechSupported } from './geminiSpeech.js';

export function dictationValue(text, { type = "text", inputMode, maxLength, step, min, max, name } = {}) {
  let value = text.trim().replace(/[.!?]+$/, "");
  if (name === 'pincode') value = value.replace(/^(?:(?:my|the)\s+)?(?:pin\s*(?:code)?|postal code)(?:\s+is)?\s*:?\s*/i, '');
  if (name === 'city' || name === 'state') value = value.replace(new RegExp(`^(?:(?:my|the)\\s+)?${name}(?:\\s+is)?\\s*:?\\s*`, 'i'), '');
  const numericQuantity = type === "number" || name === "quantity";
  if (name === "address" || name === "deliveryAddress") {
    value = normalizeSpokenAddress(value);
  }
  if (type === "email" || type === "url") value = value.toLowerCase().replace(/\s+at\s+/gi, "@").replace(/\s+dot\s+/gi, ".").replace(/\s+/g, "");
  if (type === "number" || type === "tel" || inputMode === "numeric") {
    const digits = {zero:"0", oh:"0", one:"1", two:"2", three:"3", four:"4", five:"5", six:"6", seven:"7", eight:"8", nine:"9"};
    value = value.toLowerCase();
    if (numericQuantity) {
      value = value.replace(/^(?:(?:the\s+)?quantity(?:\s+is)?\s*:?\s*)/i, "");
      value = normalizeSpokenNumbers(value.replace(/\ba dozen\b/g, '12'));
      value = value.replace(/^(\d+) dozen\b/, (_, count) => String(Number(count) * 12));
      value = value.replace(/\s*(?:kgs?|kilograms?|litres?|liters?|pieces?|units?|pairs?|boxes?|packets?|strips?|bottles?)$/i, "").trim();
    }
    value = value.replace(/\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, word => digits[word]).replace(/\b(?:point|dot)\b/g, ".").replace(/\bplus\b/g, "+");
    if (type !== "number" && (type === "tel" || inputMode === "numeric")) value = value.replace(/[\s-]/g, "");
    else value = value.replace(/\s*\.\s*/g, ".");
    const validNumber = type === "tel" ? /^\+?\d+$/ : inputMode === "numeric" ? /^\d+$/ : /^\d+(?:\.\d+)?$/;
    if (!validNumber.test(value)) throw new Error("Please say the number clearly, or type it. The field was not changed.");
    if (numericQuantity && String(step) === "1") {
      if (!Number.isInteger(Number(value))) throw new Error("Use a whole number such as 3 or 4, without decimals. The field was not changed.");
      value = String(Number(value));
    }
    if (numericQuantity && ((min !== undefined && Number(value) < Number(min)) || (max !== undefined && Number(value) > Number(max)))) {
      throw new Error('That quantity is outside the allowed range. The field was not changed.');
    }
  }
  if (maxLength > 0 && value.length > maxLength) throw new Error(`That is too long for this field (maximum ${maxLength} characters). Please try a shorter value.`);
  return value;
}
