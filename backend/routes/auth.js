import express from "express";
import supabase from "../supabaseClient.js";

const router = express.Router();

// Signup
router.post("/signup", async (req, res) => {
  const { email, password, name, age, religion, location } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, age, religion, location }
    }
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user });
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ session: data.session });
});

export default router;
