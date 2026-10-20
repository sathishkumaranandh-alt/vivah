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

// Helper to calculate age from DOB
function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

// 🛡️ Helper to escape HTML (Prevents Telegram HTML Injection)
const escapeHtml = (str) => {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

// POST /auth/signup - Handles full registration
router.post('/signup', async (req, res) => {
  const data = req.body;

  // 🛡️ VALIDATION FIX
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!data.email || !emailRegex.test(data.email)) {
    return res.status(400).json({ error: "Valid email address is required" });
  }
  if (!data.password || data.password.length < 6 || data.password.length > 72) {
    return res.status(400).json({ error: "Password must be between 6 and 72 characters" });
  }
  if (!data.name || !data.gender) {
    return res.status(400).json({ error: "Name and Gender are required" });
  }

  let userId = null;

  try {
    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim(),
      password: data.password,
      email_confirm: true,
      user_metadata: { community: data.community }
    });

    if (authError) throw authError;
    userId = authData.user.id;

    // 2. Save the full profile to the users table
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .upsert([{
        id: userId,
        email: data.email.trim(),
        community: data.community,
        role: 'user',
        profile_for: data.profile_for,
        name: data.name.trim(),
        gender: data.gender.toLowerCase(),
        dob: data.dob || null,
        marital_status: data.marital_status,
        mother_tongue: data.mother_tongue,
        religion: data.religion,
        caste: data.caste,
        sub_caste: data.sub_caste || null,
        gothram: data.gothram || null,
        horoscope: data.horoscope,
        rasi: data.rasi || null,
        nakshatra: data.nakshatra || null,
        education: data.education,
        occupation: data.occupation,
        income: data.income || null,
        college: data.college || null,
        company: data.company || null,
        work_location: data.work_location || null,
        father_occ: data.father_occ || null,
        mother_occ: data.mother_occ || null,
        brothers: parseInt(data.brothers) || 0,
        sisters: parseInt(data.sisters) || 0,
        family_type: data.family_type,
        food_pref: data.food_pref,
        bio: data.bio || null,
        pref_age_min: parseInt(data.pref_age_min) || null,
        pref_age_max: parseInt(data.pref_age_max) || null,
        pref_height: data.pref_height || null,
        pref_community: data.pref_community || null,
        pref_education: data.pref_education || null,
        pref_occupation: data.pref_occupation || null,
        pref_location: data.pref_location || null,
        mobile: data.mobile,
        custom_fields: data.custom_fields || {},
        updated_at: new Date().toISOString(),
      }]);

    if (dbError) {
      // 🛡️ ORPHAN USER FIX: If DB fails, delete the Auth user
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(console.error);
      throw new Error("Database error");
    }

    // ==========================================
    // 3. TELEGRAM MATCH NOTIFICATION
    // ==========================================
    console.log("--- STARTING TELEGRAM MATCH ---");
    const newUserAge = calculateAge(data.dob);
    const newUserGender = data.gender?.toLowerCase();

    // Fetch all users who have Telegram enabled
    const { data: paidUsers, error: paidError } = await supabaseAdmin
      .from('users')
      .select(`id, name, gender, telegram_chat_id, pref_age_min, pref_age_max, pref_community`)
      .not('telegram_chat_id', 'is', null)
      .eq('telegram_opt_in', true);

    if (paidError) console.error("Paid users query error:", paidError);

    if (paidUsers && paidUsers.length > 0) {
      const userIds = paidUsers.map(u => u.id);
      
      const { data: activeSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .in('user_id', userIds)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString());

      const paidUserIds = new Set((activeSubs || []).map(s => s.user_id));

      const matchedPaidUsers = paidUsers.filter(paidUser => {
        if (!paidUserIds.has(paidUser.id)) return false;
        if (paidUser.id === userId) return false;

        const paidUserGender = paidUser.gender?.toLowerCase();
        let genderMatch = false;
        if (paidUserGender === 'male') genderMatch = (newUserGender === 'female');
        else if (paidUserGender === 'female') genderMatch = (newUserGender === 'male');
        else genderMatch = true;

        const ageMatch = (!paidUser.pref_age_min || newUserAge >= paidUser.pref_age_min) &&
                         (!paidUser.pref_age_max || newUserAge <= paidUser.pref_age_max);

        const communityMatch = !paidUser.pref_community || 
                               paidUser.pref_community === data.community ||
                               paidUser.pref_community.toLowerCase() === 'any';

        return genderMatch && ageMatch && communityMatch;
      });

      console.log("Matched users to notify:", matchedPaidUsers.length);

      // 🛡️ PERFORMANCE FIX: Send Telegram messages in parallel using Promise.all
      // 🛡️ XSS FIX: Escape user input before putting into HTML message
      const safeName = escapeHtml(data.name);
      const safeCommunity = escapeHtml(data.community || 'Not specified');
      const safeGender = data.gender ? escapeHtml(data.gender.charAt(0).toUpperCase() + data.gender.slice(1)) : 'Not specified';

      await Promise.all(matchedPaidUsers.map(match => {
        const msg = `
🌟 <b>New Match Alert!</b>

A new profile matching your preferences just registered.

<b>Name:</b> ${safeName}
<b>Age:</b> ${newUserAge || 'Not specified'}
<b>Gender:</b> ${safeGender}
<b>Community:</b> ${safeCommunity}

<a href="https://vivaha-frontend.vercel.app/profile/${userId}">View Profile</a>
        `;
        
        return sendTelegram(match.telegram_chat_id, msg).catch(() => null);
      }));
    } else {
      console.log("No telegram-enabled users found.");
    }
    console.log("--- END TELEGRAM MATCH ---");

    res.json({ message: "Registration successful", userId });
  } catch (err) {
    console.error("Signup error:", err);
    
    // 🛡️ ERROR MASKING FIX: Don't expose raw DB errors to client
    let errorMessage = "Registration failed. Please try again.";
    if (err.message?.includes("already registered")) errorMessage = "This email is already registered.";
    if (err.message?.includes("password")) errorMessage = "Password is too weak.";
    
    res.status(400).json({ error: errorMessage });
  }
});

export default router;
