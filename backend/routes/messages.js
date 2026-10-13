import express from "express";
import supabase from "../supabaseClient.js";
import { sendTelegram } from '../utils/telegram.js';

const router = express.Router();

// ============================================
// HELPERS
// ============================================
async function areConnected(user1, user2) {
  const { data, error } = await supabase
    .from("interests")
    .select("id, status")
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

function isUserOnline(lastSeenIso) {
  if (!lastSeenIso) return false;
  const lastSeen = new Date(lastSeenIso).getTime();
  return Date.now() - lastSeen < 90 * 1000; // 90 seconds
}

// ============================================
// 1. GET /messages/unread/:userId
// ============================================
router.get("/unread/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("is_read", false);
    if (error) throw error;
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. PATCH /messages/mark-read/:userId/:partnerId
//    Set is_read = true + read_at = now
// ============================================
router.patch("/mark-read/:userId/:partnerId", async (req, res) => {
  try {
    const { userId, partnerId } = req.params;
    const { error } = await supabase
      .from("messages")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("receiver_id", userId)
      .eq("sender_id", partnerId)
      .eq("is_read", false);
    if (error) throw error;
    res.json({ message: "Marked as read", readAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. GET /messages/conversations/:userId
//    Includes: unreadCount, isOnline, lastSeen
// ============================================
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Get accepted interests
    const { data: connections } = await supabase
      .from("interests")
      .select("sender_id, receiver_id")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    const connectedIds = new Set();
    (connections || []).forEach((c) => {
      connectedIds.add(c.sender_id === userId ? c.receiver_id : c.sender_id);
    });

    // Get all messages
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false });
    if (error) throw error;

    const conversationMap = new Map();
    for (const msg of messages) {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!connectedIds.has(otherId)) continue;
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          otherUserId: otherId,
          lastMessage: msg.image_url ? "📷 Photo" : msg.text,
          timestamp: msg.timestamp,
          unreadCount: 0,
          lastMessageRead: msg.is_read,
        });
      }
      if (msg.receiver_id === userId && msg.is_read === false) {
        conversationMap.get(otherId).unreadCount += 1;
      }
    }

    // Add "no messages yet" conversations
    connectedIds.forEach((otherId) => {
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          otherUserId: otherId,
          lastMessage: "Say hi to start the conversation!",
          timestamp: null,
          unreadCount: 0,
          lastMessageRead: true,
        });
      }
    });

    // Fetch profiles (with last_seen for online status)
    const otherIds = Array.from(conversationMap.keys());
    let profiles = [];
    if (otherIds.length > 0) {
      const { data: profileData } = await supabase
        .from("users")
        .select("id, name, photo_url, age, location, last_seen")
        .in("id", otherIds);
      profiles = profileData || [];
    }

    const conversations = Array.from(conversationMap.values()).map((conv) => {
      const profile = profiles.find((p) => p.id === conv.otherUserId);
      const isOnline = isUserOnline(profile?.last_seen);
      return {
        ...conv,
        name: profile?.name || "Anonymous",
        photo_url: profile?.photo_url || null,
        age: profile?.age || null,
        location: profile?.location || null,
        isOnline,
        lastSeen: profile?.last_seen || null,
      };
    });

    // Sort: online first, then by timestamp desc
    conversations.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. GET /messages/chat/:user1/:user2
//    Also returns partner's last_seen for online status
// ============================================
router.get("/chat/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .order("timestamp", { ascending: true });
    if (error) throw error;

    // Get partner's online status
    const { data: partner } = await supabase
      .from("users")
      .select("last_seen")
      .eq("id", user2)
      .maybeSingle();

    const isOnline = isUserOnline(partner?.last_seen);

    res.json({
      messages: data || [],
      partnerOnline: isOnline,
      partnerLastSeen: partner?.last_seen || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 5. POST /messages/send
//    Supports: text, image_url, message_type
// ============================================
router.post("/send", async (req, res) => {
  try {
    const { sender_id, receiver_id, text, image_url, message_type } = req.body;

    if (!sender_id || !receiver_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }
    // Must have either text or image
    if ((!text || !text.trim()) && !image_url) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const connected = await areConnected(sender_id, receiver_id);
    if (!connected) {
      return res.status(403).json({
        error: "You can only message users you are connected with.",
        code: "NOT_CONNECTED",
      });
    }

    const messageType = message_type || (image_url ? "image" : "text");

    const { data, error } = await supabase
      .from("messages")
      .insert([{
        sender_id,
        receiver_id,
        text: text ? text.trim() : "",
        image_url: image_url || null,
        message_type: messageType,
        timestamp: new Date().toISOString(),
        is_read: false,
        read_at: null,
      }])
      .select()
      .single();
    if (error) throw error;

    // ⭐ Notify receiver (in-app)
    try {
      const { data: sender } = await supabase
        .from("users")
        .select("name")
        .eq("id", sender_id)
        .single();

      await supabase.from("notifications").insert([{
        user_id: receiver_id,
        actor_id: sender_id,
        type: "message_received",
        title: "New Message 💬",
        body: image_url
          ? `${sender?.name || "Someone"} sent a photo`
          : `${sender?.name || "Someone"}: ${text.trim().slice(0, 60)}`,
        link: `/messages?to=${sender_id}`,
      }]);
    } catch (e) {
      console.error("Notify error:", e);
    }

    // ⭐ Notify receiver via Telegram
    try {
      const { data: receiver } = await supabase
        .from("users")
        .select("telegram_chat_id, telegram_opt_in")
        .eq("id", receiver_id)
        .single();

      const { data: senderInfo } = await supabase
        .from("users")
        .select("name")
        .eq("id", sender_id)
        .single();

      if (receiver?.telegram_opt_in && receiver?.telegram_chat_id) {
        await sendTelegram(
          receiver.telegram_chat_id,
          `💬 <b>New Message</b>\n\nFrom: <b>${senderInfo?.name || "Someone"}</b>\n\nTap to open Vivaha →`
        );
      }
    } catch (e) {
      console.error("Telegram notify error:", e);
    }

    res.status(201).json({ message: "Message sent", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 6. POST /messages/typing
//    Body: { user_id, typing_to }
//    Sets typing status — expires after 5 sec
// ============================================
router.post("/typing", async (req, res) => {
  try {
    const { user_id, typing_to } = req.body;
    if (!user_id || !typing_to) {
      return res.status(400).json({ error: "Missing user_id or typing_to" });
    }

    await supabase.from("typing_status").upsert({
      user_id,
      typing_to,
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 7. GET /messages/typing-status/:partnerId
//    Check if partner is typing to me
// ============================================
router.get("/typing-status/:partnerId/:userId", async (req, res) => {
  try {
    const { partnerId, userId } = req.params;

    const { data } = await supabase
      .from("typing_status")
      .select("updated_at")
      .eq("user_id", partnerId)
      .eq("typing_to", userId)
      .maybeSingle();

    if (!data || !data.updated_at) {
      return res.json({ isTyping: false });
    }

    const lastUpdate = new Date(data.updated_at).getTime();
    const isTyping = Date.now() - lastUpdate < 5000; // 5 sec

    res.json({ isTyping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 8. POST /messages/heartbeat
//    Body: { user_id }
//    Updates last_seen — call every 60 seconds
// ============================================
router.post("/heartbeat", async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    await supabase
      .from("users")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", user_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 9. DELETE /messages/chat/:user1/:user2
//    Clear all messages between two users
// ============================================
router.delete("/chat/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const { error } = await supabase
      .from("messages")
      .delete()
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`);

    if (error) throw error;
    res.json({ success: true, message: "Chat cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
