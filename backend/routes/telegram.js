import express from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto'; // 🛡️ Added for secure tokens
import { requireAuth } from '../utils/auth.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// ============================================
// 🛡️ NEW: GENERATE SECURE LINK TOKEN
// ============================================
router.post('/generate-token', requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: Use crypto.randomInt instead of Math.random()
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // Valid for 15 mins

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('custom_permissions')
      .eq('id', req.userId)
      .single();

    if (fetchError) throw fetchError;

    // Store token inside custom_permissions JSON
    const currentPerms = user?.custom_permissions || {};
    const newPerms = {
      ...currentPerms,
      telegram_link_token: token,
      telegram_token_expires: expiresAt
    };

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ custom_permissions: newPerms })
      .eq('id', req.userId);

    if (updateError) throw updateError;

    res.json({ 
      success: true, 
      token, 
      message: `Send /start ${token} to the Telegram bot to link your account.` 
    });
  } catch (err) {
    console.error("Generate token error:", err);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// ============================================
// 🔒 MANUAL LINK / UNLINK (Now Requires Auth)
// ============================================
router.post('/link', requireAuth, async (req, res) => {
  const { chatId } = req.body;
  const userId = req.userId; // 🔒 From JWT

  if (!chatId) return res.status(400).json({ error: 'Missing chatId' });

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ telegram_chat_id: String(chatId), telegram_opt_in: true })
      .eq('id', userId);
    if (error) throw error;
    res.json({ success: true, message: 'Telegram linked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unlink', requireAuth, async (req, res) => {
  const userId = req.userId; // 🔒 From JWT

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ telegram_chat_id: null, telegram_opt_in: false })
      .eq('id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 🔒 WEBHOOK — Verify secret from Telegram
// ============================================
router.post('/webhook', async (req, res) => {
  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

    if (!WEBHOOK_SECRET) {
      console.error('❌ TELEGRAM_WEBHOOK_SECRET not set in env');
      return res.sendStatus(500);
    }

    if (secretHeader !== WEBHOOK_SECRET) {
      console.warn('🚫 Webhook unauthorized:', secretHeader);
      return res.sendStatus(403);
    }

    const update = req.body;
    const message = update.message;
    if (!message) return res.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || '').trim();

    // ---- /start [SECURE_TOKEN] ----
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const token = parts[1];

      if (!token) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `💍 <b>Welcome to Vivaha Matrimony Alerts!</b>\n\nTo link your account, please generate a secure code from your profile settings on the website.`,
          parse_mode: 'HTML',
        });
        return res.json({ ok: true });
      }

      // 🔒 Find user by token using Supabase JSON query
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, custom_permissions')
        .eq('custom_permissions->>telegram_link_token', token);

      if (error || !users || users.length === 0) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ Invalid or expired link code. Please generate a new one on the website.`,
        });
        return res.json({ ok: true });
      }

      const user = users[0];
      const expires = user.custom_permissions?.telegram_token_expires || 0;

      if (Date.now() > expires) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ This link code has expired. Please generate a new one on the website.`,
        });
        return res.json({ ok: true });
      }

      // 🔒 Valid token! Link the account.
      const newPerms = { ...user.custom_permissions };
      delete newPerms.telegram_link_token;
      delete newPerms.telegram_token_expires;

      await supabaseAdmin
        .from('users')
        .update({ 
          telegram_chat_id: String(chatId), 
          telegram_opt_in: true,
          custom_permissions: newPerms // Clean up token
        })
        .eq('id', user.id);

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text:
          `✅ <b>Account Linked Successfully!</b>\n\n` +
          `You'll receive updates about:\n` +
          `• 💌 New interests\n` +
          `• 💬 New messages\n` +
          `• 👀 Profile views\n` +
          `• ✅ Match approvals\n\n` +
          `Send /stop to pause, /help for commands.`,
        parse_mode: 'HTML',
      });
      return res.json({ ok: true });
    }

    // ---- /stop ----
    if (text.startsWith('/stop')) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('telegram_chat_id', String(chatId))
        .single();

      if (user) {
        await supabaseAdmin
          .from('users')
          .update({ telegram_opt_in: false })
          .eq('id', user.id);
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: '🔕 Notifications paused. Send /start to resume.',
      });
      return res.json({ ok: true });
    }

    // ---- /help ----
    if (text.startsWith('/help')) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text:
          `📖 <b>Available Commands:</b>\n\n` +
          `/start — Enable notifications\n` +
          `/stop — Disable notifications\n` +
          `/help — Show this menu`,
        parse_mode: 'HTML',
      });
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.json({ ok: true });
  }
});

export default router;
