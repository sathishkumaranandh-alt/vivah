import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// GET /messages/conversations/:userId
// List all conversations for the current user
// ============================================================
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all messages involving this user
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("timestamp", { ascending: false });

    if (error) throw error;

    // Group by the other user
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
    }

    // Fetch profile info for each other user
    const otherIds = Array.from(conversationMap.keys());
    let profiles = [];
    if (otherIds.length > 0) {
      const { data: profileData } = await supabase
        .from("users")
        .select("id, name, photo_url, age, location")
        .in("id", otherIds);
      profiles = profileData || [];
    }

    // Merge profile into conversation
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
// Send a new message
// ============================================================
router.post("/send", async (req, res) => {
  try {
    const { sender_id, receiver_id, text } = req.body;

    // Validate
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