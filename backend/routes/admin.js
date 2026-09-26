import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Supabase Admin Client (Uses SERVICE_ROLE key)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// DELETE /admin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Delete the user from Supabase Auth (This is what keeps them "alive")
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("Supabase Auth delete error:", error);
      return res.status(500).json({ 
        error: "Failed to delete from Auth", 
        details: error.message 
      });
    }

    // 2. Delete their profile from your public table
    await supabaseAdmin.from('users').delete().eq('id', userId);

    res.status(200).json({ message: "User fully deleted from Auth and Database" });

  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;