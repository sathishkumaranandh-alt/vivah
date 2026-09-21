import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// GET /messages/unread/:userId
// Get count of unread messages for a user
// ⚠️ MUST be before /:userId style routes
// ============================================================
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
    console.error("Unread count error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /messages/mark-read/:userId/:partnerId
// Mark all messages from partnerId to userId as read
// ============================================================
router.patch("/mark-read/:userId/:partnerId", async (req, res) => {
  try {
    const { userId, partnerId } = req.params;

    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("receiver_id", userId)
      .eq("sender_id", partnerId)
      .eq("is_read", false);

    if (error) throw error;

    res.json({ message: "Marked as read" });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /messages/conversations/:userId
// List all conversations with unread counts
// ============================================================
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false });

    if (error) throw error;

    const conversationMap = new Map();
    for (const msg of messages) {
      const otherId =
        msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          otherUserId: otherId,
          lastMessage: msg.text,
          timestamp: msg.timestamp,
          unread: 0,
        });
      }
      // Count unread messages from this sender
      if (msg.receiver_id === userId && msg.is_read === false) {
        const conv = conversationMap.get(otherId);
        conv.unread = (conv.unread || 0) + 1;
      }
    }

    const otherIds = Array.from(conversationMap.keys());
    let profiles = [];
    if (otherIds.length > 0) {
      const { data: profileData } = await supabase
        .from("users")
        .select("id, name, photo_url, age, location")
        .in("id", otherIds);
      profiles = profileData || [];
    }

    const conversations = Array.from(conversationMap.values()).map((conv) => {
      const profile = profiles.find((p) => p.id === conv.otherUserId);
      return {
        ...conv,
        name: profile?.name || "Anonymous",
        photo_url: profile?.photo_url || null,
        age: profile?.age || null,
        location: profile?.location || null,
      };
    });

    res.json({ conversations });
  } catch (err) {
    console.error("Conversations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /messages/chat/:user1/:user2
// Get all messages between two users
// Also auto-marks messages as read
// ============================================================
router.get("/chat/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`
      )
      .order("timestamp", { ascending: true });

    if (error) throw error;

    res.json({ messages: data || [] });
  } catch (err) {
    console.error("Chat fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /messages/send
// Send a new message (defaults to unread)
// ============================================================
router.post("/send", async (req, res) => {
  try {
    const { sender_id, receiver_id, text } = req.body;

    if (!sender_id || !receiver_id || !text || !text.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          sender_id,
          receiver_id,
          text: text.trim(),
          timestamp: new Date().toISOString(),
          is_read: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Message sent", data });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;