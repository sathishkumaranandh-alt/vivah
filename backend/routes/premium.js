import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAuth } from '../utils/auth.js'; // 🛡️ Added
import { publicUser } from '../utils/privacy.js'; // 🛡️ Added
import { safeFilterText } from '../utils/sanitize.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 🛡️ Helper to escape PostgREST special characters
const escapeLike = (str) => {
  if (!str) return str;
  return str.replace(/[%_,()]/g, '\\$&');
};

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
router.get('/advanced-search', requireAuth, async (req, res) => {
  const viewerId = req.userId; // 🛡️ From JWT, not query

  const {
    gender, age_min, age_max, location, community, religion,
    education, income, marital_status, food_pref, has_horoscope, verified_only
  } = req.query;

  try {
    const plan = await getUserPlan(viewerId);
    const isPremium = plan === 'gold' || plan === 'platinum';

    const usingPremiumFilters =
      education || income || marital_status || food_pref ||
      has_horoscope === 'true' || verified_only === 'true';

    if (usingPremiumFilters && !isPremium) {
      return res.status(403).json({
        error: "Upgrade to Gold or Platinum to use advanced filters",
        requiresPremium: true,
      });
    }

    let query = supabaseAdmin.from('users').select('*').eq('is_suspended', false);

    if (gender) query = query.ilike('gender', gender);

    // 🛡️ FIX: Escape location to prevent SQL Injection
    if (location) {
      const safeLoc = safeFilterText(location);
      if (safeLoc) {
        query = query.or(`location.ilike.%${safeLoc}%,custom_fields->>place.ilike.%${safeLoc}%`);
      }
    }

    if (community) query = query.ilike('community', escapeLike(community));
    if (religion) query = query.ilike('religion', escapeLike(religion));

    if (isPremium) {
      if (education) query = query.ilike('education', `%${escapeLike(education)}%`);
      if (income) query = query.ilike('income', `%${escapeLike(income)}%`);
      if (marital_status) query = query.ilike('marital_status', `%${escapeLike(marital_status)}%`);
      if (food_pref) query = query.ilike('food_pref', `%${escapeLike(food_pref)}%`);
      if (has_horoscope === 'true') query = query.not('rasi', 'is', null);
      if (verified_only === 'true') query = query.eq('is_verified', true);
    }

    const { data, error } = await query.limit(300);
    if (error) throw error;

    const now = new Date();
    const ageMin = age_min ? parseInt(age_min) : null;
    const ageMax = age_max ? parseInt(age_max) : null;

    const enriched = (data || []).map((u) => ({
      ...u,
      _finalAge: u.age && u.age > 0 ? u.age : computeAgeFromDob(u.dob),
    }));

    const ageFiltered = enriched.filter((u) => {
      if (ageMin === null && ageMax === null) return true;
      const age = u._finalAge;
      if (age === null || age === undefined || age === 0) return true;
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });

    const sorted = ageFiltered.sort((a, b) => {
      const aBoost = a.boost_expires_at && new Date(a.boost_expires_at) > now;
      const bBoost = b.boost_expires_at && new Date(b.boost_expires_at) > now;
      if (aBoost && !bBoost) return -1;
      if (!aBoost && bBoost) return 1;
      if (a.is_verified && !b.is_verified) return -1;
      if (!a.is_verified && b.is_verified) return 1;
      return 0;
    });

    // 🛡️ FIX: Mask data using publicUser & hide private photos
    const masked = sorted.slice(0, 100).map((u) => {
      const { _finalAge, ...rest } = u;
      const isPublicContact = u.contact_privacy === 'public';
      
      // publicUser strips telegram, role, etc. keepContact=true keeps mobile/email
      const safeUser = publicUser(rest, isPublicContact);

      // Hide photo if privacy is private
      if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') {
        safeUser.photo_url = null;
        safeUser.should_blur_photo = true;
      }

      return {
        ...safeUser,
        age: _finalAge,
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
router.get('/recommendations/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  // 🛡️ FIX: Ensure user is requesting their own recommendations
  if (userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

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

    // 🛡️ FIX: Mask data
    const safeScored = scored.map(u => {
      const safeUser = publicUser(u, false); // false = hide contact info
      if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') {
        safeUser.photo_url = null;
        safeUser.should_blur_photo = true;
      }
      return safeUser;
    });

    res.json({
      recommendations: safeScored,
      plan,
      count,
      exclusive,
      total_available: safeScored.length,
    });
  } catch (err) {
    console.error("Recommendations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. PLATINUM-ONLY "PREMIUM MATCHES"
// ============================================
router.get('/premium-matches/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  // 🛡️ FIX: Ensure user is requesting their own matches
  if (userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

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

    if (!me) return res.status(404).json({ error: "User not found" });

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

    // 🛡️ FIX: Mask data
    const safeMatches = (data || []).map(u => {
      const safeUser = publicUser(u, false);
      if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') {
        safeUser.photo_url = null;
        safeUser.should_blur_photo = true;
      }
      return safeUser;
    });

    res.json({ matches: safeMatches, plan });
  } catch (err) {
    console.error("Premium matches error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
      
