import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_PHOTOS = 7;

// GET all photos for a user
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('user_photos')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ photos: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD a new photo
router.post('/add', async (req, res) => {
  const { user_id, photo_url, is_primary, is_private } = req.body;
  try {
    const { count, error: countError } = await supabaseAdmin
      .from('user_photos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);
    
    if (countError) throw countError;
    if (count >= MAX_PHOTOS) {
      return res.status(400).json({ error: `Maximum ${MAX_PHOTOS} photos allowed` });
    }

    if (is_primary || count === 0) {
      await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', user_id);
    }

    const { data, error } = await supabaseAdmin
      .from('user_photos')
      .insert({ user_id, photo_url, is_primary: is_primary || count === 0, is_private: is_private || false })
      .select()
      .single();

    if (error) throw error;

    if (is_primary || count === 0) {
      await supabaseAdmin.from('users').update({ photo_url }).eq('id', user_id);
    }

    res.json({ photo: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE privacy for all photos of a user
router.put('/:userId/privacy', async (req, res) => {
  const { userId } = req.params;
  const { is_private } = req.body;
  try {
    const { error } = await supabaseAdmin
      .from('user_photos')
      .update({ is_private })
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a photo
router.delete('/:photoId', async (req, res) => {
  const { photoId } = req.params;
  try {
    const { data: photo, error: fetchError } = await supabaseAdmin
      .from('user_photos')
      .select('*')
      .eq('id', photoId)
      .single();
      
    if (fetchError) throw fetchError;

    const { error: deleteError } = await supabaseAdmin
      .from('user_photos')
      .delete()
      .eq('id', photoId);

    if (deleteError) throw deleteError;

    if (photo.is_primary) {
      const { data: nextPhoto } = await supabaseAdmin
        .from('user_photos')
        .select('*')
        .eq('user_id', photo.user_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (nextPhoto) {
        await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', nextPhoto.id);
        await supabaseAdmin.from('users').update({ photo_url: nextPhoto.photo_url }).eq('id', photo.user_id);
      } else {
        await supabaseAdmin.from('users').update({ photo_url: null }).eq('id', photo.user_id);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SET a photo as primary
router.patch('/:photoId/primary', async (req, res) => {
  const { photoId } = req.params;
  try {
    const { data: photo, error: fetchError } = await supabaseAdmin
      .from('user_photos')
      .select('*')
      .eq('id', photoId)
      .single();
      
    if (fetchError) throw fetchError;

    await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', photo.user_id);
    await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', photoId);
    await supabaseAdmin.from('users').update({ photo_url: photo.photo_url }).eq('id', photo.user_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
