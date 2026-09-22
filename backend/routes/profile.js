import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// HELPERS — Matching Algorithm
// ============================================================
function ageScore(age1, age2, gender1, gender2) {
  if (!age1 || !age2) return 0;
  let older, younger;
  if (gender1 === "male") { older = age1; younger = age2; }
  else { older = age2; younger = age1; }
  const diff = older - younger;
  if (diff >= 2 && diff <= 8) return 20;
  if (diff >= 0 && diff <= 10) return 15;
  if (diff >= -3 && diff <= 15) return 8;
  return 0;
}

function locationScore(loc1, loc2) {
  if (!loc1 || !loc2) return 0;
  const l1 = loc1.toLowerCase().trim();
  const l2 = loc2.toLowerCase().trim();
  if (l1 === l2) return 15;
  if (l1.split(",")[0] === l2.split(",")[0]) return 10;
  return 3;
}

function completenessScore(profile) {
  const fields = ["name", "age", "gender", "religion", "location", "education", "occupation", "bio", "photo_url"];
  const filled = fields.filter(f => profile[f] && String(profile[f]).trim() !== "").length;
  return Math.round((filled / fields.length) * 10);
}

function calculateMatchScore(userA, userB) {
  let score = 0;
  const reasons = [];

  if (userA.gender && userB.gender && userA.gender !== userB.gender) {
    score += 30; reasons.push("Opposite gender");
  } else {
    return { score: 0, reasons: ["Gender mismatch"] };
  }

  if (userA.religion && userB.religion) {
    if (userA.religion.toLowerCase() === userB.religion.toLowerCase()) {
      score += 25; reasons.push("Same religion");
    } else { score += 5; reasons.push("Different religion"); }
  }

  const agePts = ageScore(userA.age, userB.age, userA.gender, userB.gender);
  score += agePts;
  if (agePts >= 15) reasons.push("Good age match");

  const locPts = locationScore(userA.location, userB.location);
  score += locPts;
  if (locPts >= 10) reasons.push("Nearby location");

  const completePts = Math.round((completenessScore(userA) + completenessScore(userB)) / 2);
  score += completePts;

  return { score, reasons };
}

// ============================================================
// GET /profile/search
// Now accepts ?community=vanniyar
// ============================================================
router.get("/search", async (req, res) => {
  try {
    const { age_min, age_max, religion, location, gender, community } = req.query;
    let query = supabase.from("users").select("*");

    if (community) query = query.eq("community", community);
    if (age_min) query = query.gte("age", parseInt(age_min));
    if (age_max) query = query.lte("age", parseInt(age_max));
    if (religion) query = query.ilike("religion", `%${religion}%`);
    if (location) query = query.ilike("location", `%${location}%`);
    if (gender) query = query.eq("gender", gender);

    const { data, error } = await query.limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ results: data, count: data.length });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// GET /profile/matches/:userId
// Filters matches to SAME community only
// ============================================================
router.get("/matches/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: me, error: meError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (meError || !me) return res.status(404).json({ error: "Your profile not found" });

    // ⭐ Filter by SAME community
    let query = supabase.from("users").select("*").neq("id", userId).limit(200);
    if (me.community) {
      query = query.eq("community", me.community);
    }

    const { data: allUsers, error: usersError } = await query;
    if (usersError) return res.status(500).json({ error: usersError.message });

    const scored = allUsers
      .map(user => {
        const { score, reasons } = calculateMatchScore(me, user);
        return { ...user, matchScore: score, matchReasons: reasons };
      })
      .filter(u => u.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 20);

    res.json({ totalMatches: scored.length, matches: scored });
  } catch (err) {
    console.error("Matches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// ADMIN: GET /profile/admin/stats
// ============================================================
router.get("/admin/stats", async (req, res) => {
  try {
    const { data: allUsers } = await supabase.from("users").select("gender, community, is_verified, is_suspended");

    const users = allUsers || [];
    const totalUsers = users.length;
    const maleUsers = users.filter(u => u.gender === "male").length;
    const femaleUsers = users.filter(u => u.gender === "female").length;
    const verifiedUsers = users.filter(u => u.is_verified).length;
    const suspendedUsers = users.filter(u => u.is_suspended).length;

    // Community breakdown
    const communityCounts = {};
    users.forEach(u => {
      if (u.community) communityCounts[u.community] = (communityCounts[u.community] || 0) + 1;
    });

    const { count: totalMessages } = await supabase
      .from("messages").select("*", { count: "exact", head: true });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { count: recentSignups } = await supabase
      .from("users").select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString());

    res.json({
      totalUsers, maleUsers, femaleUsers,
      totalMessages: totalMessages || 0,
      recentSignups: recentSignups || 0,
      verifiedUsers, suspendedUsers,
      communityCounts,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN: GET /profile/admin/users
// Optional ?community=vanniyar filter
// ============================================================
router.get("/admin/users", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const { community } = req.query;

    let query = supabase.from("users").select("*", { count: "exact" });
    if (community) query = query.eq("community", community);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ users: data || [], total: count || 0 });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN: PATCH verify / suspend / unsuspend / role
// ============================================================
router.patch("/admin/users/:userId/verify", async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_verified } = req.body;
    const { data, error } = await supabase.from("users").update({ is_verified }).eq("id", userId).select().single();
    if (error) throw error;
    res.json({ message: is_verified ? "User verified" : "Verification removed", user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/users/:userId/suspend", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const { data, error } = await supabase.from("users")
      .update({ is_suspended: true, suspend_reason: reason || "Violation of terms" })
      .eq("id", userId).select().single();
    if (error) throw error;
    res.json({ message: "User suspended", user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/users/:userId/unsuspend", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase.from("users")
      .update({ is_suspended: false, suspend_reason: null })
      .eq("id", userId).select().single();
    if (error) throw error;
    res.json({ message: "User unsuspended", user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/admin/users/:userId/role", async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const { data, error } = await supabase.from("users").update({ role }).eq("id", userId).select().single();
    if (error) throw error;
    res.json({ message: `Role changed to ${role}`, user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/admin/users/:userId/details", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/admin/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (error) throw error;
    res.json({ message: "User deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// GET /profile/:userId  (single profile)
// ============================================================
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();
    if (error) return res.status(404).json({ error: "Profile not found" });
    res.json({ profile: data });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// PUT /profile/:userId  (update profile, including community)
// ============================================================
router.put("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.email;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("users").update(updates).eq("id", userId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Profile updated", profile: data });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;