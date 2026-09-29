import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET custom permissions for a user
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('custom_permissions, category')
      .eq('id', userId)
      .single();
    if (error) throw error;
    res.json({
      custom_permissions: data?.custom_permissions || {},
      category: data?.category || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE custom permissions for a user (Admin only)
router.put('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { custom_permissions, category } = req.body;
  try {
    const updates = {};
    if (custom_permissions !== undefined) updates.custom_permissions = custom_permissions;
    if (category !== undefined) updates.category = category;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESET custom permissions (fall back to plan)
router.delete('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ custom_permissions: {} })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all categories
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_categories')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ categories: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a category
router.post('/categories', async (req, res) => {
  const { name, description, permissions, color } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('user_categories')
      .insert({ name, description, permissions, color })
      .select()
      .single();
    if (error) throw error;
    res.json({ category: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a category
router.put('/categories/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('user_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ category: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a category
router.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from('user_categories').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// APPLY a category to a user (Admin)
router.post('/apply-category/:userId/:categoryName', async (req, res) => {
  const { userId, categoryName } = req.params;
  try {
    const { data: cat, error: catErr } = await supabaseAdmin
      .from('user_categories')
      .select('permissions')
      .eq('name', categoryName)
      .single();
    if (catErr) throw catErr;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ custom_permissions: cat.permissions, category: categoryName })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
