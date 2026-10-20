import express from "express";
import supabase from "../supabaseClient.js";
import { requireAdmin, requireAuth } from "../utils/auth.js"; // 🛡️ Added requireAuth

const router = express.Router();

// ============================================================
// FALLBACK PLANS (in ₹) — used only if DB lookup fails
// ============================================================
const PLANS = {
  free: { name: "Free", price: 0, durationDays: null },
  gold: { name: "Gold", price: 499, durationDays: 30 },
  platinum: { name: "Platinum", price: 999, durationDays: 90 },
};

// ============================================================
// GET /subscriptions/user/:userId (🔒 Auth Required)
// ============================================================
router.get("/user/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // 🛡️ SECURITY FIX: Only allow users to view their own subscription (or admin)
    if (userId !== req.userId) {
      return res.status(403).json({ error: "Forbidden: You cannot view others' subscriptions" });
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({
        subscription: {
          user_id: userId,
          plan: "free",
          status: "active",
          amount: 0,
          started_at: null,
          expires_at: null,
        },
      });
    }

    let subscription = data;
    if (
      subscription.expires_at &&
      new Date(subscription.expires_at) < new Date() &&
      subscription.status === "active"
    ) {
      await supabase
        .from("subscriptions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      subscription = { ...subscription, status: "expired" };
    }

    res.json({ subscription });
  } catch (err) {
    console.error("Get subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /subscriptions/my-subscription (🔒 New secure route)
// ============================================================
router.get("/my-subscription", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ subscription: null });
    }

    let subscription = data;
    if (
      subscription.expires_at &&
      new Date(subscription.expires_at) < new Date() &&
      subscription.status === "active"
    ) {
      await supabase
        .from("subscriptions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      subscription = { ...subscription, status: "expired" };
    }

    res.json({ subscription });
  } catch (err) {
    console.error("My subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /subscriptions/create (🔒 Auth & Payment Gate)
// ============================================================
router.post("/create", requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: user_id comes from JWT, not body
    const user_id = req.userId;
    const { plan } = req.body;

    if (!plan) {
      return res.status(400).json({ error: "Missing plan" });
    }

    // 🛡️ SECURITY FIX: Block simulated payments in production unless explicitly enabled
    const allowSimulated = process.env.ALLOW_SIMULATED_PAYMENTS === 'true';
    if (!allowSimulated) {
      return res.status(402).json({ 
        error: "Payment gateway not integrated. Please contact admin to grant premium.",
        requiresPayment: true 
      });
    }

    let planConfig = null;

    // Try DB lookup (case-insensitive)
    const { data: dbPlan } = await supabase
      .from("membership_plans")
      .select("name, price, duration_days, permissions")
      .ilike("name", plan)
      .eq("is_active", true)
      .maybeSingle();

    if (dbPlan) {
      planConfig = {
        name: dbPlan.name,
        price: dbPlan.price || 0,
        durationDays: dbPlan.duration_days || 30,
      };
    } else if (PLANS[plan]) {
      planConfig = PLANS[plan];
    } else {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const now = new Date();
    let expiresAt = null;

    if (
      planConfig.durationDays &&
      planConfig.durationDays !== 9999 &&
      planConfig.durationDays !== null
    ) {
      const expDate = new Date(now);
      expDate.setDate(expDate.getDate() + planConfig.durationDays);
      expiresAt = expDate.toISOString();
    }

    // Cancel any existing active subscriptions
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("user_id", user_id)
      .eq("status", "active");

    const { data, error } = await supabase
      .from("subscriptions")
      .insert([
        {
          user_id,
          plan: planConfig.name.toLowerCase(),
          status: "active",
          amount: planConfig.price,
          started_at: now.toISOString(),
          expires_at: expiresAt,
          payment_id: `SIM_${Date.now()}`,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: `Subscribed to ${planConfig.name} plan!`,
      subscription: data,
    });
  } catch (err) {
    console.error("Create subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /subscriptions/cancel (🔒 Auth Required)
// ============================================================
router.post("/cancel", requireAuth, async (req, res) => {
  try {
    // 🛡️ SECURITY FIX: user_id comes from JWT
    const user_id = req.userId;

    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("status", "active")
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    res.json({ message: "Subscription cancelled", subscription: data });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 ADMIN: GET /subscriptions/admin/all
// ============================================================
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const userIds = [...new Set((subs || []).map((s) => s.user_id))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email, photo_url")
        .in("id", userIds);
      (users || []).forEach((u) => {
        userMap[u.id] = u;
      });
    }

    const enriched = (subs || []).map((s) => ({
      ...s,
      user: userMap[s.user_id] || null,
    }));

    res.json({ subscriptions: enriched, total: enriched.length });
  } catch (err) {
    console.error("Admin subscriptions error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 ADMIN: GET /subscriptions/admin/stats
// ============================================================
router.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { data: allSubs } = await supabase
      .from("subscriptions")
      .select("*");

    const subs = allSubs || [];

    const totalRevenue = subs
      .filter((s) => s.status === "active" || s.status === "expired")
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    const activeSubs = subs.filter((s) => s.status === "active");
    const goldCount = activeSubs.filter((s) => s.plan === "gold").length;
    const platinumCount = activeSubs.filter(
      (s) => s.plan === "platinum"
    ).length;

    const mrr = activeSubs.reduce((sum, s) => sum + (s.amount || 0), 0);

    res.json({
      totalRevenue,
      mrr,
      activeSubscriptions: activeSubs.length,
      goldCount,
      platinumCount,
      totalSubscriptions: subs.length,
    });
  } catch (err) {
    console.error("Subscription stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 ADMIN: PATCH /subscriptions/admin/grant/:userId
// ============================================================
router.patch("/admin/grant/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, days } = req.body;

    if (!PLANS[plan] || plan === "free") {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const now = new Date();
    const expDate = new Date(now);
    expDate.setDate(expDate.getDate() + (days || PLANS[plan].durationDays));

    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    const { data, error } = await supabase
      .from("subscriptions")
      .insert([
        {
          user_id: userId,
          plan,
          status: "active",
          amount: 0,
          started_at: now.toISOString(),
          expires_at: expDate.toISOString(),
          payment_id: `GIFT_${Date.now()}`,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: `Gifted ${PLANS[plan].name} plan for ${
        days || PLANS[plan].durationDays
      } days`,
      subscription: data,
    });
  } catch (err) {
    console.error("Grant subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 ADMIN: PATCH /subscriptions/admin/extend/:userId
// ============================================================
router.patch("/admin/extend/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { days } = req.body;

    if (!days || days < 1) {
      return res.status(400).json({ error: "Invalid days" });
    }

    const { data: current, error: fetchError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!current) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    const baseDate = current.expires_at
      ? new Date(current.expires_at)
      : new Date();
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + days);

    const { data, error } = await supabase
      .from("subscriptions")
      .update({
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: `Extended by ${days} days`,
      subscription: data,
    });
  } catch (err) {
    console.error("Extend subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🔒 ADMIN: DELETE /subscriptions/admin/:subscriptionId
// ============================================================
router.delete("/admin/:subscriptionId", requireAdmin, async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", subscriptionId);

    if (error) throw error;

    res.json({ message: "Subscription deleted" });
  } catch (err) {
    console.error("Delete subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🌍 GET /subscriptions/plans
// List all ACTIVE plans from DATABASE (dynamic)
// ============================================================
router.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;

    const plans = (data || []).map((p) => ({
      id: (p.name || "").toLowerCase().replace(/\s+/g, "_"),
      name: p.name,
      price: p.price || 0,
      duration:
        p.duration_days === 9999
          ? "Lifetime"
          : `${p.duration_days || 30} days`,
      features: p.features || [],
      popular: p.name === "Gold" || p.is_popular === true,
      permissions: p.permissions || {},
      display_order: p.display_order || 0,
      is_active: p.is_active,
    }));

    res.json({ plans });
  } catch (err) {
    console.error("Get plans error:", err);
    // Fallback to hardcoded plans if DB fails
    res.json({
      plans: [
        {
          id: "free",
          name: "Free",
          price: 0,
          duration: "Lifetime",
          features: [
            "Create profile",
            "View up to 10 profiles/day",
            "Send up to 3 messages/day",
            "Basic search",
          ],
        },
        {
          id: "gold",
          name: "Gold",
          price: 499,
          duration: "30 days",
          popular: true,
          features: [
            "Unlimited profile views",
            "Unlimited messages",
            "See who viewed your profile",
            "Advanced search filters",
            "Priority customer support",
          ],
        },
        {
          id: "platinum",
          name: "Platinum",
          price: 999,
          duration: "90 days",
          features: [
            "Everything in Gold",
            "Featured profile (top of search)",
            "Verified badge",
            "Profile boost weekly",
            "Direct contact details access",
            "Dedicated relationship manager",
          ],
        },
      ],
    });
  }
});

export default router;
