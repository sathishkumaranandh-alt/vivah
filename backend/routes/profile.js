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
// HELPER: Check if two users have ANY interest (pending or accepted)
// ============================================
async function hasInterestOrMatch(user1, user2) {
  try {
    const { data, error } = await supabaseAdmin
      .from('interests')
      .select('status')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .in('status', ['pending', 'accepted'])
      .limit(1);
      
    if (error) return false;
    return data && data.length > 0;
  } catch (err) {
    return false;
  }
}

// ============================================
// 1. SEARCH PROFILES
// ============================================
router.get('/search', async (req, res) => {
  try {
    const { gender, age_min, age_max, location, community, religion } = req.query;
    let query = supabaseAdmin.from('users').select('*');

    if (gender) query = query.eq('gender', gender);
    if (age_min) query = query.gte('age', parseInt(age_min));
    if (age_max) query = query.lte('age', parseInt(age_max));
    if (location) query = query.ilike('location', `%${location}%`);
    if (community) query = query.eq('community', community);
    if (religion) query = query.eq('religion', religion);

    const { data, error } = await query.limit(50);
    if (error) throw error;

    const maskedData = data.map(u => ({
      ...u,
      mobile: u.contact_privacy === 'public' ? u.mobile : null,
      email: u.contact_privacy === 'public' ? u.email : null,
    }));

    res.json({ results: maskedData || [] });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. GET SINGLE PROFILE (With Privacy Rules)
// ============================================
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { viewerId } = req.query;
  
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) throw error;

    const isOwner = viewerId === userId;
    // CHANGED: Now checks for ANY interest (pending or accepted)
    const hasInteracted = viewerId ? await hasInterestOrMatch(viewerId, userId) : false;

    if (isOwner) {
      return res.json({ profile, isMatch: false, isOwner });
    }

    let maskedProfile = { ...profile };

    // 1. Contact Privacy
    if (profile.contact_privacy === 'private') {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    } else if (profile.contact_privacy === 'matches' && !hasInteracted) {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    }

    // 2. Photo Privacy (changed to allow pending interest)
    if (profile.photo_privacy === 'private') {
      maskedProfile.should_blur_photos = true;
    } else if (profile.photo_privacy === 'matches' && !hasInteracted) {
      maskedProfile.should_blur_photos = true;
    } else {
      maskedProfile.should_blur_photos = false;
    }

    res.json({ profile: maskedProfile, isMatch: hasInteracted, isOwner });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(404).json({ error: "Profile not found" });
  }
});

// ============================================
// 3. UPDATE PROFILE
// ============================================
router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;
  
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
      
    if (error) throw error;
    res.json({ profile: data });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. ADMIN ROUTES (keep existing)
// ============================================
router.get('/admin/stats', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin.from('users').select('gender, is_verified, is_suspended');
    if (error) throw error;

    const stats = {
      totalUsers: users.length,
      maleUsers: users.filter(u => u.gender === 'male').length,
      femaleUsers: users.filter(u => u.gender === 'female').length,
      verifiedUsers: users.filter(u => u.is_verified).length,
      suspendedUsers: users.filter(u => u.is_suspended).length,
      totalMessages: 0,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/users', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data, error } = await supabaseAdmin.from('users').select('*').limit(limit);
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/users/:id/details', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(404).json({ error: "User not found" });
  }
});

router.patch('/admin/users/:id/verify', async (req, res) => {
  try {
    const { is_verified } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_verified }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: true, suspend_reason: reason }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/unsuspend', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: false, suspend_reason: null }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ role }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
