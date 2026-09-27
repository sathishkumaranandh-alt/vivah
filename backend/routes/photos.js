import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_PHOTOS = 5;

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
  const { user_id, photo_url, is_primary } = req.body;
  try {
    // Check photo count
    const { count, error: countError } = await supabaseAdmin
      .from('user_photos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);
    
    if (countError) throw countError;
    if (count >= MAX_PHOTOS) {
      return res.status(400).json({ error: `Maximum ${MAX_PHOTOS} photos allowed` });
    }

    // If this is the first photo or is_primary is true, unset others
    if (is_primary || count === 0) {
      await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', user_id);
    }

    const { data, error } = await supabaseAdmin
      .from('user_photos')
      .insert({ user_id, photo_url, is_primary: is_primary || count === 0 })
      .select()
      .single();

    if (error) throw error;

    // Update the main users table
    if (is_primary || count === 0) {
      await supabaseAdmin.from('users').update({ photo_url }).eq('id', user_id);
    }

    res.json({ photo: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a photo
router.delete('/:photoId', async (req, res) => {
  const { photoId } = req.params;
  try {
    // 1. Get the photo to check if it was primary
    const { data: photo, error: fetchError } = await supabaseAdmin
      .from('user_photos')
      .select('*')
      .eq('id', photoId)
      .single();
      
    if (fetchError) throw fetchError;

    // 2. Delete the photo
    const { error: deleteError } = await supabaseAdmin
      .from('user_photos')
      .delete()
      .eq('id', photoId);

    if (deleteError) throw deleteError;

    // 3. If it was the primary photo, update the user's main photo_url
    if (photo.is_primary) {
      // Find the next available photo
      const { data: nextPhoto } = await supabaseAdmin
        .from('user_photos')
        .select('*')
        .eq('user_id', photo.user_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (nextPhoto) {
        // Set the next photo as primary
        await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', nextPhoto.id);
        await supabaseAdmin.from('users').update({ photo_url: nextPhoto.photo_url }).eq('id', photo.user_id);
      } else {
        // No photos left, clear the user's photo_url
        await supabaseAdmin.from('users').update({ photo_url: null }).eq('id', photo.user_id);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
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

    // Unset all other primary photos for this user
    await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', photo.user_id);
    
    // Set this one as primary
    await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', photoId);
    
    // Update the main users table
    await supabaseAdmin.from('users').update({ photo_url: photo.photo_url }).eq('id', photo.user_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
