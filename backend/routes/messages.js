import express from "express";
import supabase from "../supabaseClient.js";
import { sendTelegram } from '../utils/telegram.js';
import { requireAuth } from "../utils/auth.js";

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

async function isBlockedBetween(user1, user2) {
  try {
    const { data, error } = await supabase
      .from("blocked_users")
      .select("blocker_id")
      .or(
        `and(blocker_id.eq.${user1},blocked_id.eq.${user2}),and(blocker_id.eq.${user2},blocked_id.eq.${user1})`
      )
      .limit(1);
    if (error) return { blocked: false, blockerId: null };
    return {
      blocked: (data || []).length > 0,
      blockerId: data?.[0]?.blocker_id || null,
    };
  } catch {
    return { blocked: false, blockerId: null };
  }
}

function isUserOnline(lastSeenIso) {
  if (!lastSeenIso) return false;
  const lastSeen = new Date(lastSeenIso).getTime();
  return Date.now() - lastSeen < 90 * 1000;
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
// ============================================
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: connections } = await supabase
      .from("interests")
      .select("sender_id, receiver_id")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    const connectedIds = new Set();
    (connections || []).forEach((c) => {
      connectedIds.add(c.sender_id === userId ? c.receiver_id : c.sender_id);
    });

    // ⭐ Exclude blocked users
    const { data: blocks } = await supabase
      .from("blocked_users")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    const blockedIds = new Set();
    (blocks || []).forEach((b) => {
      blockedIds.add(b.blocker_id === userId ? b.blocked_id : b.blocker_id);
    });

    connectedIds.forEach((id) => {
      if (blockedIds.has(id)) connectedIds.delete(id);
    });

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
// 5. 🔒 POST /messages/send
// Uses req.userId from verified JWT
// ============================================
router.post("/send", requireAuth, async (req, res) => {
  try {
    const { receiver_id, text, image_url, message_type } = req.body;
    const sender_id = req.userId; // 🔒 From verified token

    if (!sender_id || !receiver_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }
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

    // ⭐ Block check
    const blockCheck = await isBlockedBetween(sender_id, receiver_id);
    if (blockCheck.blocked) {
      return res.status(403).json({
        error: "You cannot send messages to this user. Connection blocked.",
        code: "BLOCKED",
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

    // In-app notification
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

    // Telegram notification
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
// 7. GET /messages/typing-status/:partnerId/:userId
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
    const isTyping = Date.now() - lastUpdate < 5000;

    res.json({ isTyping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 8. 🔒 POST /messages/heartbeat
// Uses req.userId from verified JWT
// ============================================
router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    const user_id = req.userId; // 🔒 From token
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
