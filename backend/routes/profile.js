// ============================================================
// ADMIN: GET /profile/admin/stats
// Get dashboard statistics
// ============================================================
router.get("/admin/stats", async (req, res) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    // Male users
    const { count: maleCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("gender", "male");

    // Female users
    const { count: femaleCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("gender", "female");

    // Total messages
    const { count: totalMessages } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true });

    // Recent signups (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recentSignups } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString());

    res.json({
      totalUsers: totalUsers || 0,
      maleUsers: maleCount || 0,
      femaleUsers: femaleCount || 0,
      totalMessages: totalMessages || 0,
      recentSignups: recentSignups || 0,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN: GET /profile/admin/users
// Get all users (paginated)
// ============================================================
router.get("/admin/users", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from("users")
      .select("*", { count: "exact" })
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
// ADMIN: DELETE /profile/admin/users/:userId
// Delete a user profile
// ============================================================
router.delete("/admin/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { error } = await supabase.from("users").delete().eq("id", userId);

    if (error) throw error;

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: err.message });
  }
});