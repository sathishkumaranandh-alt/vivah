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

// GET VISITORS FOR A USER (PREMIUM ONLY)
router.get('/list/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Check if the user has an active Gold or Platinum subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const isPremium = sub && (sub.plan === 'gold' || sub.plan === 'platinum');

    if (!isPremium) {
      return res.json({ 
        visitors: [], 
        isPremium: false, 
        message: "Upgrade to Gold or Platinum to see who viewed your profile" 
      });
    }

    // 2. Fetch visitors
    const { data: views, error: viewError } = await supabaseAdmin
      .from('profile_views')
      .select('viewer_id, created_at')
      .eq('viewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (viewError) throw viewError;
    if (!views || views.length === 0) return res.json({ visitors: [], isPremium: true });

    // 3. Deduplicate
    const uniqueViews = [];
    const seenViewers = new Set();
    for (const view of views) {
      if (!seenViewers.has(view.viewer_id)) {
        seenViewers.add(view.viewer_id);
        uniqueViews.push(view);
      }
    }

    const viewerIds = [...seenViewers];

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, age, location, photo_url, community, is_verified')
      .in('id', viewerIds);

    if (userError) throw userError;

    const visitors = uniqueViews.map(view => {
      const user = users.find(u => u.id === view.viewer_id);
      return { ...user, viewed_at: view.created_at };
    }).filter(v => v.id);

    res.json({ visitors, isPremium: true });
  } catch (err) {
    console.error("Visitors list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
