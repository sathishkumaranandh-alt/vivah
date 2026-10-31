// backend/utils/turnstile.js
// Cloudflare Turnstile verification. If TURNSTILE_SECRET_KEY is not set the
// check is skipped (so deploying this file never breaks signup).
export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) return true;
  if (!token || typeof token !== 'string' || token.length > 4096) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const j = await r.json();
    return j.success === true;
  } catch (e) {
    console.error('Turnstile verify error:', e.message);
    return false; // fail closed when enabled
  }
}
