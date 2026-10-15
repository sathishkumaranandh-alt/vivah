import express from "express";
import supabase from "../supabaseClient.js";
import { requireAdmin } from "../utils/auth.js";

const router = express.Router();

// ============================================================
// GET /communities
// 🌍 PUBLIC — only active communities
// Used by all users for community dropdown
// ============================================================
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("communities")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    res.json({ communities: data || [] });
  } catch (err) {
    console.error("Get communities error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 GET /communities/all
// ADMIN — includes inactive
// ============================================================
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("communities")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;
    res.json({ communities: data || [] });
  } catch (err) {
    console.error("Get all communities error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 POST /communities/bulk
// ADMIN — Add multiple communities from a text list
// ============================================================
router.post("/bulk", requireAdmin, async (req, res) => {
  try {
    const { list } = req.body;
    if (!list || typeof list !== "string") {
      return res.status(400).json({ error: "List text is required" });
    }

    const lines = list
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return res.status(400).json({ error: "No lines to import" });
    }

    const parsed = [];
    for (const line of lines) {
      let emoji = "👥";
      let name = line;

      if (line.includes("|")) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length === 2) {
          emoji = parts[0] || "👥";
          name = parts[1];
        }
      }

      if (!name) continue;

      const slug = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      if (!slug) continue;

      parsed.push({
        slug,
        name,
        emoji,
        is_active: true,
        display_order: 999,
      });
    }

    if (parsed.length === 0) {
      return res.status(400).json({ error: "No valid community names found" });
    }

    const { data: existing } = await supabase
      .from("communities")
      .select("slug");
    const existingSlugs = new Set((existing || []).map((c) => c.slug));

    const seen = new Set();
    const toInsert = [];
    let skipped = 0;

    for (const c of parsed) {
      if (existingSlugs.has(c.slug) || seen.has(c.slug)) {
        skipped++;
        continue;
      }
      seen.add(c.slug);
      toInsert.push(c);
    }

    if (toInsert.length === 0) {
      return res.json({
        message: "All communities already exist",
        added: 0,
        skipped,
      });
    }

    const { data, error } = await supabase
      .from("communities")
      .insert(toInsert)
      .select();

    if (error) throw error;

    res.status(201).json({
      message: `Added ${data.length} communities`,
      added: data.length,
      skipped,
      communities: data,
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 POST /communities
// ADMIN — Create one community
// ============================================================
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { slug, name, emoji, color, description, display_order } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ error: "Slug and name are required" });
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/\s+/g, "_");

    const { data: existing } = await supabase
      .from("communities")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      return res
        .status(400)
        .json({ error: "A community with this slug already exists" });
    }

    const { data, error } = await supabase
      .from("communities")
      .insert([
        {
          slug: cleanSlug,
          name: name.trim(),
          emoji: emoji || "👥",
          color: color || "#1e3a8a",
          description: description || null,
          display_order: display_order || 999,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Community created", community: data });
  } catch (err) {
    console.error("Create community error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 PATCH /communities/:id
// ADMIN — Update
// ============================================================
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    delete updates.admin_id; // Don't store admin_id in DB

    if (updates.slug) {
      updates.slug = updates.slug.toLowerCase().trim().replace(/\s+/g, "_");
    }
    if (updates.name) {
      updates.name = updates.name.trim();
    }

    const { data, error } = await supabase
      .from("communities")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Updated", community: data });
  } catch (err) {
    console.error("Update community error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 PATCH /communities/:id/toggle
// ADMIN — Activate/Deactivate
// ============================================================
router.patch("/:id/toggle", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: current, error: fetchError } = await supabase
      .from("communities")
      .select("is_active")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from("communities")
      .update({ is_active: !current.is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({
      message: data.is_active ? "Activated" : "Deactivated",
      community: data,
    });
  } catch (err) {
    console.error("Toggle community error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 DELETE /communities/:id
// ADMIN — Delete (only if no users in this community)
// ============================================================
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: community } = await supabase
      .from("communities")
      .select("slug, name")
      .eq("id", id)
      .single();

    if (!community)
      return res.status(404).json({ error: "Community not found" });

    const { count: userCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("community", community.slug);

    if (userCount && userCount > 0) {
      return res.status(400).json({
        error: `Cannot delete — ${userCount} user(s) are in this community. Deactivate it instead.`,
      });
    }

    const { error } = await supabase.from("communities").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete community error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
