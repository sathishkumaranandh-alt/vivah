import express from "express";
import supabase from "../supabaseClient.js";
import { requireAdmin } from '../utils/auth.js'; // 🛡️ Added Auth

const router = express.Router();

// ============================================================
// POST /audit/log (🔒 Admin Only)
// ============================================================
router.post("/log", requireAdmin, async (req, res) => {
  try {
    const { admin_email, action, target_type, target_id, target_name, details } = req.body;
    const admin_id = req.userId; // 🔒 Use JWT instead of body

    if (!action) return res.status(400).json({ error: "action is required" });

    const { data, error } = await supabase
      .from("audit_logs")
      .insert([{
        admin_id,
        admin_email: admin_email || null,
        action,
        target_type: target_type || null,
        target_id: target_id || null,
        target_name: target_name || null,
        details: details || null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Logged", log: data });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /audit/all (🔒 Admin Only)
// ============================================================
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ logs: data || [], total: (data || []).length });
  } catch (err) {
    console.error("Get audit logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /audit/recent (🔒 Admin Only)
// ============================================================
router.get("/recent", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    console.error("Recent audit error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /audit/clear (🔒 Admin Only)
// ============================================================
router.delete("/clear", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from("audit_logs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all

    if (error) throw error;
    res.json({ message: "All logs cleared" });
  } catch (err) {
    console.error("Clear logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /settings (🌐 Public - Frontend needs this)
// ============================================================
router.get("/settings", async (req, res) => {
  try {
    const { data, error } = await supabase.from("site_settings").select("*");
    if (error) throw error;

    const settings = {};
    (data || []).forEach((s) => { settings[s.key] = s.value; });
    res.json({ settings });
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PUT /settings (🔒 Admin Only)
// ============================================================
router.put("/settings", requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings object required" });
    }

    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("site_settings")
      .upsert(updates, { onConflict: "key" })
      .select();

    if (error) throw error;
    res.json({ message: "Settings saved", settings: data });
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
