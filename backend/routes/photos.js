import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAuth } from '../utils/auth.js';
import { computePhotoAccess } from '../utils/privacy.js'; // 🛡️ Added

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_MAX_PHOTOS = 3;

async function getUserMaxPhotos(userId) {
  try {
    const { data: sub } = await supabaseAdmin.from('subscriptions').select('plan, status, expires_at').eq('user_id', userId).eq('status', 'active').gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single();
    const planName = sub?.plan || 'Free';
    const { data: planData } = await supabaseAdmin.from('membership_plans').select('permissions').ilike('name', planName).eq('is_active', true).single();
    return planData?.permissions?.max_photos ?? DEFAULT_MAX_PHOTOS;
  } catch (err) { return DEFAULT_MAX_PHOTOS; }
}

// GET all photos for a user
router.get('/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const viewerId = req.userId;
  
  try {
    const { data: ownerRow } = await supabaseAdmin.from('users').select('photo_privacy').eq('id', userId).single();
    const canView = await computePhotoAccess(supabaseAdmin, viewerId, userId, ownerRow, {});

    const { data, error } = await supabaseAdmin
      .from('user_photos')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 🛡️ Mask URLs if no access
    const safePhotos = (data || []).map(p => {
      if (!canView || p.is_private) {
        return { ...p, photo_url: null, locked: true };
      }
      return p;
    });

    res.json({ photos: safePhotos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/add', requireAuth, async (req, res) => {
  const { photo_url, is_primary, is_private } = req.body;
  const user_id = req.userId;

  try {
    const maxPhotos = await getUserMaxPhotos(user_id);
    const { count, error: countError } = await supabaseAdmin.from('user_photos').select('*', { count: 'exact', head: true }).eq('user_id', user_id);
    if (countError) throw countError;

    if (count >= maxPhotos) {
      return res.status(403).json({ error: `Your plan allows only ${maxPhotos} photos.`, limit: maxPhotos, requiresUpgrade: true });
    }

    if (is_primary || count === 0) {
      await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', user_id);
    }

    const { data, error } = await supabaseAdmin.from('user_photos').insert({ user_id, photo_url, is_primary: is_primary || count === 0, is_private: is_private || false }).select().single();
    if (error) throw error;

    if (is_primary || count === 0) {
      await supabaseAdmin.from('users').update({ photo_url }).eq('id', user_id);
    }

    res.json({ photo: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:userId/privacy', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { is_private } = req.body;
  if (userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  try {
    const { error } = await supabaseAdmin.from('user_photos').update({ is_private }).eq('user_id', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:photoId', requireAuth, async (req, res) => {
  const { photoId } = req.params;
  try {
    const { data: photo, error: fetchError } = await supabaseAdmin.from('user_photos').select('*').eq('id', photoId).single();
    if (fetchError || !photo) return res.status(404).json({ error: "Photo not found" });
    if (photo.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    await supabaseAdmin.from('user_photos').delete().eq('id', photoId);

    if (photo.is_primary) {
      const { data: nextPhoto } = await supabaseAdmin.from('user_photos').select('*').eq('user_id', photo.user_id).order('created_at', { ascending: true }).limit(1).single();
      if (nextPhoto) {
        await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', nextPhoto.id);
        await supabaseAdmin.from('users').update({ photo_url: nextPhoto.photo_url }).eq('id', photo.user_id);
      } else {
        await supabaseAdmin.from('users').update({ photo_url: null }).eq('id', photo.user_id);
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:photoId/primary', requireAuth, async (req, res) => {
  const { photoId } = req.params;
  try {
    const { data: photo, error: fetchError } = await supabaseAdmin.from('user_photos').select('*').eq('id', photoId).single();
    if (fetchError || !photo) return res.status(404).json({ error: "Photo not found" });
    if (photo.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    await supabaseAdmin.from('user_photos').update({ is_primary: false }).eq('user_id', photo.user_id);
    await supabaseAdmin.from('user_photos').update({ is_primary: true }).eq('id', photoId);
    await supabaseAdmin.from('users').update({ photo_url: photo.photo_url }).eq('id', photo.user_id);

    res.json({ success: true, message: "Main photo updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
