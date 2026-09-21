import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// POST /audit/log
// Record an admin action
// ============================================================
router.post("/log", async (req, res) => {
  try {
    const { admin_id, admin_email, action, target_type, target_id, target_name, details } = req.body;

    if (!action) return res.status(400).json({ error: "action is required" });

    const { data, error } = await supabase
      .from("audit_logs")
      .insert([{
        admin_id: admin_id || null,
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
// GET /audit/all
// Get all audit logs (newest first)
// ============================================================
router.get("/all", async (req, res) => {
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
// GET /audit/recent
// Get recent 20 logs for dashboard widget
// ============================================================
router.get("/recent", async (req, res) => {
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
// DELETE /audit/clear
// Clear all audit logs (admin only)
// ============================================================
router.delete("/clear", async (req, res) => {
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
// GET /settings
// Get all site settings as a key-value object
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
// PUT /settings
// Update site settings
// Body: { settings: { key1: value1, key2: value2, ... } }
// ============================================================
router.put("/settings", async (req, res) => {
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