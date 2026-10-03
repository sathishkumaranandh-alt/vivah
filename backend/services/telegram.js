import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js'; // Adjust path if needed

const router = express.Router();

// Telegram Webhook Endpoint
router.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text;

    // Handle /start command with a linking code
    if (text.startsWith('/start ')) {
      const linkCode = text.split(' ')[1]; // e.g., "a1b2c3d4"

      // Find user with this link code
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('telegram_link_code', linkCode)
        .single();

      if (error || !user) {
        // Send error message back via Telegram API directly or use your utility
        return res.sendStatus(200); 
      }

      // Save the chat_id and clear the link code
      await supabaseAdmin
        .from('users')
        .update({ 
            telegram_chat_id: chatId, 
            telegram_link_code: null 
        })
        .eq('id', user.id);

      // Optional: Send a success message to the user via your utility
      // await sendTelegram(chatId, `✅ Successfully linked to your Vivaha account, ${user.name}!`);
    }

    res.sendStatus(200); // Always return 200 to Telegram so it doesn't retry
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.sendStatus(200); // Still return 200 to prevent Telegram retry loops
  }
});

export default router;
