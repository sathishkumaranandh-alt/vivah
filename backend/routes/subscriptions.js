import express from "express";
import supabase from "../supabaseClient.js";
import { requireAdmin } from "../utils/auth.js";

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
// GET /subscriptions/user/:userId
// Get current user's subscription
// ============================================================
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

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
// POST /subscriptions/create
// ✅ FIXED: Dynamic plan lookup (DB first, then fallback)
// ============================================================
router.post("/create", async (req, res) => {
  try {
    const { user_id, plan } = req.body;

    if (!user_id || !plan) {
      return res.status(400).json({ error: "Missing user_id or plan" });
    }

    // 🔧 Dynamic plan lookup — check DB first, then fallback to hardcoded
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

    // Free plan = no expiry; paid plans = duration_days
    // 9999 days = Lifetime (no expiry set)
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

    // Create new subscription
    const { data, error } = await supabase
      .from("subscriptions")
      .insert([
        {
          user_id,
          plan: planConfig.name.toLowerCase(), // ✅ lowercase for consistency
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
// POST /subscriptions/cancel
// Cancel a subscription
// ============================================================
router.post("/cancel", async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

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
// Get all subscriptions with user info
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
// Revenue & subscription statistics
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
// Grant free premium to a user
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
// Extend a subscription
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
// Delete a subscription record
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
