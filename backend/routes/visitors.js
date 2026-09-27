import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// LOG A PROFILE VIEW
router.post('/log', async (req, res) => {
  const { viewerId, viewedId } = req.body;
  if (!viewerId || !viewedId) return res.status(400).json({ error: "Missing IDs" });
  if (viewerId === viewedId) return res.json({ message: "Self view ignored" });

  try {
    await supabaseAdmin.from('profile_views').insert({
      viewer_id: viewerId,
      viewed_id: viewedId
    });
    res.json({ success: true });
  } catch (err) {
    console.error("View log error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET VISITORS FOR A USER
router.get('/list/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Get ALL views for this user (ordered newest first)
    const { data: views, error: viewError } = await supabaseAdmin
      .from('profile_views')
      .select('viewer_id, created_at')
      .eq('viewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(100); // Fetch up to 100 recent views

    if (viewError) throw viewError;
    if (!views || views.length === 0) return res.json({ visitors: [] });

    // 2. DEDUPLICATE: Keep only the most recent view per unique viewer
    const uniqueViews = [];
    const seenViewers = new Set();
    for (const view of views) {
      if (!seenViewers.has(view.viewer_id)) {
        seenViewers.add(view.viewer_id);
        uniqueViews.push(view);
      }
    }

    const viewerIds = [...seenViewers];

    // 3. Fetch profile details for these unique viewers
    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, age, location, photo_url, community, is_verified')
      .in('id', viewerIds);

    if (userError) throw userError;

    // 4. Merge the unique view time with the user profile
    const visitors = uniqueViews.map(view => {
      const user = users.find(u => u.id === view.viewer_id);
      return { ...user, viewed_at: view.created_at };
    }).filter(v => v.id);

    res.json({ visitors });
  } catch (err) {
    console.error("Visitors list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
