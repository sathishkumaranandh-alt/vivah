import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET custom fields
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

// CREATE custom field
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

// UPDATE custom field
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

// DELETE custom field
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

// GET core field configurations
router.get('/core-fields', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('core_fields_config')
      .select('*')
      .order('step', { ascending: true })
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ fields: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a core field configuration (FULL control: label, type, options, etc.)
router.put('/core-fields/:key', async (req, res) => {
  const { key } = req.params;
  const {
    is_active, is_required, show_in_profile,
    label, type, options, step, display_order
  } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (is_active !== undefined) updates.is_active = is_active;
  if (is_required !== undefined) updates.is_required = is_required;
  if (show_in_profile !== undefined) updates.show_in_profile = show_in_profile;
  if (label !== undefined) updates.label = label;
  if (type !== undefined) updates.type = type;
  if (options !== undefined) updates.options = options;
  if (step !== undefined) updates.step = step;
  if (display_order !== undefined) updates.display_order = display_order;

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
