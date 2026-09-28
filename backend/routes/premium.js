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
    return data.plan; // 'gold' or 'platinum'
  } catch {
    return 'free';
  }
}

// ============================================
// 1. ADVANCED SEARCH (Premium only filters)
// ============================================
router.get('/advanced-search', async (req, res) => {
  const {
    viewerId,
    gender, age_min, age_max, location, community, religion,
    // Premium only:
    education, income, marital_status, food_pref, has_horoscope, verified_only
  } = req.query;

  try {
    const plan = viewerId ? await getUserPlan(viewerId) : 'free';
    const isPremium = plan === 'gold' || plan === 'platinum';

    // Check if user tried to use premium filters
    const usingPremiumFilters =
      education || income || marital_status || food_pref || has_horoscope || verified_only === 'true';

    if (usingPremiumFilters && !isPremium) {
      return res.status(403).json({
        error: "Upgrade to Gold or Platinum to use advanced filters",
        requiresPremium: true,
      });
    }

    // Build query
    let query = supabaseAdmin.from('users').select('*');

    // Basic filters (always available)
    if (gender) query = query.eq('gender', gender);
    if (age_min) query = query.gte('age', parseInt(age_min));
    if (age_max) query = query.lte('age', parseInt(age_max));
    if (location) query = query.ilike('location', `%${location}%`);
    if (community) query = query.eq('community', community);
    if (religion) query = query.eq('religion', religion);

    // Premium filters
    if (isPremium) {
      if (education) query = query.ilike('education', `%${education}%`);
      if (income) query = query.eq('income', income);
      if (marital_status) query = query.eq('marital_status', marital_status);
      if (food_pref) query = query.eq('food_pref', food_pref);
      if (has_horoscope === 'true') query = query.not('rasi', 'is', null);
      if (verified_only === 'true') query = query.eq('is_verified', true);
    }

    const { data, error } = await query.limit(100);
    if (error) throw error;

    const now = new Date();

    // Sort: boosted → verified → premium plan users → rest
    const sorted = (data || []).sort((a, b) => {
      const aBoost = a.boost_expires_at && new Date(a.boost_expires_at) > now;
      const bBoost = b.boost_expires_at && new Date(b.boost_expires_at) > now;
      if (aBoost && !bBoost) return -1;
      if (!aBoost && bBoost) return 1;
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return 0;
    });

    const masked = sorted.map(u => ({
      ...u,
      mobile: u.contact_privacy === 'public' ? u.mobile : null,
      email: u.contact_privacy === 'public' ? u.email : null,
      is_boosted: u.boost_expires_at ? new Date(u.boost_expires_at) > now : false,
    }));

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

    // Determine tier limits
    const limits = {
      free: { count: 5, exclusive: false },
      gold: { count: 20, exclusive: false },
      platinum: { count: 100, exclusive: true },
    };
    const { count, exclusive } = limits[plan] || limits.free;

    // Get current user's profile
    const { data: me } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!me) return res.status(404).json({ error: "User not found" });

    // Exclusions: already sent interest or shortlisted
    const { data: sent } = await supabaseAdmin
      .from('interests')
      .select('receiver_id')
      .eq('sender_id', userId);

    const { data: shortlisted } = await supabaseAdmin
      .from('interests')
      .select('shortlisted_user_id')
      .eq('user_id', userId);

    const exclude = new Set([
      userId,
      ...(sent || []).map(i => i.receiver_id),
      ...(shortlisted || []).map(s => s.shortlisted_user_id),
    ]);

    // Base query: opposite gender, same community
    const oppositeGender = me.gender === 'male' ? 'female' : 'male';
    let query = supabaseAdmin
      .from('users')
      .select('*')
      .eq('gender', oppositeGender)
      .eq('is_suspended', false)
      .neq('id', userId)
      .limit(200);

    if (me.community) {
      query = query.eq('community', me.community);
    }

    const { data: potential, error } = await query;
    if (error) throw error;

    const now = new Date();

    // Score each profile
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

    // Premium matches: verified + has photo + bio + paid plan
    const { data: me } = await supabaseAdmin
      .from('users').select('*').eq('id', userId).single();

    const oppositeGender = me.gender === 'male' ? 'female' : 'male';

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('gender', oppositeGender)
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
