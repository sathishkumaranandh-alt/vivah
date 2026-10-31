// backend/routes/cron.js
// Scheduled jobs. Called by an external scheduler (cron-job.org etc.) with the
// header:  x-cron-secret: <CRON_SECRET>
//   GET/POST /cron/daily-matches      → "N new matches" digest (once per user per day)
//   GET/POST /cron/unread-reminders   → unread chat reminder (once per user per day)
//   GET/POST /cron/admin-summary      → daily admin summary
//   GET/POST /cron/ping               → keep-alive only
import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sendTelegram } from '../utils/telegram.js';
import { escapeHtml, sleep, logOnce, notifyAdmins } from '../utils/notify.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.FRONTEND_URL || 'https://vivaha-frontend.vercel.app';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_USERS_PER_RUN = 2000;

function secretOk(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) return false; // not configured → locked
  const given = String(req.headers['x-cron-secret'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function ageFromDob(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * DAY_MS));
}

async function linkedUsers() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, gender, community, telegram_chat_id, pref_age_min, pref_age_max, pref_community')
    .eq('telegram_opt_in', true)
    .not('telegram_chat_id', 'is', null)
    .eq('is_suspended', false)
    .limit(MAX_USERS_PER_RUN);
  if (error) throw error;
  return data || [];
}

// ---------- JOB 1: daily matches digest ----------
async function dailyMatches() {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data: fresh, error } = await supabaseAdmin
    .from('users')
    .select('id, gender, dob, age, community')
    .gte('created_at', since)
    .eq('is_suspended', false)
    .limit(1000);
  if (error) throw error;
  const newcomers = fresh || [];
  if (newcomers.length === 0) return { sent: 0, note: 'no new profiles' };

  const users = await linkedUsers();
  let sent = 0;
  for (const u of users) {
    const opposite = String(u.gender || '').toLowerCase() === 'male' ? 'female' : 'male';
    const count = newcomers.filter((n) => {
      if (n.id === u.id) return false;
      if (String(n.gender || '').toLowerCase() !== opposite) return false;
      const age = n.age && n.age > 0 ? n.age : ageFromDob(n.dob);
      if (u.pref_age_min && age && age < u.pref_age_min) return false;
      if (u.pref_age_max && age && age > u.pref_age_max) return false;
      if (u.pref_community && n.community && n.community !== u.pref_community) return false;
      return true;
    }).length;
    if (count === 0) continue;
    if (!(await logOnce(u.id, 'daily_matches'))) continue;
    const ok = await sendTelegram(
      u.telegram_chat_id,
      `💕 <b>${count} new ${count === 1 ? 'match' : 'matches'} today!</b>\n\nHi ${escapeHtml(u.name || 'there')}, ${count} new ${count === 1 ? 'profile fits' : 'profiles fit'} your preferences.\n\nView now → ${SITE_URL}/discover`,
      1
    );
    if (ok) sent++;
    await sleep(60); // stay under Telegram rate limits
  }
  return { sent, newcomers: newcomers.length };
}

// ---------- JOB 2: unread message reminders ----------
async function unreadReminders() {
  const olderThan = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // unread > 2h
  const { data: unread, error } = await supabaseAdmin
    .from('messages')
    .select('receiver_id')
    .eq('is_read', false)
    .lte('timestamp', olderThan)
    .gte('timestamp', new Date(Date.now() - 3 * DAY_MS).toISOString())
    .limit(5000);
  if (error) throw error;

  const counts = {};
  (unread || []).forEach((m) => { counts[m.receiver_id] = (counts[m.receiver_id] || 0) + 1; });
  const ids = Object.keys(counts);
  if (ids.length === 0) return { sent: 0 };

  const { data: receivers } = await supabaseAdmin
    .from('users')
    .select('id, name, telegram_chat_id')
    .in('id', ids.slice(0, MAX_USERS_PER_RUN))
    .eq('telegram_opt_in', true)
    .not('telegram_chat_id', 'is', null);

  let sent = 0;
  for (const r of receivers || []) {
    if (!(await logOnce(r.id, 'unread_reminder'))) continue;
    const n = counts[r.id];
    const ok = await sendTelegram(
      r.telegram_chat_id,
      `💬 <b>${n} unread ${n === 1 ? 'message' : 'messages'}</b>\n\nSomeone is waiting for your reply on Vivaha.\n\nOpen chat → ${SITE_URL}/messages`,
      1
    );
    if (ok) sent++;
    await sleep(60);
  }
  return { sent };
}

// ---------- JOB 3: admin daily summary ----------
async function adminSummary() {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const countOf = async (table, col, extra) => {
    let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).gte(col, since);
    if (extra) q = extra(q);
    const { count } = await q;
    return count || 0;
  };
  const [newUsers, newSubs, newReports, pendingReports] = await Promise.all([
    countOf('users', 'created_at'),
    countOf('subscriptions', 'created_at'),
    countOf('reports', 'created_at'),
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => r.count || 0),
  ]);
  await notifyAdmins(
    `📊 <b>Vivaha daily summary</b>\n\n👤 New users: <b>${newUsers}</b>\n💳 New plan purchases: <b>${newSubs}</b>\n🚩 New reports: <b>${newReports}</b> (pending total: <b>${pendingReports}</b>)`
  );
  return { newUsers, newSubs, newReports, pendingReports };
}

const JOBS = {
  'daily-matches': dailyMatches,
  'unread-reminders': unreadReminders,
  'admin-summary': adminSummary,
  ping: async () => ({ ok: true }),
};

async function handle(req, res) {
  if (!secretOk(req)) return res.status(401).json({ error: 'Unauthorized' });
  const job = JOBS[req.params.job];
  if (!job) return res.status(404).json({ error: 'Unknown job' });

  if (req.params.job === 'ping') return res.json({ ok: true });

  // Respond immediately (cron services time out quickly); the job continues in background.
  res.status(202).json({ accepted: true, job: req.params.job });
  try {
    const result = await job();
    console.log(`cron ${req.params.job} done:`, JSON.stringify(result));
  } catch (err) {
    console.error(`cron ${req.params.job} failed:`, err);
  }
}

router.get('/:job', handle);
router.post('/:job', handle);

export default router;
