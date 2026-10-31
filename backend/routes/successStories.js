import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAdmin, requireAuth } from '../utils/auth.js'; // 🛡️ Added requireAuth

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// 🌍 PUBLIC — GET approved stories only
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
// 💌 MEMBER — submit a story (saved as NOT approved; admin reviews first)
// ============================================
const submitLog = new Map(); // userId -> [timestamps] (max 3 per 24h)
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const uid = req.userId;
    const now = Date.now();
    const recent = (submitLog.get(uid) || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (recent.length >= 3) {
      return res.status(429).json({ error: 'You have already submitted a few stories today. Please try again tomorrow.' });
    }

    const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const couple_names = clean(req.body.couple_names, 120);
    const story = clean(req.body.story, 1500);
    const location = clean(req.body.location, 80);
    if (!couple_names || story.length < 20) {
      return res.status(400).json({ error: 'Please enter both names and a story of at least 20 characters.' });
    }

    const payload = { couple_names, story, is_approved: false };
    if (location) payload.location = location;

    const { error } = await supabaseAdmin.from('success_stories').insert([payload]);
    if (error) throw error;

    recent.push(now);
    submitLog.set(uid, recent);
    res.status(201).json({ message: 'Story submitted for review' });
  } catch (err) {
    console.error('Submit story error:', err);
    res.status(500).json({ error: 'Could not submit your story. Please try again.' });
  }
});

// ============================================
// 🔒 ADMIN — GET all stories (approved + not)
// ============================================
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
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
// 🔒 CREATE — New story
// ============================================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
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
// 🔒 UPDATE — Edit existing story
// ============================================
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
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
// 🔒 DELETE — Remove story
// ============================================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
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
