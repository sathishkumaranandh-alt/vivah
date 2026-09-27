import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
      email_confirm: true, // Auto-confirm so they can log in immediately
      user_metadata: { community: data.community }
    });

    if (authError) throw authError;
    const userId = authData.user.id;

    // 2. Save the full profile to the users table
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

    res.json({ message: "Registration successful", userId });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;