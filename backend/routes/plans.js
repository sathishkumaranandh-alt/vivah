import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET all active plans (for users)
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

// GET all plans including inactive (Admin only)
router.get('/admin/all', async (req, res) => {
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

// GET user's current plan & permissions
router.get('/user-plan/:userId', async (req, res) => {
  const { userId } = req.params;
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
      .eq('is_active', true)
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

// CREATE a new plan (Admin)
router.post('/', async (req, res) => {
  const { name, price, duration_days, features, permissions, display_order } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('membership_plans')
      .insert({ name, price, duration_days, features, permissions, display_order })
      .select()
      .single();
    if (error) throw error;
    res.json({ plan: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a plan (Admin)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
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
    res.status(500).json({ error: err.message });
  }
});

// DELETE a plan (Admin)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from('membership_plans').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
