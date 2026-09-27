import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET all approved success stories (public)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ stories: data || [] });
  } catch (err) {
    console.error("Fetch stories error:", err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE a new story (Users or Admin)
router.post('/', async (req, res) => {
  const { couple_names, story, photo_url, is_approved } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('success_stories')
      .insert({ couple_names, story, photo_url, is_approved: is_approved || false })
      .select()
      .single();

    if (error) throw error;
    res.json({ story: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
