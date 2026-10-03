import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sendTelegram } from '../utils/telegram.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// HELPER: Check if a user's plan has see_visitors permission
// ============================================
async function canSeeVisitors(userId) {
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
      .select('permissions')
      .ilike('name', planName)
      .eq('is_active', true)
      .single();

    const perms = planData?.permissions || {};
    const val = perms.see_visitors;
    return val === true || val === "true";
  } catch {
    return false;
  }
}

// ============================================
// LOG A PROFILE VIEW + Notify (paid only)
// ============================================
router.post('/log', async (req, res) => {
  console.log("--- STARTING VISITOR NOTIFICATION ---");
  const { viewerId, viewedId } = req.body;
  
  if (!viewerId || !viewedId) {
    console.log("Missing IDs in request body");
    return res.status(400).json({ error: "Missing IDs" });
  }
  if (viewerId === viewedId) {
    console.log("Self view ignored");
    return res.json({ message: "Self view ignored" });
  }

  try {
    // 1. Log the view
    await supabaseAdmin.from('profile_views').insert({
      viewer_id: viewerId,
      viewed_id: viewedId
    });
    console.log("Profile view logged for viewedId:", viewedId);

    // 2. Check if owner has see_visitors permission
    const ownerCanSee = await canSeeVisitors(viewedId);
    console.log("Owner can see visitors?", ownerCanSee);
    
    if (!ownerCanSee) {
      console.log("Owner is not a paid member. No Telegram sent.");
      return res.json({ success: true, notified: false, reason: "Not a paid member" });
    }

    // 3. Check if owner has Telegram enabled
    const { data: owner } = await supabaseAdmin
      .from('users')
      .select('telegram_chat_id, telegram_opt_in')
      .eq('id', viewedId)
      .single();

    console.log("Owner Telegram Opt-in:", owner?.telegram_opt_in);
    console.log("Owner Telegram Chat ID:", owner?.telegram_chat_id);

    if (owner?.telegram_opt_in && owner?.telegram_chat_id) {
      const tgResult = await sendTelegram(
        owner.telegram_chat_id,
        `👀 <b>Profile View</b>\n\nSomeone just viewed your profile.\n\nTap to see who → https://vivaha-frontend.vercel.app/visitors`
      );
      
      console.log("TELEGRAM API RESULT:", tgResult);
      console.log("--- END VISITOR NOTIFICATION ---");
      
      return res.json({ 
        success: true, 
        notified: true, 
        telegram_response: tgResult 
      });
    }

    console.log("Owner does not have Telegram linked or opted-in.");
    console.log("--- END VISITOR NOTIFICATION ---");
    res.json({ success: true, notified: false, reason: "Telegram not linked" });

  } catch (err) {
    console.error("View log error:", err);
    console.log("--- END VISITOR NOTIFICATION ---");
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET VISITORS FOR A USER (existing logic)
// ============================================
router.get('/list/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: views, error: viewError } = await supabaseAdmin
      .from('profile_views')
      .select('viewer_id, created_at')
      .eq('viewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (viewError) throw viewError;
    if (!views || views.length === 0) return res.json({ visitors: [] });

    const uniqueViews = [];
    const seenViewers = new Set();
    for (const view of views) {
      if (!seenViewers.has(view.viewer_id)) {
        seenViewers.add(view.viewer_id);
        uniqueViews.push(view);
      }
    }

    const viewerIds = [...seenViewers];

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, age, location, photo_url, community, is_verified')
      .in('id', viewerIds);

    if (userError) throw userError;

    const visitors = uniqueViews.map(view => {
      const user = users.find(u => u.id === view.viewer_id);
      return { ...user, viewed_at: view.created_at };
    }).filter(v => v.id);

    res.json({ visitors });
  } catch (err) {
    console.error("Visitors list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
