// backend/utils/sanitize.js

// 🛡️ For text that is placed INSIDE a PostgREST .or("...") filter string.
// In those strings , ( ) . : " \ * % have special meaning, so a user could
// inject extra conditions (e.g. probe hidden columns like mobile / email).
// Keep only letters (any language, incl. Tamil), digits, spaces and - ' .
export function safeFilterText(value, maxLen = 60) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s\-']/gu, '')
    .trim()
    .slice(0, maxLen);
}

// 🛡️ Only allow public https image links (blocks javascript:, data:, http:)
export function isHttpsUrl(value, maxLen = 2048) {
  if (typeof value !== 'string' || value.length > maxLen) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
