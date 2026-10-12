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
// HELPER: Get user plan tier
// ============================================
async function getUserPlan(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) return 'free';
    return data.plan;
  } catch {
    return 'free';
  }
}

// ============================================
// HELPER: Compute age from DOB
// ============================================
function computeAgeFromDob(dob) {
  if (!dob) return null;
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  } catch {
    return null;
  }
}

// ============================================
// 1. ADVANCED SEARCH (Premium only filters)
// ============================================
router.get('/advanced-search', async (req, res) => {
  const {
    viewerId,
    gender, age_min, age_max, location, community, religion,
    education, income, marital_status, food_pref, has_horoscope, verified_only
  } = req.query;

  try {
    const plan = viewerId ? await getUserPlan(viewerId) : 'free';
    const isPremium = plan === 'gold' || plan === 'platinum';

    // Check if user tried to use premium filters
    const usingPremiumFilters =
      education || income || marital_status || food_pref ||
      has_horoscope === 'true' || verified_only === 'true';

    if (usingPremiumFilters && !isPremium) {
      return res.status(403).json({
        error: "Upgrade to Gold or Platinum to use advanced filters",
        requiresPremium: true,
      });
    }

    // ============================================
    // Build query — case-insensitive matching
    // ============================================
    let query = supabaseAdmin.from('users').select('*').eq('is_suspended', false);

    // Basic filters (always available) — ilike for text fields
    if (gender) query = query.ilike('gender', gender);

    // Location: match `location` OR `custom_fields->>place` (like basic search)
    if (location) {
      query = query.or(`location.ilike.%${location}%,custom_fields->>place.ilike.%${location}%`);
    }

    if (community) query = query.ilike('community', community);
    if (religion) query = query.ilike('religion', religion);

    // Premium filters — case-insensitive where appropriate
    if (isPremium) {
      if (education) query = query.ilike('education', `%${education}%`);
      if (income) query = query.ilike('income', `%${income}%`);
      if (marital_status) query = query.ilike('marital_status', `%${marital_status}%`);
      if (food_pref) query = query.ilike('food_pref', `%${food_pref}%`);
      if (has_horoscope === 'true') query = query.not('rasi', 'is', null);
      if (verified_only === 'true') query = query.eq('is_verified', true);
    }

    const { data, error } = await query.limit(300);
    if (error) throw error;

    const now = new Date();

    // ============================================
    // Age filter with DOB fallback (JS level)
    // ============================================
    const ageMin = age_min ? parseInt(age_min) : null;
    const ageMax = age_max ? parseInt(age_max) : null;

    const enriched = (data || []).map((u) => ({
      ...u,
      _finalAge: u.age && u.age > 0 ? u.age : computeAgeFromDob(u.dob),
    }));

    const ageFiltered = enriched.filter((u) => {
      if (ageMin === null && ageMax === null) return true;
      const age = u._finalAge;
      if (age === null || age === undefined || age === 0) return true; // include unknown ages
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });

    // Sort: boosted → verified → rest
    const sorted = ageFiltered.sort((a, b) => {
      const aBoost = a.boost_expires_at && new Date(a.boost_expires_at) > now;
      const bBoost = b.boost_expires_at && new Date(b.boost_expires_at) > now;
      if (aBoost && !bBoost) return -1;
      if (!aBoost && bBoost) return 1;
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return 0;
    });

    const masked = sorted.slice(0, 100).map((u) => {
      const { _finalAge, ...rest } = u;
      return {
        ...rest,
        age: _finalAge,
        mobile: u.contact_privacy === 'public' ? u.mobile : null,
        email: u.contact_privacy === 'public' ? u.email : null,
        is_boosted: u.boost_expires_at ? new Date(u.boost_expires_at) > now : false,
      };
    });

    res.json({
      results: masked,
      plan,
      isPremium,
      total: masked.length,
    });
  } catch (err) {
    console.error("Advanced search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2. TIERED RECOMMENDATIONS
// ============================================
router.get('/recommendations/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const plan = await getUserPlan(userId);

    const limits = {
      free: { count: 5, exclusive: false },
      gold: { count: 20, exclusive: false },
      platinum: { count: 100, exclusive: true },
    };
    const { count, exclusive } = limits[plan] || limits.free;

    const { data: me } = await supabaseAdmin
      .from('users').select('*').eq('id', userId).single();

    if (!me) return res.status(404).json({ error: "User not found" });

    const { data: sent } = await supabaseAdmin
      .from('interests').select('receiver_id').eq('sender_id', userId);

    const { data: shortlisted } = await supabaseAdmin
      .from('interests').select('shortlisted_user_id').eq('user_id', userId);

    const exclude = new Set([
      userId,
      ...(sent || []).map(i => i.receiver_id),
      ...(shortlisted || []).map(s => s.shortlisted_user_id),
    ]);

    const oppositeGender = (me.gender || '').toLowerCase() === 'male' ? 'female' : 'male';
    let query = supabaseAdmin
      .from('users').select('*')
      .ilike('gender', oppositeGender)
      .eq('is_suspended', false)
      .neq('id', userId)
      .limit(200);

    if (me.community) {
      query = query.ilike('community', me.community);
    }

    const { data: potential, error } = await query;
    if (error) throw error;

    const now = new Date();

    const scored = (potential || [])
      .filter(u => !exclude.has(u.id))
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
        if (me.pref_age_min && me.pref_age_max && u.age >= me.pref_age_min && u.age <= me.pref_age_max) score += 15;
        score += Math.random() * 3;

        return { ...u, match_score: Math.round(score) };
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, count);

    res.json({
      recommendations: scored,
      plan,
      count,
      exclusive,
      total_available: scored.length,
    });
  } catch (err) {
    console.error("Recommendations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. PLATINUM-ONLY "PREMIUM MATCHES"
// ============================================
router.get('/premium-matches/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const plan = await getUserPlan(userId);

    if (plan !== 'platinum') {
      return res.status(403).json({
        error: "Platinum plan required",
        requiresPlatinum: true,
      });
    }

    const { data: me } = await supabaseAdmin
      .from('users').select('*').eq('id', userId).single();

    const oppositeGender = (me.gender || '').toLowerCase() === 'male' ? 'female' : 'male';

    const { data, error } = await supabaseAdmin
      .from('users').select('*')
      .ilike('gender', oppositeGender)
      .eq('is_verified', true)
      .eq('is_suspended', false)
      .not('photo_url', 'is', null)
      .neq('id', userId)
      .limit(50);

    if (error) throw error;

    res.json({ matches: data || [], plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
