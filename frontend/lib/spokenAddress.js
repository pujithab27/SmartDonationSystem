import { normalizeSpokenNumbers } from './spokenNumbers.js';

// Keep house-number separators consistent in both field and full-form dictation.
export function normalizeSpokenAddress(text) {
  return normalizeSpokenNumbers(text)
    .replace(/\b(\d+[a-z]?|[a-z])\s+(?:dash|hyphen|minus)\s+(?=\d|[a-z]\b)/gi, '$1-')
    .replace(/\b(\d+[a-z]?|[a-z])\s+(?:forward slash|slash|by|as)\s+(?=\d|[a-z]\b)/gi, '$1/')
    .replace(/\b(\d+[a-z]?|[a-z])\s*([-\/])\s*(?=\d|[a-z]\b)/gi, '$1$2')
    .replace(/\b([a-z])(?=[-\/]\d)/gi, letter => letter.toUpperCase());
}
