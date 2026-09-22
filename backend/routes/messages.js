import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

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

// GET /messages/unread/:userId
router.get("/unread/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { count, error } = await supabase
      .from("messages").select("*", { count: "exact", head: true })
      .eq("receiver_id", userId).eq("is_read", false);
    if (error) throw error;
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /messages/mark-read/:userId/:partnerId
router.patch("/mark-read/:userId/:partnerId", async (req, res) => {
  try {
    const { userId, partnerId } = req.params;
    const { error } = await supabase
      .from("messages").update({ is_read: true })
      .eq("receiver_id", userId).eq("sender_id", partnerId).eq("is_read", false);
    if (error) throw error;
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /messages/conversations/:userId
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: connections } = await supabase
      .from("interests").select("sender_id, receiver_id")
      .eq("status", "accepted")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    const connectedIds = new Set();
    (connections || []).forEach((c) => {
      connectedIds.add(c.sender_id === userId ? c.receiver_id : c.sender_id);
    });

    const { data: messages, error } = await supabase
      .from("messages").select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false });
    if (error) throw error;

    const conversationMap = new Map();
    for (const msg of messages) {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!connectedIds.has(otherId)) continue;
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          otherUserId: otherId, lastMessage: msg.text,
          timestamp: msg.timestamp, unread: 0,
        });
      }
      if (msg.receiver_id === userId && msg.is_read === false) {
        conversationMap.get(otherId).unread = (conversationMap.get(otherId).unread || 0) + 1;
      }
    }

    connectedIds.forEach((otherId) => {
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          otherUserId: otherId,
          lastMessage: "Say hi to start the conversation!",
          timestamp: null, unread: 0,
        });
      }
    });

    const otherIds = Array.from(conversationMap.keys());
    let profiles = [];
    if (otherIds.length > 0) {
      const { data: profileData } = await supabase
        .from("users").select("id, name, photo_url, age, location")
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
    res.status(500).json({ error: err.message });
  }
});

// GET /messages/chat/:user1/:user2
router.get("/chat/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const { data, error } = await supabase
      .from("messages").select("*")
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .order("timestamp", { ascending: true });
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /messages/send
router.post("/send", async (req, res) => {
  try {
    const { sender_id, receiver_id, text } = req.body;
    if (!sender_id || !receiver_id || !text || !text.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const connected = await areConnected(sender_id, receiver_id);
    if (!connected) {
      return res.status(403).json({
        error: "You can only message users you are connected with.",
        code: "NOT_CONNECTED",
      });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([{
        sender_id, receiver_id, text: text.trim(),
        timestamp: new Date().toISOString(), is_read: false,
      }])
      .select().single();
    if (error) throw error;

    // ⭐ Notify receiver
    try {
      const { data: sender } = await supabase
        .from("users").select("name").eq("id", sender_id).single();

      await supabase.from("notifications").insert([{
        user_id: receiver_id,
        actor_id: sender_id,
        type: "message_received",
        title: "New Message 💬",
        body: `${sender?.name || "Someone"}: ${text.trim().slice(0, 60)}`,
        link: `/messages?to=${sender_id}`,
      }]);
    } catch (e) {
      console.error("Notify error:", e);
    }

    res.status(201).json({ message: "Message sent", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;