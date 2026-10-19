import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { sendTelegram } from "../utils/telegram.js";
import { requireAuth } from "../utils/auth.js"; // 🛡️ Added Security

dotenv.config();
const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// REQUEST photo access (🔒 Secured)
// ============================================
router.post("/request", requireAuth, async (req, res) => {
  const { owner_id } = req.body;
  const requester_id = req.userId; // 🛡️ Taken from JWT

  if (!requester_id || !owner_id)
    return res.status(400).json({ error: "Missing IDs" });
  if (requester_id === owner_id)
    return res.status(400).json({ error: "Cannot request own photos" });

  try {
    const { data, error } = await supabaseAdmin
      .from("photo_requests")
      .upsert(
        { requester_id, owner_id, status: "pending" },
        { onConflict: "requester_id,owner_id" }
      )
      .select()
      .single();
    if (error) throw error;

    // Notify owner (In-App)
    try {
      const { data: requester } = await supabaseAdmin
        .from("users")
        .select("name")
        .eq("id", requester_id)
        .single();

      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: owner_id,
          actor_id: requester_id,
          type: "photo_request",
          title: "📩 New Photo Request",
          body: `${requester?.name || "Someone"} wants to view your photos`,
          link: "/photo-requests",
          is_read: false,
        });

      if (notifError) console.error("Notification insert error:", notifError);

      // 📱 Telegram Notification
      const { data: owner } = await supabaseAdmin
        .from("users")
        .select("telegram_chat_id, telegram_opt_in")
        .eq("id", owner_id)
        .single();

      if (owner?.telegram_opt_in && owner.telegram_chat_id) {
        await sendTelegram(
          owner.telegram_chat_id,
          `📩 <b>New Photo Request</b>\n\n` +
            `<b>${requester?.name || "Someone"}</b> wants to view your photos.\n\n` +
            `👉 <a href="https://vivaha-frontend.vercel.app/photo-requests">Approve or Deny →</a>`
        );
      }
    } catch (notifErr) {
      console.error("Notification error:", notifErr);
    }

    res.json({ request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// INCOMING requests for owner (🔒 Secured)
// ============================================
router.get("/incoming/:ownerId", requireAuth, async (req, res) => {
  const { ownerId } = req.params;

  // 🛡️ Security: You can only view YOUR OWN incoming requests
  if (ownerId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("photo_requests")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (data || []).map((r) => r.requester_id);
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, name, age, location, photo_url")
      .in("id", ids);

    const enriched = (data || []).map((r) => ({
      ...r,
      requester: users?.find((u) => u.id === r.requester_id),
    }));

    res.json({ requests: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RESPOND approve/deny (🔒 Secured)
// ============================================
router.put("/respond/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // 🛡️ Security: Fetch first to check who owns this request
    const { data: request, error: fetchErr } = await supabaseAdmin
      .from("photo_requests")
      .select("owner_id, requester_id")
      .eq("id", id)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: "Request not found" });

    // Only the owner of the photos can approve/deny the request
    if (request.owner_id !== req.userId) {
      return res.status(403).json({ error: "Forbidden: You are not the owner of this request" });
    }

    const { data, error } = await supabaseAdmin
      .from("photo_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Notify requester
    try {
      const { data: owner } = await supabaseAdmin
        .from("users")
        .select("name")
        .eq("id", data.owner_id)
        .single();

      const isApproved = status === "approved";
      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: data.requester_id,
          actor_id: data.owner_id,
          type: isApproved
            ? "photo_request_accepted"
            : "photo_request_declined",
          title: isApproved
            ? "✅ Photo Access Approved"
            : "❌ Photo Request Denied",
          body: isApproved
            ? `${owner?.name || "User"} approved your photo request`
            : `${owner?.name || "User"} denied your photo request`,
          link: isApproved
            ? `/profile/${data.owner_id}`
            : "/photo-requests",
          is_read: false,
        });

      if (notifError) console.error("Notification insert error:", notifError);

      // 📱 Telegram Notification
      const { data: requester } = await supabaseAdmin
        .from("users")
        .select("telegram_chat_id, telegram_opt_in")
        .eq("id", data.requester_id)
        .single();

      if (requester?.telegram_opt_in && requester.telegram_chat_id) {
        await sendTelegram(
          requester.telegram_chat_id,
          isApproved
            ? `✅ <b>Photo Access Approved!</b>\n\n` +
                `<b>${owner?.name || "User"}</b> approved your photo request.\n` +
                `You can now view their full photos!\n\n` +
                `👉 <a href="https://vivaha-frontend.vercel.app/profile/${data.owner_id}">View Profile →</a>`
            : `❌ <b>Photo Request Denied</b>\n\n` +
                `<b>${owner?.name || "User"}</b> denied your photo request.`
        );
      }
    } catch (notifErr) {
      console.error("Notification error:", notifErr);
    }

    res.json({ request: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STATUS check (🔒 Secured)
// ============================================
router.get("/status/:requesterId/:ownerId", requireAuth, async (req, res) => {
  const { requesterId, ownerId } = req.params;

  // 🛡️ Security: You can only check status for YOURSELF
  if (requesterId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { data } = await supabaseAdmin
      .from("photo_requests")
      .select("status")
      .eq("requester_id", requesterId)
      .eq("owner_id", ownerId)
      .single();
    res.json({ status: data?.status || "none" });
  } catch {
    res.json({ status: "none" });
  }
});

export default router;
