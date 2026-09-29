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
// HELPER: Check if two users have ANY interest (pending or accepted)
// ============================================
async function hasInterestOrMatch(user1, user2) {
  try {
    const { data, error } = await supabaseAdmin
      .from('interests')
      .select('status')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .in('status', ['pending', 'accepted'])
      .limit(1);

    if (error) return false;
    return data && data.length > 0;
  } catch (err) {
    return false;
  }
}

// ============================================
// HELPER: Get viewer's plan permissions
// ============================================
async function getViewerPermissions(viewerId) {
  try {
    if (!viewerId) return {};
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', viewerId)
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

    return planData?.permissions || {};
  } catch (err) {
    return {};
  }
}

// ============================================
// HELPER: Check if user has an active paid plan
// ============================================
async function isPaidUser(userId) {
  if (!userId) return false;
  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .in('plan', ['Gold', 'Platinum', 'gold', 'platinum'])
      .limit(1)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

// ============================================
// HELPER: Check if user has approved photo access
// ============================================
async function hasPhotoApproval(requesterId, ownerId) {
  if (!requesterId || !ownerId) return false;
  try {
    const { data } = await supabaseAdmin
      .from('photo_requests')
      .select('status')
      .eq('requester_id', requesterId)
      .eq('owner_id', ownerId)
      .eq('status', 'approved')
      .single();
    return !!data;
  } catch {
    return false;
  }
}

// ============================================
// 1. SEARCH PROFILES (with boost sorting)
// ============================================
router.get('/search', async (req, res) => {
  try {
    const { gender, age_min, age_max, location, community, religion } = req.query;
    let query = supabaseAdmin.from('users').select('*');

    if (gender) query = query.eq('gender', gender);
    if (age_min) query = query.gte('age', parseInt(age_min));
    if (age_max) query = query.lte('age', parseInt(age_max));
    if (location) query = query.ilike('location', `%${location}%`);
    if (community) query = query.eq('community', community);
    if (religion) query = query.eq('religion', religion);

    const { data, error } = await query.limit(50);
    if (error) throw error;

    const now = new Date();

    // Sort: Boosted profiles first, then verified, then the rest
    const sortedData = (data || []).sort((a, b) => {
      const aBoosted = a.boost_expires_at && new Date(a.boost_expires_at) > now;
      const bBoosted = b.boost_expires_at && new Date(b.boost_expires_at) > now;
      if (aBoosted && !bBoosted) return -1;
      if (!aBoosted && bBoosted) return 1;
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return 0;
    });

    const maskedData = sortedData.map(u => ({
      ...u,
      mobile: u.contact_privacy === 'public' ? u.mobile : null,
      email: u.contact_privacy === 'public' ? u.email : null,
      is_boosted: u.boost_expires_at ? new Date(u.boost_expires_at) > now : false,
    }));

    res.json({ results: maskedData });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. GET SINGLE PROFILE (With Privacy Rules)
// ============================================
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { viewerId } = req.query;

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const isOwner = viewerId === userId;
    const hasInteracted = viewerId ? await hasInterestOrMatch(viewerId, userId) : false;
    const viewerPerms = isOwner ? {} : await getViewerPermissions(viewerId);
    const viewerIsPaid = isOwner ? false : await isPaidUser(viewerId);
    const hasApproval = viewerId ? await hasPhotoApproval(viewerId, userId) : false;

    // Check viewer's verified status
    let viewerVerified = false;
    if (viewerId) {
      const { data: v } = await supabaseAdmin.from('users').select('is_verified').eq('id', viewerId).single();
      viewerVerified = !!v?.is_verified;
    }

    const now = new Date();
    const isBoosted = profile.boost_expires_at ? new Date(profile.boost_expires_at) > now : false;

    if (isOwner) {
      return res.json({ profile: { ...profile, is_boosted: isBoosted }, isMatch: false, isOwner });
    }

    // ============================================
    // 1. CHECK OWNER'S VISIBILITY SETTING
    // ============================================
    const visibility = profile.profile_visibility || 'everyone';
    let allowedToSee = true;

    if (visibility === 'paid' && !viewerIsPaid) allowedToSee = false;
    else if (visibility === 'verified' && !viewerVerified) allowedToSee = false;
    else if (visibility === 'matches' && !hasInteracted) allowedToSee = false;

    if (!allowedToSee) {
      return res.json({
        profile: {
          id: profile.id,
          name: profile.name,
          age: profile.age,
          location: profile.location,
          gender: profile.gender,
          is_verified: profile.is_verified,
          is_boosted: isBoosted,
          hidden_by_owner: true,
        },
        isMatch: false,
        isOwner: false,
        hidden: true,
      });
    }

    // ============================================
    // 2. MASK PRIVATE FIELDS
    // ============================================
    let maskedProfile = { ...profile };

    // Contact Privacy
    if (profile.contact_privacy === 'private') {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    } else if (profile.contact_privacy === 'matches' && !hasInteracted) {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    }
    if (!viewerPerms.contact_access) {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    }

    // DOB, Horoscope, Income (Premium)
    if (!viewerPerms.see_dob) maskedProfile.dob = null;
    if (!viewerPerms.see_horoscope) {
      maskedProfile.rasi = null;
      maskedProfile.nakshatra = null;
      maskedProfile.gothram = null;
    }
    if (!viewerPerms.see_income) maskedProfile.income = null;

    // Photo Blur Logic
    let shouldBlur = false;

    if (profile.photo_privacy === 'private') {
      shouldBlur = true;
    } else if (profile.photo_privacy === 'matches' && !hasInteracted) {
      shouldBlur = true;
    } else if (!viewerPerms.see_full_photo && !hasApproval) {
      shouldBlur = true;
    }

    // If viewer has approved photo request, unblur
    if (hasApproval) shouldBlur = false;

    maskedProfile.should_blur_photos = shouldBlur;
    maskedProfile.is_boosted = isBoosted;
    maskedProfile.viewer_is_paid = viewerIsPaid;
    maskedProfile.viewer_has_approval = hasApproval;

    res.json({ profile: maskedProfile, isMatch: hasInteracted, isOwner: false });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(404).json({ error: "Profile not found" });
  }
});

// ============================================
// 3. UPDATE PROFILE
// ============================================
router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ profile: data });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 4. SMART RECOMMENDATIONS (strict same community)
// ============================================
router.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: me, error: meError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (meError) throw meError;

    const { data: sentInterests } = await supabaseAdmin
      .from('interests')
      .select('receiver_id')
      .eq('sender_id', userId);

    const { data: shortlisted } = await supabaseAdmin
      .from('interests')
      .select('shortlisted_user_id')
      .eq('user_id', userId);

    const excludeIds = new Set([
      userId,
      ...(sentInterests || []).map(i => i.receiver_id),
      ...(shortlisted || []).map(s => s.shortlisted_user_id),
    ]);

    const oppositeGender = me.gender === 'male' ? 'female' : 'male';
    let query = supabaseAdmin
      .from('users')
      .select('*')
      .eq('gender', oppositeGender)
      .eq('is_suspended', false)
      .neq('id', userId)
      .limit(100);

    // STRICTLY MATCH SAME COMMUNITY
    const targetCommunity = me.community || me.pref_community;
    if (targetCommunity) {
      query = query.eq('community', targetCommunity);
    }

    if (me.pref_age_min) query = query.gte('age', me.pref_age_min);
    if (me.pref_age_max) query = query.lte('age', me.pref_age_max);

    const { data: potential, error: pError } = await query;
    if (pError) throw pError;

    const now = new Date();
    const scored = (potential || [])
      .filter(u => !excludeIds.has(u.id))
      .map(u => {
        let score = 0;
        if (u.photo_url) score += 20;
        if (u.bio && u.bio.length > 20) score += 10;
        if (u.is_verified) score += 15;
        if (u.boost_expires_at && new Date(u.boost_expires_at) > now) score += 25;
        if (u.community === me.community) score += 20;
        if (u.education && me.pref_education && u.education.includes(me.pref_education)) score += 10;
        if (u.location && me.pref_location && u.location.includes(me.pref_location)) score += 10;
        if (u.occupation && me.pref_occupation && u.occupation.includes(me.pref_occupation)) score += 5;
        score += Math.random() * 5;
        return { ...u, match_score: score };
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 6);

    res.json({ recommendations: scored });
  } catch (err) {
    console.error("Recommendation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 5. ADMIN STATS
// ============================================
router.get('/admin/stats', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('gender, is_verified, is_suspended, boost_expires_at');
    if (error) throw error;

    const now = new Date();
    const stats = {
      totalUsers: users.length,
      maleUsers: users.filter(u => u.gender === 'male').length,
      femaleUsers: users.filter(u => u.gender === 'female').length,
      verifiedUsers: users.filter(u => u.is_verified).length,
      suspendedUsers: users.filter(u => u.is_suspended).length,
      boostedUsers: users.filter(u => u.boost_expires_at && new Date(u.boost_expires_at) > now).length,
      totalMessages: 0,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 6. ADMIN: GET ALL USERS
// ============================================
router.get('/admin/users', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data, error } = await supabaseAdmin.from('users').select('*').limit(limit);
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 7. ADMIN: GET USER DETAILS
// ============================================
router.get('/admin/users/:id/details', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(404).json({ error: "User not found" });
  }
});

// ============================================
// 8. ADMIN: VERIFY USER
// ============================================
router.patch('/admin/users/:id/verify', async (req, res) => {
  try {
    const { is_verified } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_verified }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 9. ADMIN: SUSPEND USER
// ============================================
router.patch('/admin/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: true, suspend_reason: reason }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 10. ADMIN: UNSUSPEND USER
// ============================================
router.patch('/admin/users/:id/unsuspend', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: false, suspend_reason: null }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 11. ADMIN: CHANGE ROLE
// ============================================
router.patch('/admin/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ role }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// 12. ADMIN: DELETE USER
// ============================================
router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
