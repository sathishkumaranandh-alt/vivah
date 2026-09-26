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
// 1. SEARCH PROFILES (MUST BE FIRST!)
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
    res.json({ results: data || [] });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. GET SINGLE PROFILE (MUST BE AFTER SEARCH)
// ============================================
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*') 
      .eq('id', userId)
      .single();
      
    if (error) throw error;
    res.json({ profile: data });
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
// 4. ADMIN STATS
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

// ============================================
// 5. ADMIN: GET ALL USERS
// ============================================
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

// ============================================
// 6. ADMIN: GET USER DETAILS
// ============================================
router.get('/admin/users/:id/details', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(404).json({ error: "User not found" });
  }
});

// ============================================
// 7. ADMIN: VERIFY USER
// ============================================
router.patch('/admin/users/:id/verify', async (req, res) => {
  try {
    const { is_verified } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_verified }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 8. ADMIN: SUSPEND USER
// ============================================
router.patch('/admin/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: true, suspend_reason: reason }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 9. ADMIN: UNSUSPEND USER
// ============================================
router.patch('/admin/users/:id/unsuspend', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: false, suspend_reason: null }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 10. ADMIN: CHANGE ROLE
// ============================================
router.patch('/admin/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ role }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 11. ADMIN: DELETE USER
// ============================================
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
