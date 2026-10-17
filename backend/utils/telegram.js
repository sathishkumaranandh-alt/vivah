// backend/utils/telegram.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

/**
 * Send Telegram message with Timeout and Retry Logic
 */
async function sendTelegramMessage(chatId, text, retries = 3) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing in env variables");
    return false;
  }
  if (!chatId) {
    console.error("❌ Telegram Chat ID is missing");
    return false;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 5 seconds timeout setup
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(TELEGRAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML', // Enable HTML formatting
          disable_web_page_preview: true // Prevents link previews from breaking layout
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId); // Clear timeout if request finishes

      const data = await response.json();

      if (data.ok) {
        console.log(`✅ Telegram message sent successfully to ${chatId}`);
        return true;
      } else {
        // If Telegram rejects the request (e.g., user blocked bot)
        console.error(`⚠️ Telegram API Error (Attempt ${attempt}):`, data.description);
        if (data.error_code === 403) return false; // Don't retry if user blocked bot
      }
    } catch (error) {
      // Handle Timeout or Network error
      if (error.name === 'AbortError') {
        console.error(`⏳ Telegram Timeout (Attempt ${attempt}/${retries}). Retrying...`);
      } else {
        console.error(`❌ Telegram Fetch Error (Attempt ${attempt}):`, error.message);
      }

      // Wait for 2 seconds before retrying
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error("🚨 Telegram message failed after max retries.");
        return false;
      }
    }
  }
  return false;
}

module.exports = { sendTelegramMessage };
