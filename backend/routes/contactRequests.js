import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// REQUEST contact access
router.post('/request', async (req, res) => {
  const { requester_id, owner_id } = req.body;
  if (!requester_id || !owner_id) return res.status(400).json({ error: "Missing IDs" });
  if (requester_id === owner_id) return res.status(400).json({ error: "Cannot request own contact" });

  try {
    const { data, error } = await supabaseAdmin
      .from('contact_requests')
      .upsert({ requester_id, owner_id, status: 'pending' }, { onConflict: 'requester_id,owner_id' })
      .select()
      .single();
    if (error) throw error;

    // Notify owner
    try {
      const { data: requester } = await supabaseAdmin
        .from('users').select('name').eq('id', requester_id).single();

      const { error: notifError } = await supabaseAdmin.from('notifications').insert({
        user_id: owner_id,
        actor_id: requester_id,                    // ✅ ADDED
        type: 'contact_request',                   // ✅ ADDED
        title: '📞 New Contact Request',
        body: `${requester?.name || "Someone"} wants to view your contact info`,  // ✅ body
        link: '/contact-requests',                 // ✅ ADDED
        is_read: false,
      });

      if (notifError) console.error("Notification insert error:", notifError);
    } catch (notifErr) {
      console.error("Notification error:", notifErr);
    }

    res.json({ request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INCOMING
router.get('/incoming/:ownerId', async (req, res) => {
  const { ownerId } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('contact_requests')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (data || []).map(r => r.requester_id);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, age, location, photo_url')
      .in('id', ids);

    const enriched = (data || []).map(r => ({
      ...r,
      requester: users?.find(u => u.id === r.requester_id),
    }));

    res.json({ requests: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESPOND
router.put('/respond/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('contact_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Notify requester
    try {
      const { data: owner } = await supabaseAdmin
        .from('users').select('name').eq('id', data.owner_id).single();

      const isApproved = status === 'approved';
      const { error: notifError } = await supabaseAdmin.from('notifications').insert({
        user_id: data.requester_id,                // ✅ requester
        actor_id: data.owner_id,                   // ✅ ADDED
        type: isApproved ? 'contact_request_accepted' : 'contact_request_declined',  // ✅ ADDED
        title: isApproved ? '✅ Contact Access Approved' : '❌ Contact Request Denied',
        body: isApproved
          ? `${owner?.name || "User"} approved your contact request`   // ✅ body
          : `${owner?.name || "User"} denied your contact request`,
        link: isApproved
          ? `/profile/${data.owner_id}`            // ✅ go to profile
          : '/contact-requests',                    // ✅ or requests page
        is_read: false,
      });

      if (notifError) console.error("Notification insert error:", notifError);
    } catch (notifErr) {
      console.error("Notification error:", notifErr);
    }

    res.json({ request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STATUS
router.get('/status/:requesterId/:ownerId', async (req, res) => {
  const { requesterId, ownerId } = req.params;
  try {
    const { data } = await supabaseAdmin
      .from('contact_requests')
      .select('status')
      .eq('requester_id', requesterId)
      .eq('owner_id', ownerId)
      .single();
    res.json({ status: data?.status || 'none' });
  } catch {
    res.json({ status: 'none' });
  }
});

export default router;
