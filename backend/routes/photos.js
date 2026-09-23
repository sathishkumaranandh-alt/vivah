import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

const MAX_PHOTOS = 5;

// ============================================================
// GET /photos/:userId — List all photos for a user
// ============================================================
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("user_photos")
      .select("*")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("display_order", { ascending: true });

    if (error) throw error;
    res.json({ photos: data || [] });
  } catch (err) {
    console.error("Get photos error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /photos/add — Add a new photo (after storage upload)
// ============================================================
router.post("/add", async (req, res) => {
  try {
    const { user_id, photo_url, is_primary } = req.body;
    if (!user_id || !photo_url) {
      return res.status(400).json({ error: "Missing user_id or photo_url" });
    }

    // Count existing photos
    const { count } = await supabase
      .from("user_photos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id);

    if ((count || 0) >= MAX_PHOTOS) {
      return res.status(400).json({ error: `Maximum ${MAX_PHOTOS} photos allowed` });
    }

    const shouldBePrimary = is_primary || (count || 0) === 0;

    // If this should be primary, unset others
    if (shouldBePrimary) {
      await supabase
        .from("user_photos")
        .update({ is_primary: false })
        .eq("user_id", user_id);
    }

    const { data, error } = await supabase
      .from("user_photos")
      .insert([{
        user_id,
        photo_url,
        is_primary: shouldBePrimary,
        display_order: count || 0,
      }])
      .select()
      .single();

    if (error) throw error;

    // If primary, update users.photo_url (backward compat)
    if (shouldBePrimary) {
      await supabase.from("users").update({ photo_url }).eq("id", user_id);
    }

    res.status(201).json({ photo: data });
  } catch (err) {
    console.error("Add photo error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /photos/:photoId/primary — Set as main photo
// ============================================================
router.patch("/:photoId/primary", async (req, res) => {
  try {
    const { photoId } = req.params;
    const { user_id } = req.body;

    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    // Unset all others
    await supabase
      .from("user_photos")
      .update({ is_primary: false })
      .eq("user_id", user_id);

    // Set this one primary
    const { data, error } = await supabase
      .from("user_photos")
      .update({ is_primary: true })
      .eq("id", photoId)
      .select()
      .single();

    if (error) throw error;

    // Sync users.photo_url
    await supabase
      .from("users")
      .update({ photo_url: data.photo_url })
      .eq("id", user_id);

    res.json({ message: "Main photo updated", photo: data });
  } catch (err) {
    console.error("Set primary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /photos/:photoId — Delete a photo
// ============================================================
router.delete("/:photoId", async (req, res) => {
  try {
    const { photoId } = req.params;
    const { user_id } = req.query;

    const { data: photo } = await supabase
      .from("user_photos")
      .select("*")
      .eq("id", photoId)
      .single();

    if (!photo) return res.status(404).json({ error: "Photo not found" });

    await supabase.from("user_photos").delete().eq("id", photoId);

    // If it was primary, promote next photo
    if (photo.is_primary && user_id) {
      const { data: remaining } = await supabase
        .from("user_photos")
        .select("*")
        .eq("user_id", user_id)
        .order("display_order", { ascending: true })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabase
          .from("user_photos")
          .update({ is_primary: true })
          .eq("id", remaining[0].id);
        await supabase
          .from("users")
          .update({ photo_url: remaining[0].photo_url })
          .eq("id", user_id);
      } else {
        await supabase
          .from("users")
          .update({ photo_url: null })
          .eq("id", user_id);
      }
    }

    res.json({ message: "Photo deleted" });
  } catch (err) {
    console.error("Delete photo error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
