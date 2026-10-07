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
// CUSTOM FIELDS (registration_fields table)
// ============================================

// GET all fields (Register + Profile Edit)
router.get('/fields', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_fields')
      .select('*')
      .order('step', { ascending: true })
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ fields: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a new field (Admin only)
router.post('/fields', async (req, res) => {
  const {
    field_key, label, type, options, is_required, step,
    show_in_profile, profile_tab, display_order
  } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_fields')
      .insert({
        field_key,
        label,
        type,
        options,
        is_required,
        step,
        show_in_profile: show_in_profile !== false,
        profile_tab: profile_tab || 'basic',
        display_order: display_order || 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ field: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a field
router.put('/fields/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_fields')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ field: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a field
router.delete('/fields/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from('registration_fields').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CORE FIELDS (core_fields_config table)
// ============================================

// GET core field configurations
router.get('/core-fields', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('core_fields_config').select('*');
    if (error) throw error;
    res.json({ fields: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a core field configuration
router.put('/core-fields/:key', async (req, res) => {
  const { key } = req.params;
  const { is_active, is_required, show_in_profile } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (is_active !== undefined) updates.is_active = is_active;
  if (is_required !== undefined) updates.is_required = is_required;
  if (show_in_profile !== undefined) updates.show_in_profile = show_in_profile;

  try {
    const { data, error } = await supabaseAdmin
      .from('core_fields_config')
      .update(updates)
      .eq('field_key', key)
      .select()
      .single();
    if (error) throw error;
    res.json({ field: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
