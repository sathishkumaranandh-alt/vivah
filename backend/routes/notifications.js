import express from "express";
import supabase from "../supabaseClient.js";

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
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
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
router.get("/count/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
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
router.patch("/read/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
router.patch("/read-all/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
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
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
router.patch("/read-by-actor/:userId/:actorId", async (req, res) => {
  try {
    const { userId, actorId } = req.params;
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