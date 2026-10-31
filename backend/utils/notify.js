// backend/utils/notify.js
// Shared helpers for scheduled / admin notifications.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sendTelegram } from './telegram.js';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const escapeHtml = (str) =>
  String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns true only the FIRST time (user, kind, today) is logged.
// Prevents duplicate / spammy notifications even if a cron job runs twice.
export async function logOnce(userId, kind) {
  const { error } = await supabaseAdmin
    .from('notification_log')
    .insert([{ user_id: userId, kind }]);
  if (!error) return true;
  if (error.code === '23505') return false; // already sent today
  console.error('notification_log error:', error.message);
  return false; // fail closed: better to skip than to spam
}

// Telegram alert to every admin who linked Telegram (best effort, never throws).
export async function notifyAdmins(text) {
  try {
    const { data: admins } = await supabaseAdmin
      .from('users')
      .select('telegram_chat_id')
      .eq('role', 'admin')
      .not('telegram_chat_id', 'is', null);
    for (const a of admins || []) {
      await sendTelegram(a.telegram_chat_id, text, 1).catch(() => null);
    }
  } catch (e) {
    console.error('notifyAdmins error:', e.message);
  }
}

// In-app notification (bell) — best effort.
export async function inAppNotify(userId, { type, title, body, link }) {
  try {
    await supabaseAdmin.from('notifications').insert([{ user_id: userId, type, title, body, link: link || null }]);
  } catch (e) {
    console.error('inAppNotify error:', e.message);
  }
}
