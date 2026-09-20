import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// Send message
router.post("/", async (req, res) => {
  const { sender_id, receiver_id, text } = req.body;

  const { data, error } = await supabase.from("messages").insert([
    { sender_id, receiver_id, text }
  ]);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Get messages between two users
router.get("/:sender_id/:receiver_id", async (req, res) => {
  const { sender_id, receiver_id } = req.params;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${sender_id},receiver_id.eq.${receiver_id}`);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
