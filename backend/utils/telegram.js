import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Helper for delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 🛡️ Safe logger
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set');
} else if (process.env.NODE_ENV === 'development') {
  console.log('✅ TELEGRAM_BOT_TOKEN loaded');
}

export async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN || !chatId) return null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        { timeout: 10000 }
      );
      return res.data; // Success
    } catch (err) {
      console.warn(`⚠️ Telegram attempt ${attempt} failed:`, err.message);
      
      if (attempt === MAX_RETRIES) {
        console.error('❌ Telegram send failed after max retries');
        return null;
      }
      // Wait 1s, then 2s, then 3s before retrying
      await sleep(RETRY_DELAY * attempt); 
    }
  }
}

export async function sendTelegramWithButtons(chatId, text, buttons) {
  if (!BOT_TOKEN || !chatId) return null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        },
        { timeout: 10000 }
      );
      return res.data;
    } catch (err) {
      console.warn(`⚠️ Telegram (Buttons) attempt ${attempt} failed:`, err.message);
      
      if (attempt === MAX_RETRIES) {
        console.error('❌ Telegram (Buttons) send failed after max retries');
        return null;
      }
      await sleep(RETRY_DELAY * attempt);
    }
  }
          }
