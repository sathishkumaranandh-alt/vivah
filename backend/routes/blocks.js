import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// POST /blocks/block
// Body: { blocker_id, blocked_id, reason }
// ============================================
router.post("/block", async (req, res) => {
  try {
    const { blocker_id, blocked_id, reason } = req.body;

    if (!blocker_id || !blocked_id) {
      return res.status(400).json({ error: "Missing blocker_id or blocked_id" });
    }
    if (blocker_id === blocked_id) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    const { data, error } = await supabaseAdmin
      .from("blocked_users")
      .upsert(
        {
          blocker_id,
          blocked_id,
          reason: reason || null,
        },
        { onConflict: "blocker_id,blocked_id" }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, block: data });
  } catch (err) {
    console.error("Block error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /blocks/unblock
// Body: { blocker_id, blocked_id }
// ============================================
router.post("/unblock", async (req, res) => {
  try {
    const { blocker_id, blocked_id } = req.body;

    if (!blocker_id || !blocked_id) {
      return res.status(400).json({ error: "Missing ids" });
    }

    const { error } = await supabaseAdmin
      .from("blocked_users")
      .delete()
      .eq("blocker_id", blocker_id)
      .eq("blocked_id", blocked_id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /blocks/list/:userId
// Returns list of users this user has blocked
// ============================================
router.get("/list/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabaseAdmin
      .from("blocked_users")
      .select(
        `
        id,
        blocked_id,
        reason,
        created_at,
        blocked:users!blocked_id (id, name, photo_url)
      `
      )
      .eq("blocker_id", userId);

    if (error) throw error;

    res.json({ blocked: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /blocks/check/:blockerId/:blockedId
// Check if user has blocked another user
// ============================================
router.get("/check/:blockerId/:blockedId", async (req, res) => {
  try {
    const { blockerId, blockedId } = req.params;

    const { data } = await supabaseAdmin
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId)
      .maybeSingle();

    res.json({ isBlocked: !!data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /blocks/any/:user1/:user2
// Check if EITHER user has blocked the other
// ============================================
router.get("/any/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const { data, error } = await supabaseAdmin
      .from("blocked_users")
      .select("blocker_id")
      .or(
        `and(blocker_id.eq.${user1},blocked_id.eq.${user2}),and(blocker_id.eq.${user2},blocked_id.eq.${user1})`
      )
      .limit(1);

    if (error) throw error;

    res.json({
      isBlocked: (data || []).length > 0,
      blockerId: data?.[0]?.blocker_id || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
