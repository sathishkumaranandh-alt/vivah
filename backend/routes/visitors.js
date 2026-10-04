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

const DEFAULT_FREE_PERMS = {
  daily_interests: 5, daily_recommendations: 5, max_photos: 3,
  advanced_search: false, see_visitors: false, unlimited_chat: false,
  profile_boost: false, contact_access: false, priority_support: false,
  see_dob: false, see_horoscope: false, see_income: false,
  interest_to_anyone: false, see_full_photo: false, request_photo: true,
  can_view_paid_profiles: false,
};

function perm(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function getActiveSubscription(userId) {
  if (!userId) return null;
  try {
    const { data } = await supabaseAdmin.from('subscriptions')
      .select('plan, status, started_at, expires_at, created_at')
      .eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).single();
    return data || null;
  } catch { return null; }
}

async function getPlanPermissions(planName) {
  if (!planName) return null;
  try {
    const { data } = await supabaseAdmin.from('membership_plans')
      .select('permissions, name, duration_days')
      .ilike('name', planName.trim()).eq('is_active', true).single();
    return data || null;
  } catch { return null; }
}

async function isPaidUser(userId) {
  if (!userId) return false;
  try {
    const sub = await getActiveSubscription(userId);
    if (!sub) return false;
    const plan = (sub.plan || '').toLowerCase();
    if (plan === 'free' || plan === '') return false;
    if (sub.expires_at) return new Date(sub.expires_at) > new Date();
    return false;
  } catch { return false; }
}

async function getViewerPermissions(viewerId) {
  try {
    if (!viewerId) return { ...DEFAULT_FREE_PERMS };
    const { data: userData } = await supabaseAdmin.from('users').select('custom_permissions').eq('id', viewerId).single();
    const customPerms = userData?.custom_permissions || {};
    const sub = await getActiveSubscription(viewerId);
    const planData = await getPlanPermissions(sub?.plan || 'Free');
    const planPerms = planData?.permissions || {};
    return { ...DEFAULT_FREE_PERMS, ...planPerms, ...customPerms };
  } catch { return { ...DEFAULT_FREE_PERMS }; }
}

async function hasPhotoApproval(requesterId, ownerId) {
  if (!requesterId || !ownerId) return false;
  try {
    const { data } = await supabaseAdmin.from('photo_requests').select('status')
      .eq('requester_id', requesterId).eq('owner_id', ownerId).eq('status', 'approved').single();
    return !!data;
  } catch { return false; }
}

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
  } catch { return false; }
}

async function hasInterestOrMatch(user1, user2) {
  if (!user1 || !user2) return false;
  try {
    const { data } = await supabaseAdmin
      .from('interests').select('status')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .in('status', ['pending', 'accepted']).limit(1);
    return data && data.length > 0;
  } catch { return false; }
}

// ============================================
// POST /visitors/log - Log a profile view + Telegram notify
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
    await supabaseAdmin.from('profile_views').insert({
      viewer_id: viewerId,
      viewed_id: viewedId
    });
    console.log("Profile view logged for viewedId:", viewedId);

    const ownerCanSee = await canSeeVisitors(viewedId);
    console.log("Owner can see visitors?", ownerCanSee);

    if (!ownerCanSee) {
      console.log("Owner is not a paid member. No Telegram sent.");
      return res.json({ success: true, notified: false, reason: "Not a paid member" });
    }

    const { data: owner } = await supabaseAdmin
      .from('users')
      .select('telegram_chat_id, telegram_opt_in')
      .eq('id', viewedId)
      .single();

    if (owner?.telegram_opt_in && owner?.telegram_chat_id) {
      const tgResult = await sendTelegram(
        owner.telegram_chat_id,
        `👀 <b>Profile View</b>\n\nSomeone just viewed your profile.\n\nTap to see who → https://vivaha-frontend.vercel.app/visitors`
      );
      console.log("TELEGRAM API RESULT:", tgResult);
      console.log("--- END VISITOR NOTIFICATION ---");
      return res.json({ success: true, notified: true, telegram_response: tgResult });
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
// GET /visitors/list/:userId - Visitors list with privacy rules
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

    // Deduplicate - keep only most recent view per viewer
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
      .select('id, name, age, location, photo_url, community, is_verified, gender, dob, photo_privacy, profile_visibility, contact_privacy, boost_expires_at, is_suspended')
      .in('id', viewerIds);

    if (userError) throw userError;

    // ============================================
    // PRIVACY RULES APPLICATION
    // ============================================

    // userId = person whose visitor list is being viewed (e.g., Kala)
    const listViewerIsPaid = await isPaidUser(userId);
    const listViewerPerms = await getViewerPermissions(userId);
    const listViewerCanViewPaid = listViewerIsPaid || perm(listViewerPerms.can_view_paid_profiles);
    const listViewerCanSeeFullPhoto = listViewerIsPaid && perm(listViewerPerms.see_full_photo);

    // Check paid status of all visitors
    const paidVisitorIds = new Set();
    if (viewerIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from('subscriptions').select('user_id, plan, status, expires_at')
        .in('user_id', viewerIds).eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .in('plan', ['Gold', 'Platinum', 'gold', 'platinum', 'GOLD', 'PLATINUM']);
      (subs || []).forEach(s => paidVisitorIds.add(s.user_id));
    }

    // Check photo approvals: does the list viewer have photo approval from each visitor?
    const approvedPhotoIds = new Set();
    if (viewerIds.length > 0) {
      const { data: pa } = await supabaseAdmin
        .from('photo_requests').select('owner_id')
        .eq('requester_id', userId).eq('status', 'approved').in('owner_id', viewerIds);
      (pa || []).forEach(a => approvedPhotoIds.add(a.owner_id));
    }

    // Check mutual interest/match between userId and each visitor
    // Used for 'matches' photo_privacy setting
    const matchContext = {};
    if (viewerIds.length > 0) {
      const { data: interests } = await supabaseAdmin
        .from('interests').select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .in('status', ['pending', 'accepted']);

      (interests || []).forEach(i => {
        const otherId = i.sender_id === userId ? i.receiver_id : i.sender_id;
        if (viewerIds.includes(otherId)) {
          matchContext[otherId] = true;
        }
      });
    }

    const now = new Date();

    const visitors = uniqueViews.map(view => {
      const user = users.find(u => u.id === view.viewer_id);
      if (!user) return null;

      const visitorIsPaid = paidVisitorIds.has(user.id);
      const isSelf = user.id === userId;
      const freeViewingPaid = visitorIsPaid && !listViewerCanViewPaid;
      const hasPhotoApproved = approvedPhotoIds.has(user.id);

      // PHOTO BLUR LOGIC
      let shouldBlur = false;
      if (!isSelf) {
        if (freeViewingPaid) {
          // Paid visitor + Free list viewer = Paid Member Lock
          shouldBlur = true;
        } else if (hasPhotoApproved) {
          shouldBlur = false;
        } else if (listViewerCanSeeFullPhoto && visitorIsPaid) {
          // Paid + Paid + see_full_photo = bypass privacy
          shouldBlur = false;
        } else if (user.photo_privacy === 'private') {
          shouldBlur = true;
        } else if (user.photo_privacy === 'matches' && !matchContext[user.id]) {
          // Matches privacy: blur if NO mutual interest
          shouldBlur = true;
        }
      }

      return {
        id: user.id,
        name: user.name,
        age: user.age,
        gender: user.gender,
        location: user.location,
        photo_url: user.photo_url,
        community: user.community,
        is_verified: user.is_verified,
        is_boosted: user.boost_expires_at ? new Date(user.boost_expires_at) > now : false,
        owner_is_paid: visitorIsPaid,
        should_blur_photo: shouldBlur,
        viewed_at: view.created_at,
      };
    }).filter(v => v && v.id);

    res.json({ visitors });
  } catch (err) {
    console.error("Visitors list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
