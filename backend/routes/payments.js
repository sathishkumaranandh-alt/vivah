import express from 'express';
import crypto from 'crypto';
import { Cashfree } from 'cashfree-pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { requireAuth } from '../utils/auth.js';

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cashfree Config
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment =
  process.env.CASHFREE_ENV === 'PRODUCTION'
    ? Cashfree.Environment.PRODUCTION
    : Cashfree.Environment.SANDBOX;

// 🛡️ Boost price is decided by the SERVER (same value as routes/boost.js)
const BOOST_PRICE = Number(process.env.BOOST_PRICE) || 199;
const BOOST_DURATION_DAYS = 7;
const AMOUNT_TOLERANCE = 0.01;

// 🛡️ Escape % _ \ so a plan name can never act as a wildcard in ilike
const escapeIlike = (s) => String(s).replace(/[\\%_]/g, '\\$&');

const newOrderId = (prefix) =>
  `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const isSafeOrderId = (id, prefix) =>
  typeof id === 'string' && id.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(id);

async function findActivePlan(planName) {
  if (!planName || typeof planName !== 'string' || planName.length > 50) return null;
  const { data } = await supabaseAdmin
    .from('membership_plans')
    .select('*')
    .ilike('name', escapeIlike(planName.trim()))
    .limit(1)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  return data;
}

async function getCustomerDetails(userId) {
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('name, mobile, email')
    .eq('id', userId)
    .single();

  // Cashfree requires a valid 10-digit phone number. Fallback if empty.
  let phone = userData?.mobile || '9999999999';
  if (phone.length < 10) phone = '9999999999';

  return {
    customer_id: userId,
    customer_name: userData?.name || 'Vivaha User',
    customer_email: userData?.email || 'user@vivaha.com',
    customer_phone: phone,
  };
}

function cashfreeErrorMessage(err, fallback) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response?.data) return JSON.stringify(err.response.data);
  return err?.message || fallback;
}

// ============================================
// 1. CREATE ORDER  (🛡️ price comes from DB, never from client)
// ============================================
router.post('/create-order', requireAuth, async (req, res) => {
  const { planName } = req.body; // client "amount" is intentionally ignored
  const userId = req.userId;

  try {
    const plan = await findActivePlan(planName);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const price = Number(plan.price);
    if (!(price > 0)) {
      return res.status(400).json({ error: 'This plan is free. No payment needed.' });
    }

    const orderId = newOrderId('order');

    const request = {
      order_amount: price,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: await getCustomerDetails(userId),
      order_meta: {
        return_url: `https://vivaha-frontend.vercel.app/subscription?order_id=${orderId}`,
      },
      order_note: `Upgrade to ${plan.name} plan`,
    };

    const response = await Cashfree.PGCreateOrder('2023-08-01', request);

    res.json({
      success: true,
      order_id: orderId,
      payment_session_id: response.data.payment_session_id,
      amount: price,
      planName: plan.name,
      cashfree_env: process.env.CASHFREE_ENV || 'SANDBOX',
    });
  } catch (err) {
    console.error('Cashfree create order error:', err?.response?.data || err.message);
    res.locals.exposeError = true; // frontend shows the gateway message to the user
    res.status(500).json({ error: cashfreeErrorMessage(err, 'Failed to create payment order') });
  }
});

// ============================================
// 2. VERIFY PAYMENT
// ============================================
router.post('/verify-payment', requireAuth, async (req, res) => {
  const { order_id, planName } = req.body;
  const userId = req.userId;

  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });
  // 🛡️ Only plan orders can activate a plan (a cheap boost order cannot)
  if (!isSafeOrderId(order_id, 'order')) {
    return res.status(400).json({ error: 'Invalid order_id' });
  }

  try {
    // 🛡️ Replay protection: one paid order can activate exactly once
    const { data: used } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('payment_id', order_id)
      .limit(1)
      .maybeSingle();

    if (used) {
      if (used.user_id !== userId) {
        return res.status(409).json({ error: 'This payment was already used.' });
      }
      // Same user retrying (e.g. network drop) — return the existing result
      return res.json({
        success: true,
        message: 'Payment verified & plan activated!',
        subscription: used,
      });
    }

    const response = await Cashfree.PGFetchOrder('2023-08-01', order_id);
    const order = response.data;

    if (order.order_status !== 'PAID') {
      return res.status(400).json({
        error: `Payment not completed. Status: ${order.order_status}`,
      });
    }

    // 🛡️ The paid order must belong to THIS user
    if (order.customer_details?.customer_id !== userId) {
      console.warn('🚫 verify-payment: order owner mismatch', { userId, order_id });
      return res.status(403).json({ error: 'This order does not belong to you.' });
    }

    const planData = await findActivePlan(planName);
    if (!planData) return res.status(404).json({ error: 'Plan not found in DB' });

    // 🛡️ Amount actually paid must cover the plan price
    if (Number(order.order_amount) + AMOUNT_TOLERANCE < Number(planData.price)) {
      console.warn('🚫 verify-payment: amount mismatch', { userId, order_id, paid: order.order_amount, price: planData.price });
      return res.status(400).json({ error: 'Paid amount does not match the selected plan.' });
    }

    // 🛡️ The order was created for this plan (order_note is set server-side)
    if (order.order_note && order.order_note !== `Upgrade to ${planData.name} plan`) {
      return res.status(400).json({ error: 'This order was created for a different plan.' });
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (planData.duration_days || 30) * 24 * 60 * 60 * 1000
    );

    // Insert new subscription first (payment_id = order_id, used for replay check)
    const { data: sub, error } = await supabaseAdmin
      .from('subscriptions')
      .insert([
        {
          user_id: userId,
          plan: planData.name.toLowerCase(),
          status: 'active',
          amount: planData.price,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          payment_id: order_id,
        },
      ])
      .select()
      .single();

    if (error) {
      // Unique-index race (two verifies at once): treat as already processed
      if (error.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('subscriptions').select('*').eq('payment_id', order_id).maybeSingle();
        if (existing?.user_id === userId) {
          return res.json({ success: true, message: 'Payment verified & plan activated!', subscription: existing });
        }
        return res.status(409).json({ error: 'This payment was already used.' });
      }
      throw error;
    }

    // Cancel the user's OTHER active subscriptions
    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
      .neq('id', sub.id);

    res.json({
      success: true,
      message: 'Payment verified & plan activated!',
      subscription: sub,
    });
  } catch (err) {
    console.error('Cashfree verify error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ============================================
// 3. CREATE BOOST ORDER  (🛡️ fixed server-side price)
// ============================================
router.post('/create-boost-order', requireAuth, async (req, res) => {
  const userId = req.userId; // client "amount" is intentionally ignored

  try {
    const orderId = newOrderId('boost');

    const request = {
      order_amount: BOOST_PRICE,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: await getCustomerDetails(userId),
      order_meta: {
        return_url: `https://vivaha-frontend.vercel.app/boost?order_id=${orderId}`,
      },
      order_note: `Profile Boost`,
    };

    const response = await Cashfree.PGCreateOrder('2023-08-01', request);

    res.json({
      success: true,
      order_id: orderId,
      payment_session_id: response.data.payment_session_id,
      cashfree_env: process.env.CASHFREE_ENV || 'SANDBOX',
    });
  } catch (err) {
    console.error('Cashfree boost order error:', err?.response?.data || err.message);
    res.locals.exposeError = true;
    res.status(500).json({ error: cashfreeErrorMessage(err, 'Failed to create boost order') });
  }
});

// ============================================
// 4. VERIFY BOOST PAYMENT
// ============================================
router.post('/verify-boost-payment', requireAuth, async (req, res) => {
  const { order_id } = req.body;
  const userId = req.userId;

  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });
  if (!isSafeOrderId(order_id, 'boost')) {
    return res.status(400).json({ error: 'Invalid order_id' });
  }

  try {
    // 🛡️ Replay protection
    const { data: used } = await supabaseAdmin
      .from('boost_history')
      .select('user_id, expires_at')
      .eq('payment_id', order_id)
      .limit(1)
      .maybeSingle();

    if (used) {
      if (used.user_id !== userId) {
        return res.status(409).json({ error: 'This payment was already used.' });
      }
      return res.json({
        success: true,
        message: 'Boost activated for 7 days!',
        expiresAt: used.expires_at,
      });
    }

    const response = await Cashfree.PGFetchOrder('2023-08-01', order_id);
    const order = response.data;

    if (order.order_status !== 'PAID') {
      return res.status(400).json({ error: `Payment not completed. Status: ${order.order_status}` });
    }

    if (order.customer_details?.customer_id !== userId) {
      console.warn('🚫 verify-boost: order owner mismatch', { userId, order_id });
      return res.status(403).json({ error: 'This order does not belong to you.' });
    }

    if (Number(order.order_amount) + AMOUNT_TOLERANCE < BOOST_PRICE) {
      return res.status(400).json({ error: 'Paid amount does not match the boost price.' });
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Log history FIRST so a repeated verify is detected as a replay
    const { error: logErr } = await supabaseAdmin.from('boost_history').insert({
      user_id: userId,
      expires_at: newExpiry.toISOString(),
      amount: order.order_amount,
      payment_id: order_id,
    });
    if (logErr) {
      if (logErr.code === '23505') {
        return res.status(409).json({ error: 'This payment was already used.' });
      }
      console.warn('Boost history log failed:', logErr);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ boost_expires_at: newExpiry.toISOString() })
      .eq('id', userId);
    if (updateErr) throw updateErr;

    res.json({
      success: true,
      message: 'Boost activated for 7 days!',
      expiresAt: newExpiry.toISOString(),
    });
  } catch (err) {
    console.error('Cashfree verify boost error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ============================================
// 5. CASHFREE WEBHOOK  (🛡️ server-to-server confirmation)
// If the user pays and closes the browser, Cashfree still tells us and the
// plan / boost is activated here. Nothing in the body is trusted: the
// signature is checked, then the order is fetched again from Cashfree.
// ============================================
function webhookSignatureOk(req) {
  try {
    const secret = process.env.CASHFREE_SECRET_KEY;
    const ts = req.headers['x-webhook-timestamp'];
    const sig = req.headers['x-webhook-signature'];
    if (!secret || !ts || !sig || !req.rawBody) return false;
    const expected = crypto.createHmac('sha256', secret).update(String(ts) + req.rawBody.toString('utf8')).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

router.post('/webhook', async (req, res) => {
  if (!webhookSignatureOk(req)) {
    console.warn('🚫 Cashfree webhook: bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const orderId = req.body?.data?.order?.order_id;
    const type = req.body?.type;
    // Only successful-payment events matter; acknowledge everything else
    if (type !== 'PAYMENT_SUCCESS_WEBHOOK' || typeof orderId !== 'string' || orderId.length > 64) {
      return res.json({ received: true, ignored: true });
    }

    const response = await Cashfree.PGFetchOrder('2023-08-01', orderId);
    const order = response.data;
    if (order.order_status !== 'PAID') return res.json({ received: true, ignored: true });

    const userId = order.customer_details?.customer_id;
    if (!userId) return res.json({ received: true, ignored: true });
    const now = new Date();

    // ---- Plan order ----
    if (isSafeOrderId(orderId, 'order')) {
      const { data: used } = await supabaseAdmin.from('subscriptions').select('id').eq('payment_id', orderId).limit(1).maybeSingle();
      if (used) return res.json({ received: true, already: true });

      const m = /^Upgrade to (.+) plan$/.exec(order.order_note || '');
      const planData = m ? await findActivePlan(m[1]) : null;
      if (!planData) { console.warn('Webhook: plan not found for', orderId); return res.json({ received: true, ignored: true }); }
      if (Number(order.order_amount) + AMOUNT_TOLERANCE < Number(planData.price)) {
        console.warn('🚫 Webhook: amount mismatch', orderId);
        return res.json({ received: true, ignored: true });
      }

      const expiresAt = new Date(now.getTime() + (planData.duration_days || 30) * 24 * 60 * 60 * 1000);
      const { data: sub, error } = await supabaseAdmin.from('subscriptions').insert([{
        user_id: userId, plan: planData.name.toLowerCase(), status: 'active', amount: planData.price,
        started_at: now.toISOString(), expires_at: expiresAt.toISOString(), payment_id: orderId,
      }]).select().single();
      if (error) {
        if (error.code === '23505') return res.json({ received: true, already: true });
        throw error;
      }
      await supabaseAdmin.from('subscriptions')
        .update({ status: 'cancelled', updated_at: now.toISOString() })
        .eq('user_id', userId).eq('status', 'active').neq('id', sub.id);
      return res.json({ received: true, activated: 'plan' });
    }

    // ---- Boost order ----
    if (isSafeOrderId(orderId, 'boost')) {
      const { data: used } = await supabaseAdmin.from('boost_history').select('id').eq('payment_id', orderId).limit(1).maybeSingle();
      if (used) return res.json({ received: true, already: true });
      if (Number(order.order_amount) + AMOUNT_TOLERANCE < BOOST_PRICE) {
        console.warn('🚫 Webhook: boost amount mismatch', orderId);
        return res.json({ received: true, ignored: true });
      }
      const newExpiry = new Date(now.getTime() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);
      const { error: logErr } = await supabaseAdmin.from('boost_history').insert({
        user_id: userId, expires_at: newExpiry.toISOString(), amount: order.order_amount, payment_id: orderId,
      });
      if (logErr) {
        if (logErr.code === '23505') return res.json({ received: true, already: true });
        console.warn('Webhook: boost history failed', logErr);
      }
      await supabaseAdmin.from('users').update({ boost_expires_at: newExpiry.toISOString() }).eq('id', userId);
      return res.json({ received: true, activated: 'boost' });
    }

    res.json({ received: true, ignored: true });
  } catch (err) {
    console.error('Cashfree webhook error:', err?.response?.data || err.message);
    // 500 → Cashfree retries later
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
