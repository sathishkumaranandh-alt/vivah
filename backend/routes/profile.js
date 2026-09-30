import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  } catch { return false; }
}

async function getViewerPermissions(viewerId) {
  try {
    if (!viewerId) return {};

    // Get viewer's custom permissions
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('custom_permissions')
      .eq('id', viewerId)
      .single();

    const customPerms = userData?.custom_permissions || {};

    // If custom permissions has any keys, they override plan
    const hasCustomPerms = Object.keys(customPerms).length > 0;

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

    const planPerms = planData?.permissions || {};

    // Merge: custom permissions override plan
    return { ...planPerms, ...customPerms };
  } catch (err) {
    return {};
  }
}

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
  } catch { return false; }
}

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
  } catch { return false; }
}

// ============================================
// 1. SEARCH PROFILES (with community default + paid lock)
// ============================================
router.get('/search', async (req, res) => {
  try {
    const {
      gender, age_min, age_max, location, community, religion,
      viewerId, allCommunities
    } = req.query;

    let query = supabaseAdmin.from('users').select('*');

    if (gender) query = query.eq('gender', gender);
    if (location) query = query.ilike('location', `%${location}%`);
    if (religion) query = query.eq('religion', religion);

    // Community resolution
    if (community) {
      query = query.eq('community', community);
    } else if (allCommunities !== 'true' && viewerId) {
      const { data: viewer } = await supabaseAdmin
        .from('users')
        .select('community')
        .eq('id', viewerId)
        .single();
      if (viewer?.community) {
        query = query.eq('community', viewer.community);
      }
    }

    const { data, error } = await query.limit(200);
    if (error) throw error;

    const viewerPerms = viewerId ? await getViewerPermissions(viewerId) : {};
    const now = new Date();

    // Filter by age AFTER fetching (to include users with no age set)
    const ageMin = age_min ? parseInt(age_min) : null;
    const ageMax = age_max ? parseInt(age_max) : null;

    const filteredByAge = (data || []).filter(u => {
      if (!u.age || u.age === 0) return true; // include users without age
      if (ageMin !== null && u.age < ageMin) return false;
      if (ageMax !== null && u.age > ageMax) return false;
      return true;
    });

    const sortedData = filteredByAge.sort((a, b) => {
      const aBoosted = a.boost_expires_at && new Date(a.boost_expires_at) > now;
      const bBoosted = b.boost_expires_at && new Date(b.boost_expires_at) > now;
      if (aBoosted && !bBoosted) return -1;
      if (!aBoosted && bBoosted) return 1;
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return 0;
    });

    // Batch-check paid users
    const userIds = sortedData.map(u => u.id);
    const paidUserIds = new Set();
    if (userIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan, status, expires_at')
        .in('user_id', userIds)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .in('plan', ['Gold', 'Platinum', 'gold', 'platinum']);
      (subs || []).forEach(s => paidUserIds.add(s.user_id));
    }

    const maskedData = sortedData.slice(0, 50).map(u => {
      const ownerIsPaid = paidUserIds.has(u.id);
      const isViewer = viewerId === u.id;

      // Photo blur logic
      let shouldBlur = false;
      if (!isViewer) {
        if (ownerIsPaid && !viewerPerms.can_view_paid_profiles) {
          shouldBlur = true;
        } else if (u.photo_privacy === 'private') {
          shouldBlur = true;
        } else if (u.photo_privacy === 'matches' && !viewerPerms.can_view_paid_profiles) {
          shouldBlur = true;
        }
      }

      // Contact visibility: owner's PUBLIC setting wins
      let showContact = false;
      if (isViewer) {
        showContact = true;
      } else if (u.contact_privacy === 'public') {
        showContact = true; // owner explicitly public → show
      } else if (viewerPerms.contact_access) {
        showContact = true; // viewer has permission from plan
      }

      return {
        ...u,
        mobile: showContact ? u.mobile : null,
        email: showContact ? u.email : null,
        is_boosted: u.boost_expires_at ? new Date(u.boost_expires_at) > now : false,
        owner_is_paid: ownerIsPaid,
        should_blur_photo: shouldBlur,
      };
    });

    res.json({ results: maskedData });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET SINGLE PROFILE — CORRECTED LOGIC
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
    const ownerIsPaid = await isPaidUser(userId);
    const hasApproval = viewerId ? await hasPhotoApproval(viewerId, userId) : false;

    let viewerVerified = false;
    if (viewerId) {
      const { data: v } = await supabaseAdmin.from('users').select('is_verified').eq('id', viewerId).single();
      viewerVerified = !!v?.is_verified;
    }

    const now = new Date();
    const isBoosted = profile.boost_expires_at ? new Date(profile.boost_expires_at) > now : false;

    if (isOwner) {
      return res.json({
        profile: { ...profile, is_boosted: isBoosted, owner_is_paid: ownerIsPaid },
        isMatch: false,
        isOwner
      });
    }

    // Owner's visibility
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
          owner_is_paid: ownerIsPaid,
          hidden_by_owner: true,
        },
        isMatch: false,
        isOwner: false,
        hidden: true,
      });
    }

    let maskedProfile = { ...profile };
    let lockedByPaidMember = false;

    // Contact privacy from owner's settings
    if (profile.contact_privacy === 'private') {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    } else if (profile.contact_privacy === 'matches' && !hasInteracted) {
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    }

    // *** KEY FIX ***
    // Only lock if OWNER IS PAID and VIEWER is not allowed to see paid profiles
    if (ownerIsPaid && !viewerPerms.can_view_paid_profiles && !hasApproval) {
      lockedByPaidMember = true;
      maskedProfile.dob = null;
      maskedProfile.rasi = null;
      maskedProfile.nakshatra = null;
      maskedProfile.gothram = null;
      maskedProfile.income = null;
      maskedProfile.mobile = null;
      maskedProfile.email = null;
    }
    // Otherwise, if owner is FREE, viewer sees everything (subject only to owner's own privacy settings above)

    // Photo blur
    let shouldBlur = false;
    if (lockedByPaidMember) {
      shouldBlur = true;
    } else if (profile.photo_privacy === 'private') {
      shouldBlur = true;
    } else if (profile.photo_privacy === 'matches' && !hasInteracted) {
      shouldBlur = true;
    }
    // Note: removed the "!viewerPerms.see_full_photo" clause — that was blurring free-free interactions

    if (hasApproval) shouldBlur = false;

    maskedProfile.should_blur_photos = shouldBlur;
    maskedProfile.is_boosted = isBoosted;
    maskedProfile.viewer_is_paid = viewerIsPaid;
    maskedProfile.viewer_has_approval = hasApproval;
    maskedProfile.owner_is_paid = ownerIsPaid;
    maskedProfile.locked_by_paid_member = lockedByPaidMember;

    res.json({ profile: maskedProfile, isMatch: hasInteracted, isOwner: false });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(404).json({ error: "Profile not found" });
  }
});

// 3. UPDATE PROFILE (whitelist)
router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const updates = { ...req.body };

  const ALLOWED_COLUMNS = [
    "email", "name", "age", "gender", "religion", "caste", "sub_caste",
    "gothram", "horoscope", "rasi", "nakshatra", "location", "education",
    "occupation", "income", "college", "company", "work_location",
    "father_occ", "mother_occ", "brothers", "sisters", "family_type",
    "food_pref", "bio", "photo_url", "community", "marital_status",
    "mother_tongue", "profile_for", "dob", "mobile",
    "pref_age_min", "pref_age_max", "pref_height", "pref_community",
    "pref_education", "pref_occupation", "pref_location",
    "custom_fields", "photo_privacy", "contact_privacy",
    "profile_visibility", "updated_at",
  ];

  const safeUpdates = {};
  for (const key of ALLOWED_COLUMNS) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  safeUpdates.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(safeUpdates)
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

// 4. RECOMMENDATIONS
router.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: me, error: meError } = await supabaseAdmin
      .from('users').select('*').eq('id', userId).single();
    if (meError) throw meError;

    const { data: sentInterests } = await supabaseAdmin
      .from('interests').select('receiver_id').eq('sender_id', userId);

    const { data: shortlisted } = await supabaseAdmin
      .from('interests').select('shortlisted_user_id').eq('user_id', userId);

    const excludeIds = new Set([
      userId,
      ...(sentInterests || []).map(i => i.receiver_id),
      ...(shortlisted || []).map(s => s.shortlisted_user_id),
    ]);

    const oppositeGender = me.gender === 'male' ? 'female' : 'male';
    let query = supabaseAdmin
      .from('users').select('*')
      .eq('gender', oppositeGender)
      .eq('is_suspended', false)
      .neq('id', userId)
      .limit(100);

    const targetCommunity = me.community || me.pref_community;
    if (targetCommunity) query = query.eq('community', targetCommunity);
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
        score += Math.random() * 5;
        return { ...u, match_score: score };
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 6);

    res.json({ recommendations: scored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5-12. ADMIN ROUTES (unchanged)
router.get('/admin/stats', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users').select('gender, is_verified, is_suspended, boost_expires_at');
    if (error) throw error;
    const now = new Date();
    res.json({
      totalUsers: users.length,
      maleUsers: users.filter(u => u.gender === 'male').length,
      femaleUsers: users.filter(u => u.gender === 'female').length,
      verifiedUsers: users.filter(u => u.is_verified).length,
      suspendedUsers: users.filter(u => u.is_suspended).length,
      boostedUsers: users.filter(u => u.boost_expires_at && new Date(u.boost_expires_at) > now).length,
      totalMessages: 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/users', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data, error } = await supabaseAdmin.from('users').select('*').limit(limit);
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/users/:id/details', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ user: data });
  } catch { res.status(404).json({ error: "User not found" }); }
});

router.patch('/admin/users/:id/verify', async (req, res) => {
  try {
    const { is_verified } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_verified }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: true, suspend_reason: reason }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/unsuspend', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').update({ is_suspended: false, suspend_reason: null }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/admin/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({ role }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/users/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
