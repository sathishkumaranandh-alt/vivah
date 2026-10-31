import express from "express";
import supabase from "../supabaseClient.js";
import { notifyAdmins, escapeHtml } from "../utils/notify.js";
import { requireAuth, requireAdmin } from "../utils/auth.js"; // 🛡️ Added Security

const router = express.Router();

// ============================================================
// POST /reports/create
// Create a new report
// ============================================================
router.post("/create", requireAuth, async (req, res) => {
  try {
    const { reported_user_id, reason, details } = req.body;
    const reporter_id = req.userId; // 🔒 Secure from JWT

    if (!reported_user_id || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (reporter_id === reported_user_id) {
      return res.status(400).json({ error: "Cannot report yourself" });
    }

    const { data, error } = await supabase
      .from("reports")
      .insert([
        {
          reporter_id,
          reported_user_id,
          reason,
          details: details || null,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    notifyAdmins(`🚩 <b>New report</b>\nReason: ${escapeHtml(reason)}\nOpen admin panel to review.`);

    res.status(201).json({ message: "Report submitted", report: data });
  } catch (err) {
    console.error("Create report error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /reports/all
// Get all reports (admin only)
// ============================================================
router.get("/all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query.limit(200);

    if (error) throw error;

    const allUserIds = new Set();
    (data || []).forEach((r) => {
      allUserIds.add(r.reporter_id);
      allUserIds.add(r.reported_user_id);
    });

    let userMap = {};
    if (allUserIds.size > 0) {
      const { data: userData } = await supabase
        .from("users")
        .select("id, name, email, photo_url, is_suspended")
        .in("id", Array.from(allUserIds));
      (userData || []).forEach((u) => {
        userMap[u.id] = u;
      });
    }

    const enriched = (data || []).map((r) => ({
      ...r,
      reporter: userMap[r.reporter_id] || null,
      reportedUser: userMap[r.reported_user_id] || null,
    }));

    res.json({ reports: enriched, total: enriched.length });
  } catch (err) {
    console.error("Get reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /reports/:reportId/resolve
// Mark a report as resolved
// ============================================================
router.patch("/:reportId/resolve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body;
    const resolved_by = req.userId; // 🔒 Secure from JWT

    const { data, error } = await supabase
      .from("reports")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: resolved_by,
        details: action ? `Action: ${action}` : undefined,
      })
      .eq("id", reportId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Report resolved", report: data });
  } catch (err) {
    console.error("Resolve report error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /reports/:reportId/dismiss
// Dismiss a report (mark as reviewed, no action)
// ============================================================
router.patch("/:reportId/dismiss", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reportId } = req.params;

    const { data, error } = await supabase
      .from("reports")
      .update({
        status: "dismissed",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reportId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Report dismissed", report: data });
  } catch (err) {
    console.error("Dismiss report error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
      
