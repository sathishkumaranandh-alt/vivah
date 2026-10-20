import express from 'express';
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

// ============================================
// 1. CREATE ORDER
// ============================================
router.post('/create-order', requireAuth, async (req, res) => {
  const { planName, amount } = req.body;
  const userId = req.userId;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('name, mobile, email')
      .eq('id', userId)
      .single();

    const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const request = {
      order_amount: Number(amount),
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: userId,
        customer_name: userData?.name || 'Vivaha User',
        customer_email: userData?.email || 'user@vivaha.com',
        customer_phone: userData?.mobile || '9999999999',
      },
      order_meta: {
        return_url: `https://vivaha-frontend.vercel.app/subscription?order_id=${orderId}`,
      },
      order_note: `Upgrade to ${planName} plan`,
    };

    const response = await Cashfree.PGCreateOrder(request);

    res.json({
      success: true,
      order_id: orderId,
      payment_session_id: response.data.payment_session_id,
      amount,
      planName,
      cashfree_env: process.env.CASHFREE_ENV || 'SANDBOX',
    });
  } catch (err) {
    console.error('Cashfree create order error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ============================================
// 2. VERIFY PAYMENT
// ============================================
router.post('/verify-payment', requireAuth, async (req, res) => {
  const { order_id, planName } = req.body;
  const userId = req.userId;

  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });

  try {
    const response = await Cashfree.PGFetchOrder(order_id);
    const orderStatus = response.data.order_status;

    if (orderStatus !== 'PAID') {
      return res.status(400).json({
        error: `Payment not completed. Status: ${orderStatus}`,
      });
    }

    const { data: planData } = await supabaseAdmin
      .from('membership_plans')
      .select('*')
      .ilike('name', planName)
      .single();

    if (!planData) return res.status(404).json({ error: 'Plan not found' });

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (planData.duration_days || 30) * 24 * 60 * 60 * 1000
    );

    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

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
          payment_id: response.data.cf_payment_id || order_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;

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

export default router;
