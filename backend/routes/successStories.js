import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// PUBLIC — GET approved stories only
// ============================================
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .select('*')
      .eq('is_approved', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ stories: data || [] });
  } catch (err) {
    console.error("Fetch stories error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN — GET all stories (approved + not)
// ============================================
router.get('/admin/all', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ stories: data || [] });
  } catch (err) {
    console.error("Admin fetch stories error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CREATE — New story
// ============================================
router.post('/', async (req, res) => {
  const {
    couple_names,
    story,
    photo_url,
    is_approved,
    wedding_date,
    location,
    display_order,
  } = req.body;

  if (!couple_names || !story) {
    return res.status(400).json({ error: "Couple names and story are required" });
  }

  try {
    const payload = {
      couple_names: couple_names.trim(),
      story: story.trim(),
      photo_url: photo_url || null,
      is_approved: is_approved === true,
    };

    // Optional fields — only add if provided (safe if columns don't exist yet)
    if (wedding_date) payload.wedding_date = wedding_date;
    if (location) payload.location = location;
    if (display_order !== undefined) payload.display_order = parseInt(display_order, 10) || 0;

    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.json({ story: data });
  } catch (err) {
    console.error("Create story error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// UPDATE — Edit existing story
// ============================================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    couple_names,
    story,
    photo_url,
    is_approved,
    wedding_date,
    location,
    display_order,
  } = req.body;

  try {
    const payload = {};
    if (couple_names !== undefined) payload.couple_names = couple_names.trim();
    if (story !== undefined) payload.story = story.trim();
    if (photo_url !== undefined) payload.photo_url = photo_url || null;
    if (is_approved !== undefined) payload.is_approved = is_approved === true;
    if (wedding_date !== undefined) payload.wedding_date = wedding_date || null;
    if (location !== undefined) payload.location = location || null;
    if (display_order !== undefined) payload.display_order = parseInt(display_order, 10) || 0;

    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ story: data });
  } catch (err) {
    console.error("Update story error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DELETE — Remove story
// ============================================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('success_stories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Delete story error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
