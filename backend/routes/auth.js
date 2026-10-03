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

// POST /auth/signup - Handles full registration
router.post('/signup', async (req, res) => {
  const data = req.body;

  if (!data.email || !data.password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { community: data.community }
    });

    if (authError) throw authError;
    const userId = authData.user.id;

    // 2. Save the full profile to the users table (RESTORED ALL FIELDS)
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .upsert([{
        id: userId,
        email: data.email,
        community: data.community,
        role: 'user',
        profile_for: data.profile_for,
        name: data.name,
        gender: data.gender,
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

    if (dbError) throw dbError;

    // ==========================================
    // 3. TELEGRAM MATCH NOTIFICATION
    // ==========================================
    console.log("--- STARTING TELEGRAM MATCH ---");
    const newUserAge = calculateAge(data.dob);
    console.log("New user age:", newUserAge, "| Community:", data.community);

    // Fetch all users who have Telegram enabled
    const { data: paidUsers, error: paidError } = await supabaseAdmin
      .from('users')
      .select(`id, name, telegram_chat_id, pref_age_min, pref_age_max, pref_community`)
      .not('telegram_chat_id', 'is', null)
      .eq('telegram_opt_in', true);

    if (paidError) console.error("Paid users query error:", paidError);

    if (paidUsers && paidUsers.length > 0) {
      console.log("Found telegram-enabled users:", paidUsers.length);
      
      const userIds = paidUsers.map(u => u.id);
      
      // Check which of these users have an ACTIVE paid subscription
      const { data: activeSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .in('user_id', userIds)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString());

      const paidUserIds = new Set((activeSubs || []).map(s => s.user_id));
      console.log("Active paid users found:", paidUserIds.size);

      // Filter paid users who match the new user's profile
      const matchedPaidUsers = paidUsers.filter(paidUser => {
        // 1. Must have an active paid subscription
        if (!paidUserIds.has(paidUser.id)) return false;
        
        // 2. Must not be the new user themselves
        if (paidUser.id === userId) return false;

        // 3. Age match
        const ageMatch = (!paidUser.pref_age_min || newUserAge >= paidUser.pref_age_min) &&
                         (!paidUser.pref_age_max || newUserAge <= paidUser.pref_age_max);

        // 4. Community match (if they specified a preference)
        const communityMatch = !paidUser.pref_community || 
                               paidUser.pref_community === data.community ||
                               paidUser.pref_community.toLowerCase() === 'any';

        return ageMatch && communityMatch;
      });

      console.log("Matched users to notify:", matchedPaidUsers.length);

      // Send Telegram message to each matched paid user
      for (const match of matchedPaidUsers) {
        console.log("Sending Telegram to:", match.name, "| Chat ID:", match.telegram_chat_id);
        const msg = `
🌟 <b>New Match Alert!</b>

A new profile matching your preferences just registered.

<b>Name:</b> ${data.name}
<b>Age:</b> ${newUserAge || 'Not specified'}
<b>Community:</b> ${data.community || 'Not specified'}

<a href="https://vivaha-frontend.vercel.app/profile/${userId}">View Profile</a>
        `;
        
        // CRITICAL: We use 'await' here to ensure the message sends before the server responds
        await sendTelegram(match.telegram_chat_id, msg);
      }
    } else {
      console.log("No telegram-enabled users found.");
    }
    console.log("--- END TELEGRAM MATCH ---");

    res.json({ message: "Registration successful", userId });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
