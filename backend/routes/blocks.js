import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { requireAuth } from "../utils/auth.js"; // 🛡️ Added

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 🛡️ Helper to validate UUID (Prevents SQL Injection)
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// ============================================
// POST /blocks/block (🔒 Secured)
// ============================================
router.post("/block", requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: blocker_id comes from JWT, not body
    const blocker_id = req.userId;
    const { blocked_id, reason } = req.body;

    if (!blocked_id || !isValidUUID(blocked_id)) {
      return res.status(400).json({ error: "Missing or invalid blocked_id" });
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
// POST /blocks/unblock (🔒 Secured)
// ============================================
router.post("/unblock", requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: blocker_id comes from JWT
    const blocker_id = req.userId;
    const { blocked_id } = req.body;

    if (!blocked_id || !isValidUUID(blocked_id)) {
      return res.status(400).json({ error: "Missing or invalid blocked_id" });
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
// GET /blocks/list (🔒 Secured - Removed :userId)
// ============================================
router.get("/list", requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: Only return the logged-in user's blocked list
    const userId = req.userId;

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
// GET /blocks/check/:blockedId (🔒 Secured)
// ============================================
router.get("/check/:blockedId", requireAuth, async (req, res) => {
  try {
    const { blockedId } = req.params;
    const blockerId = req.userId; // 🛡️ From JWT

    if (!isValidUUID(blockedId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

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
// GET /blocks/any/:user1/:user2 (🔒 Secured)
// ============================================
router.get("/any/:user1/:user2", requireAuth, async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    // 🛡️ SECURITY FIX: Ensure user1 is the authenticated user
    if (user1 !== req.userId || !isValidUUID(user2)) {
      return res.status(403).json({ error: "Forbidden" });
    }

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
