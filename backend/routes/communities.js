import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// GET /communities
// List all active communities (public — no auth needed)
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
// GET /communities/all
// List ALL communities (admin — includes inactive)
// ============================================================
router.get("/all", async (req, res) => {
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
// POST /communities
// Create a new community (admin)
// ============================================================
router.post("/", async (req, res) => {
  try {
    const { slug, name, emoji, color, description, display_order } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ error: "Slug and name are required" });
    }

    // Normalize slug: lowercase, no spaces
    const cleanSlug = slug.toLowerCase().trim().replace(/\s+/g, "_");

    // Check for existing
    const { data: existing } = await supabase
      .from("communities")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "A community with this slug already exists" });
    }

    const { data, error } = await supabase
      .from("communities")
      .insert([{
        slug: cleanSlug,
        name: name.trim(),
        emoji: emoji || "👥",
        color: color || "#1e3a8a",
        description: description || null,
        display_order: display_order || 999,
      }])
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
// PATCH /communities/:id
// Update a community
// ============================================================
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;

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
// PATCH /communities/:id/toggle
// Toggle active status
// ============================================================
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: current, error: fetchError } = await supabase
      .from("communities").select("is_active").eq("id", id).single();
    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from("communities")
      .update({ is_active: !current.is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: data.is_active ? "Activated" : "Deactivated", community: data });
  } catch (err) {
    console.error("Toggle community error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /communities/:id
// Delete a community
// ============================================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get slug first
    const { data: community } = await supabase
      .from("communities").select("slug, name").eq("id", id).single();

    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    // Safety: check if any users are assigned
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