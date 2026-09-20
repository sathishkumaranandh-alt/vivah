import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// ============================================================
// HELPER: Calculate age difference score (max 20 points)
// ============================================================
function ageScore(age1, age2, gender1, gender2) {
  if (!age1 || !age2) return 0;

  let older, younger;
  if (gender1 === "male") {
    older = age1;
    younger = age2;
  } else {
    older = age2;
    younger = age1;
  }

  const diff = older - younger;

  if (diff >= 2 && diff <= 8) return 20;
  if (diff >= 0 && diff <= 10) return 15;
  if (diff >= -3 && diff <= 15) return 8;
  return 0;
}

// ============================================================
// HELPER: Calculate location score (max 15 points)
// ============================================================
function locationScore(loc1, loc2) {
  if (!loc1 || !loc2) return 0;
  const l1 = loc1.toLowerCase().trim();
  const l2 = loc2.toLowerCase().trim();

  if (l1 === l2) return 15;
  if (l1.split(",")[0] === l2.split(",")[0]) return 10;
  return 3;
}

// ============================================================
// HELPER: Calculate profile completeness (max 10 points)
// ============================================================
function completenessScore(profile) {
  const fields = ["name", "age", "gender", "religion", "location", "education", "occupation", "bio", "photo_url"];
  const filled = fields.filter(f => profile[f] && String(profile[f]).trim() !== "").length;
  return Math.round((filled / fields.length) * 10);
}

// ============================================================
// HELPER: The full matching score (max 100 points)
// ============================================================
function calculateMatchScore(userA, userB) {
  let score = 0;
  const reasons = [];

  // 1. Gender match (30 points) — must be opposite
  if (userA.gender && userB.gender && userA.gender !== userB.gender) {
    score += 30;
    reasons.push("Opposite gender");
  } else {
    return { score: 0, reasons: ["Gender mismatch"] };
  }

  // 2. Religion match (25 points)
  if (userA.religion && userB.religion) {
    if (userA.religion.toLowerCase() === userB.religion.toLowerCase()) {
      score += 25;
      reasons.push("Same religion");
    } else {
      score += 5;
      reasons.push("Different religion");
    }
  }

  // 3. Age compatibility (20 points)
  const agePts = ageScore(userA.age, userB.age, userA.gender, userB.gender);
  score += agePts;
  if (agePts >= 15) reasons.push("Good age match");

  // 4. Location match (15 points)
  const locPts = locationScore(userA.location, userB.location);
  score += locPts;
  if (locPts >= 10) reasons.push("Nearby location");

  // 5. Profile completeness (10 points)
  const completePts = Math.round((completenessScore(userA) + completenessScore(userB)) / 2);
  score += completePts;

  return { score, reasons };
}

// ============================================================
// GET /profile/search — Filter-based search
// ⚠️ MUST be BEFORE /:userId route
// ============================================================
router.get("/search", async (req, res) => {
  try {
    const { age_min, age_max, religion, location, gender } = req.query;

    let query = supabase.from("users").select("*");

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
// GET /profile/matches/:userId — ⭐ MATCHING ALGORITHM
// ============================================================
router.get("/matches/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: me, error: meError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (meError || !me) {
      return res.status(404).json({ error: "Your profile not found" });
    }

    const { data: allUsers, error: usersError } = await supabase
      .from("users")
      .select("*")
      .neq("id", userId)
      .limit(200);

    if (usersError) return res.status(500).json({ error: usersError.message });

    const scored = allUsers
      .map(user => {
        const { score, reasons } = calculateMatchScore(me, user);
        return { ...user, matchScore: score, matchReasons: reasons };
      })
      .filter(u => u.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 20);

    res.json({
      totalMatches: scored.length,
      matches: scored,
    });
  } catch (err) {
    console.error("Matches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// GET /profile/:userId — Get a single profile
// ============================================================
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) return res.status(404).json({ error: "Profile not found" });
    res.json({ profile: data });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================
// PUT /profile/:userId — Update a profile
// ============================================================
router.put("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.email;
    delete updates.created_at;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Profile updated", profile: data });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
