import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET all fields (for Register page and Admin page)
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
  const { field_key, label, type, options, is_required, step } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('registration_fields')
      .insert({ field_key, label, type, options, is_required, step })
      .select()
      .single();
    if (error) throw error;
    res.json({ field: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a field (Admin only)
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

// DELETE a field (Admin only)
router.delete('/fields/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin.from('registration_fields').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});// GET core field configurations
router.get('/core-fields', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('core_fields_config').select('*');
    if (error) throw error;
    res.json({ fields: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a core field configuration (Admin only)
router.put('/core-fields/:key', async (req, res) => {
  const { key } = req.params;
  const { is_active, is_required } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('core_fields_config')
      .update({ is_active, is_required, updated_at: new Date().toISOString() })
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