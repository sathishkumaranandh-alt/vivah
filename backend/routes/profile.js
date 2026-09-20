import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// Get user profile
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from("users").select("*").eq("id", id).single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Update profile
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase.from("users").update(updates).eq("id", id);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
