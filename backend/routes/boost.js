import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAuth, requireAdmin } from '../utils/auth.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOOST_PRICE = 199;
const BOOST_DURATION_DAYS = 7;

// ============================================
// GET boost status for a user (🔒 Secured)
// ============================================
router.get('/status/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  // 🛡️ Security: Can only check your own boost status
  if (userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, boost_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

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
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ACTIVATE boost (Paid / Simulated)
// ============================================
router.post('/activate', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    // 🛡️ SECURITY FIX: Block simulated payments in production unless explicitly enabled
    const allowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS === 'true';
    if (!allowSimulated) {
      return res.status(402).json({ 
        error: "Payment gateway not integrated. Please contact admin to activate boost.",
        requiresPayment: true 
      });
    }

    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, boost_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr || !user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    const currentExpiry = user.boost_expires_at ? new Date(user.boost_expires_at) : null;
    const startFrom = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startFrom.getTime() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: newExpiry.toISOString() })
      .eq('id', userId);

    if (updateErr) throw updateErr;

    try {
      await supabaseAdmin.from('boost_history').insert({
        user_id: userId,
        expires_at: newExpiry.toISOString(),
        amount: BOOST_PRICE,
        payment_id: `SIM_BOOST_${Date.now()}`,
      });
    } catch (logErr) { console.warn("Boost history log failed:", logErr); }

    res.json({
      success: true,
      expiresAt: newExpiry.toISOString(),
      message: `Boost activated for ${BOOST_DURATION_DAYS} days!`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CLAIM FREE BOOST (🔒 Auth & Limit)
// ============================================
router.post('/claim-free', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    // 1. Check if user's plan allows free boost
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    const planName = sub?.plan || 'Free';
    
    const { data: planData } = await supabaseAdmin
      .from('membership_plans')
      .select('permissions')
      .ilike('name', planName)
      .single();

    const hasFreeBoost = planData?.permissions?.profile_boost === true;

    if (!hasFreeBoost) {
      return res.status(403).json({ error: "Your plan does not include free boosts." });
    }

    // 2. Fetch user details
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, boost_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr || !user) return res.status(404).json({ error: "User not found" });

    // 🛡️ SECURITY FIX: Prevent infinite stacking
    const now = new Date();
    if (user.boost_expires_at && new Date(user.boost_expires_at) > now) {
      return res.status(400).json({ error: "You already have an active boost." });
    }

    const newExpiry = new Date(now.getTime() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);

    await supabaseAdmin.from('users').update({ boost_expires_at: newExpiry.toISOString() }).eq('id', userId);

    try {
      await supabaseAdmin.from('boost_history').insert({
        user_id: userId,
        expires_at: newExpiry.toISOString(),
        amount: 0,
        payment_id: `PLAN_FREE_BOOST_${Date.now()}`,
      });
    } catch (logErr) {}

    res.json({ success: true, expiresAt: newExpiry.toISOString(), message: "Free boost activated!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Grant free boost
// ============================================
router.post('/admin/grant/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { days = 7 } = req.body;

  try {
    const { data: user, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr || !user) return res.status(404).json({ error: "User not found" });

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
    } catch (logErr) {}

    res.json({ success: true, expiresAt: newExpiry.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Remove boost
// ============================================
router.post('/admin/remove/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: null })
      .eq('id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
