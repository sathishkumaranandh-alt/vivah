// backend/utils/maintenance.js
// Admin "Maintenance Mode" and "Allow New Registrations" switches (Admin → Settings → Site → System).
//  - maintenance_mode = "true"   → everybody except admins gets a 503 "under maintenance" answer
//  - allow_registration = "false" → /auth/signup is refused
// Settings are cached for 10 seconds, so a change takes effect almost instantly without hammering the DB.
// If anything goes wrong while reading settings, the site stays OPEN (fail open) — a bug here must never lock everyone out.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const FLAGS_TTL_MS = 10 * 1000;
let flags = { at: 0, maintenance: false, allowRegistration: true, message: '' };

async function loadFlags() {
  if (Date.now() - flags.at < FLAGS_TTL_MS) return flags;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('key, value')
    .in('key', ['maintenance_mode', 'allow_registration', 'maintenance_message']);
  if (error) throw error;
  const m = {};
  (data || []).forEach((r) => { m[r.key] = r.value; });
  flags = {
    at: Date.now(),
    maintenance: String(m.maintenance_mode) === 'true',
    allowRegistration: String(m.allow_registration) !== 'false',
    message: typeof m.maintenance_message === 'string' ? m.maintenance_message.slice(0, 300) : '',
  };
  return flags;
}

export async function registrationAllowed() {
  try { return (await loadFlags()).allowRegistration; } catch { return true; }
}

// token → { admin, at } (60 s) so admin polling does not hit Supabase on every request
const adminCache = new Map();
const ADMIN_TTL_MS = 60 * 1000;

async function isAdminToken(token) {
  const hit = adminCache.get(token);
  if (hit && Date.now() - hit.at < ADMIN_TTL_MS) return hit.admin;
  let admin = false;
  try {
    const { data: auth } = await supabaseAdmin.auth.getUser(token);
    const uid = auth?.user?.id;
    if (uid) {
      const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', uid).maybeSingle();
      admin = u?.role === 'admin';
    }
  } catch { admin = false; }
  if (adminCache.size > 200) adminCache.delete(adminCache.keys().next().value);
  adminCache.set(token, { admin, at: Date.now() });
  return admin;
}

// Paths that must keep working during maintenance (payments/Telegram callbacks, health check, public settings)
function isExempt(req) {
  const p = req.path;
  return (
    req.method === 'OPTIONS' ||
    p === '/' || p === '/health' || p === '/settings' ||
    p.startsWith('/cron') ||
    p === '/payments/webhook' || p === '/telegram/webhook'
  );
}

export async function maintenanceGate(req, res, next) {
  try {
    if (isExempt(req)) return next();
    const f = await loadFlags();
    if (!f.maintenance) return next();

    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ') && (await isAdminToken(h.slice(7)))) return next();

    return res.status(503).json({
      error: 'maintenance',
      message: f.message || 'We are doing some maintenance. Please check back soon.',
    });
  } catch (e) {
    console.error('maintenanceGate error (site stays open):', e.message);
    return next();
  }
}
