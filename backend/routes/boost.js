import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOOST_PRICE = 199;
const BOOST_DURATION_DAYS = 7;

// ============================================
// GET boost status for a user
// ============================================
router.get('/status/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    // ✅ FIX: Use maybeSingle() — no error if user not found
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, boost_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error("Boost status query error:", error);
      throw error;
    }

    // User not found — treat as no boost
    if (!data) {
      return res.json({
        isActive: false,
        expiresAt: null,
        daysLeft: 0,
        price: BOOST_PRICE,
        duration: BOOST_DURATION_DAYS,
      });
    }

    const expiresAt = data.boost_expires_at ? new Date(data.boost_expires_at) : null;
    const isActive = !!(expiresAt && expiresAt > new Date());
    const daysLeft = isActive
      ? Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      isActive,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysLeft,
      price: BOOST_PRICE,
      duration: BOOST_DURATION_DAYS,
    });
  } catch (err) {
    console.error("Boost status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ACTIVATE boost
// ============================================
router.post('/activate', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    // ✅ FIX: Use maybeSingle()
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, boost_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("Boost activate fetch error:", fetchErr);
      throw fetchErr;
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const currentExpiry = user.boost_expires_at
      ? new Date(user.boost_expires_at)
      : null;

    // If already active, extend from current expiry. Otherwise start from now.
    const startFrom = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(
      startFrom.getTime() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: newExpiry.toISOString() })
      .eq('id', userId);

    if (updateErr) throw updateErr;

    // Log history (safe insert — don't break if table missing)
    try {
      await supabaseAdmin.from('boost_history').insert({
        user_id: userId,
        expires_at: newExpiry.toISOString(),
        amount: BOOST_PRICE,
        payment_id: `SIM_BOOST_${Date.now()}`,
      });
    } catch (logErr) {
      console.warn("Boost history log failed:", logErr);
    }

    res.json({
      success: true,
      expiresAt: newExpiry.toISOString(),
      message: `Boost activated for ${BOOST_DURATION_DAYS} days!`,
    });
  } catch (err) {
    console.error("Boost activate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Grant free boost
// ============================================
router.post('/admin/grant/:userId', async (req, res) => {
  const { userId } = req.params;
  const { days = 7 } = req.body;

  try {
    // Check user exists
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    const newExpiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { error } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: newExpiry.toISOString() })
      .eq('id', userId);

    if (error) throw error;

    try {
      await supabaseAdmin.from('boost_history').insert({
        user_id: userId,
        expires_at: newExpiry.toISOString(),
        amount: 0,
        payment_id: `ADMIN_GRANT_${Date.now()}`,
      });
    } catch (logErr) {
      console.warn("Boost history log failed:", logErr);
    }

    res.json({ success: true, expiresAt: newExpiry.toISOString() });
  } catch (err) {
    console.error("Admin grant boost error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Remove boost
// ============================================
router.post('/admin/remove/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: null })
      .eq('id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Admin remove boost error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
