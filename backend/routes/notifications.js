import express from "express";
import supabase from "../supabaseClient.js";
import { requireAuth } from "../utils/auth.js"; // 🛡️ Added Security

const router = express.Router();

// ============================================================
// POST /notifications/create
// Create a notification (internal use)
// ============================================================
router.post("/create", async (req, res) => {
  try {
    const { user_id, actor_id, type, title, message, link } = req.body;
    if (!user_id || !type || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert([{ user_id, actor_id: actor_id || null, type, title, message: message || null, link: link || null }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ notification: data });
  } catch (err) {
    console.error("Create notification error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /notifications/:userId
// List notifications for user
// ============================================================
router.get("/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 🛡️ Security: You can only view YOUR OWN notifications
    if (userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const limit = parseInt(req.query.limit) || 30;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ notifications: data || [], total: (data || []).length });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /notifications/count/:userId
// Unread count (for bell badge)
// ============================================================
router.get("/count/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    console.error("Notification count error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /notifications/read/:id
// Mark one notification as read
// ============================================================
router.patch("/read/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 🛡️ Security: Verify ownership before marking read
    const { data: notif } = await supabase.from("notifications").select("user_id").eq("id", id).single();
    if (!notif || notif.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /notifications/read-all/:userId
// Mark all as read
// ============================================================
router.patch("/read-all/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /notifications/:id
// ============================================================
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 🛡️ Security: Verify ownership before deleting
    const { data: notif } = await supabase.from("notifications").select("user_id").eq("id", id).single();
    if (!notif || notif.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /notifications/read-by-actor/:userId/:actorId
// Mark ALL notifications from a specific actor as read
// ============================================================
router.patch("/read-by-actor/:userId/:actorId", requireAuth, async (req, res) => {
  try {
    const { userId, actorId } = req.params;
    
    if (userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("actor_id", actorId)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ message: "Marked all from actor as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
