import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// POST /interests/send
// Send an interest to another user
// ============================================================
router.post("/send", async (req, res) => {
  try {
    const { sender_id, receiver_id, message } = req.body;

    if (!sender_id || !receiver_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot send interest to yourself" });
    }

    // Check if interest already exists in either direction
    const { data: existing } = await supabase
      .from("interests")
      .select("*")
      .or(
        `and(sender_id.eq.${sender_id},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${sender_id})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        return res.status(400).json({ error: "You are already connected" });
      }
      if (existing.status === "pending") {
        return res.status(400).json({ error: "Interest already sent" });
      }
      // If declined, allow re-sending by updating
      if (existing.status === "declined" && existing.sender_id === sender_id) {
        const { data, error } = await supabase
          .from("interests")
          .update({
            status: "pending",
            created_at: new Date().toISOString(),
            responded_at: null,
            message: message || null,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.json({ message: "Interest re-sent", interest: data });
      }
      return res.status(400).json({ error: "Cannot send interest to this user" });
    }

    const { data, error } = await supabase
      .from("interests")
      .insert([
        {
          sender_id,
          receiver_id,
          status: "pending",
          message: message || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Interest sent!", interest: data });
  } catch (err) {
    console.error("Send interest error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /interests/respond/:interestId
// Accept or decline an interest
// ============================================================
router.patch("/respond/:interestId", async (req, res) => {
  try {
    const { interestId } = req.params;
    const { status } = req.body;

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await supabase
      .from("interests")
      .update({
        status,
        responded_at: new Date().toISOString(),
      })
      .eq("id", interestId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: `Interest ${status}`, interest: data });
  } catch (err) {
    console.error("Respond interest error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/received/:userId
// List interests RECEIVED by this user (with sender profiles)
// ============================================================
router.get("/received/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query = supabase
      .from("interests")
      .select("*")
      .eq("receiver_id", userId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const senderIds = [...new Set((data || []).map((i) => i.sender_id))];
    let userMap = {};
    if (senderIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified")
        .in("id", senderIds);
      (users || []).forEach((u) => { userMap[u.id] = u; });
    }

    const enriched = (data || []).map((i) => ({
      ...i,
      sender: userMap[i.sender_id] || null,
    }));

    res.json({ interests: enriched, total: enriched.length });
  } catch (err) {
    console.error("Received interests error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/sent/:userId
// List interests SENT by this user
// ============================================================
router.get("/sent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query = supabase
      .from("interests")
      .select("*")
      .eq("sender_id", userId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const receiverIds = [...new Set((data || []).map((i) => i.receiver_id))];
    let userMap = {};
    if (receiverIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified")
        .in("id", receiverIds);
      (users || []).forEach((u) => { userMap[u.id] = u; });
    }

    const enriched = (data || []).map((i) => ({
      ...i,
      receiver: userMap[i.receiver_id] || null,
    }));

    res.json({ interests: enriched, total: enriched.length });
  } catch (err) {
    console.error("Sent interests error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/count/:userId
// Count pending received interests (for badge)
// ============================================================
router.get("/count/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { count, error } = await supabase
      .from("interests")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("status", "pending");

    if (error) throw error;
    res.json({ pendingCount: count || 0 });
  } catch (err) {
    console.error("Interest count error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/status/:userId/:otherId
// Check relationship status between two users
// ============================================================
router.get("/status/:userId/:otherId", async (req, res) => {
  try {
    const { userId, otherId } = req.params;

    const { data, error } = await supabase
      .from("interests")
      .select("*")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`
      )
      .maybeSingle();

    if (error) throw error;

    if (!data) return res.json({ status: "none", direction: null });
    const direction = data.sender_id === userId ? "sent" : "received";
    res.json({ status: data.status, direction, interest: data });
  } catch (err) {
    console.error("Interest status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /interests/shortlist
// Toggle shortlist
// ============================================================
router.post("/shortlist", async (req, res) => {
  try {
    const { user_id, shortlisted_user_id } = req.body;

    if (!user_id || !shortlisted_user_id) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Check existing
    const { data: existing } = await supabase
      .from("shortlists")
      .select("*")
      .eq("user_id", user_id)
      .eq("shortlisted_user_id", shortlisted_user_id)
      .maybeSingle();

    if (existing) {
      await supabase.from("shortlists").delete().eq("id", existing.id);
      return res.json({ action: "removed" });
    }

    const { error } = await supabase
      .from("shortlists")
      .insert([{ user_id, shortlisted_user_id }]);

    if (error) throw error;
    res.json({ action: "added" });
  } catch (err) {
    console.error("Shortlist error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/shortlisted/:userId
// List all shortlisted profiles
// ============================================================
router.get("/shortlisted/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("shortlists")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const ids = (data || []).map((s) => s.shortlisted_user_id);
    let userMap = {};
    if (ids.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified")
        .in("id", ids);
      (users || []).forEach((u) => { userMap[u.id] = u; });
    }

    const enriched = (data || []).map((s) => ({
      ...s,
      user: userMap[s.shortlisted_user_id] || null,
    }));

    res.json({ shortlisted: enriched, total: enriched.length });
  } catch (err) {
    console.error("Shortlist list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;