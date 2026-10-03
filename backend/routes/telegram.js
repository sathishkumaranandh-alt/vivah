import express from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ============================================
// LINK user's Telegram account
// POST /telegram/link
// Body: { userId, chatId }
// ============================================
router.post('/link', async (req, res) => {
  const { userId, chatId } = req.body;
  if (!userId || !chatId) return res.status(400).json({ error: "Missing userId or chatId" });

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ telegram_chat_id: String(chatId), telegram_opt_in: true })
      .eq('id', userId);
    if (error) throw error;
    res.json({ success: true, message: "Telegram linked" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// UNLINK Telegram
// POST /telegram/unlink
// Body: { userId }
// ============================================
router.post('/unlink', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
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
// WEBHOOK — Telegram calls this URL when user sends /start, /stop, /help
// POST /telegram/webhook
// ============================================
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const message = update.message;
    if (!message) return res.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || "").trim();

    // ---- /start [USER_ID] ----
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const userId = parts[1];

      if (userId) {
        // Auto-link the user
        await supabaseAdmin
          .from('users')
          .update({ telegram_chat_id: String(chatId), telegram_opt_in: true })
          .eq('id', userId);
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text:
          `💍 <b>Welcome to Vivaha Matrimony Alerts!</b>\n\n` +
          `You'll receive updates about:\n` +
          `• 💌 New interests\n` +
          `• 💬 New messages\n` +
          `• 👀 Profile views\n` +
          `• ✅ Match approvals\n` +
          `• ⭐ Subscription alerts\n\n` +
          `Send /stop to pause, /help for commands.`,
        parse_mode: "HTML",
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
        text: "🔕 Notifications paused. Send /start to resume.",
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
        parse_mode: "HTML",
      });
      return res.json({ ok: true });
    }

    // Default: acknowledge
    res.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    res.json({ ok: true });
  }
});

export default router;
