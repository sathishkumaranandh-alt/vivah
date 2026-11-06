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
  

// 🛡️ A photo link must point to OUR OWN storage bucket and to a file named after the user
// (uploads are saved as "<userId>-<time>-<random>.<ext>"). Blocks tracking pixels / external
// images and stops a user from pointing at someone else's photo.
export function isOwnPhotoUrl(value, userId) {
  if (!isHttpsUrl(value) || !userId) return false;
  try {
    const own = new URL(process.env.SUPABASE_URL);
    const u = new URL(value);
    if (u.host !== own.host) return false;
    return u.pathname.startsWith(`/storage/v1/object/public/avatars/${userId}-`);
  } catch {
    return false;
  }
}
