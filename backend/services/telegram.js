import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return null;
  }
  if (!chatId) return null;

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { timeout: 10000 }
    );
    return res.data;
  } catch (err) {
    console.error("Telegram send error:", err.response?.data || err.message);
    return null;
  }
}

export async function sendTelegramWithButtons(chatId, text, buttons) {
  if (!BOT_TOKEN || !chatId) return null;
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      },
      { timeout: 10000 }
    );
    return res.data;
  } catch (err) {
    console.error("Telegram send error:", err.response?.data || err.message);
    return null;
  }
}
