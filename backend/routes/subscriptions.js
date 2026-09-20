import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// Add subscription
router.post("/", async (req, res) => {
  const { user_id, plan, status, start_date, end_date } = req.body;

  const { data, error } = await supabase.from("subscriptions").insert([
    { user_id, plan, status, start_date, end_date }
  ]);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Get subscription by user
router.get("/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase.from("subscriptions").select("*").eq("user_id", user_id);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
