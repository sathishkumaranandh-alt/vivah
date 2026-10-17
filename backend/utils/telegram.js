// backend/utils/telegram.js
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

// Ungha project la 'sendTelegram' nu import panranga, so adhe name la export panrom
export const sendTelegram = async (chatId, text, retries = 3) => {
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
      // 5 seconds timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(TELEGRAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (data.ok) {
        console.log(`✅ Telegram message sent to ${chatId}`);
        return true;
      } else {
        console.error(`⚠️ Telegram API Error (Attempt ${attempt}):`, data.description);
        // User bot-a block pannirundha, retry panna vendaam
        if (data.error_code === 403) return false; 
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`⏳ Telegram Timeout (Attempt ${attempt}/${retries}). Retrying...`);
      } else {
        console.error(`❌ Telegram Fetch Error (Attempt ${attempt}):`, error.message);
      }

      // Retry-ku munnadi 2 seconds wait panrom
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error("🚨 Telegram message failed after max retries.");
        return false;
      }
    }
  }
  return false;
};
