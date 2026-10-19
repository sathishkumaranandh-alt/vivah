import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAuth, requireAdmin } from '../utils/auth.js'; // 🛡️ Added requireAuth

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// 🌍 GET all active plans (Public)
// ============================================
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('membership_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 🔒 ADMIN — GET all plans including inactive
// ============================================
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('membership_plans')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 🔒 GET user's current plan & permissions (Auth & Anti-Spoofing)
// ============================================
router.get('/user-plan/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  // 🛡️ Security Fix: Users can only view their OWN plan
  if (userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden: You cannot view others' plans" });
  }

  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const planName = sub?.plan || 'Free';

    const { data: planData } = await supabaseAdmin
      .from('membership_plans')
      .select('*')
      .ilike('name', planName)
      .single();

    res.json({
      plan: planName,
      permissions: planData?.permissions || {},
      subscription: sub || null,
    });
  } catch (err) {
    res.json({ plan: 'Free', permissions: {}, subscription: null });
  }
});

// ============================================
// 🔒 CREATE a new plan (Admin)
// ============================================
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, price, duration_days, features, permissions, display_order } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Plan name is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('membership_plans')
      .insert({
        name,
        price: parseInt(price, 10) || 0,
        duration_days: parseInt(duration_days, 10) || 30,
        features: features || [],
        permissions: permissions || {},
        display_order: parseInt(display_order, 10) || 0,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ plan: data });
  } catch (err) {
    console.error('Create plan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 🔒 UPDATE a plan (Admin)
// ============================================
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  delete updates.admin_id;
  delete updates.id;
  delete updates.created_at;

  if (updates.permissions && typeof updates.permissions === 'object') {
    updates.permissions = { ...updates.permissions };
  }

  if (updates.is_active !== undefined) {
    updates.is_active = updates.is_active === true || updates.is_active === 'true';
  }

  if (updates.price !== undefined) {
    updates.price = parseInt(updates.price, 10) || 0;
  }
  if (updates.duration_days !== undefined) {
    updates.duration_days = parseInt(updates.duration_days, 10) || 0;
  }
  if (updates.display_order !== undefined) {
    updates.display_order = parseInt(updates.display_order, 10) || 0;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('membership_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ plan: data });
  } catch (err) {
    console.error('Update plan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 🔒 DELETE a plan (Admin)
// ============================================
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('membership_plans')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
