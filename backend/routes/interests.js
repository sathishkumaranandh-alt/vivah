import express from "express";
import supabase from "../supabaseClient.js";
import { sendTelegram } from "../utils/telegram.js";
import { requireAuth } from "../utils/auth.js";
import { validate, interestSchema } from '../utils/validators.js';
import { publicUser } from "../utils/privacy.js"; // 🛡️ Added for data masking
import { getEffectivePermissions, perm, isExplicit } from "../utils/plan.js"; // 🧩 dynamic plan permissions

const router = express.Router();

// ------------------------------------------------------------
// 🔒 PRIVACY FIRST: blocked users can never send/receive interests
// ------------------------------------------------------------
async function isBlockedEitherWay(a, b) {
  try {
    const { data } = await supabase
      .from("blocked_users")
      .select("blocker_id")
      .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
      .limit(1);
    return (data || []).length > 0;
  } catch { return false; }
}

// ------------------------------------------------------------
// 🧩 PLAN RULES (admin-configured, then enforced here):
//    interest_to_anyone  -> false = own community only
//    daily_interests     -> max interests per day (IST day)
// ------------------------------------------------------------
const IST_OFFSET_MS = 330 * 60 * 1000;
function startOfTodayISTIso() {
  const startIst = Math.floor((Date.now() + IST_OFFSET_MS) / 86400000) * 86400000 - IST_OFFSET_MS;
  return new Date(startIst).toISOString();
}
const normCommunity = (v) => String(v || "").trim().toLowerCase();

async function checkInterestPlan(senderId, receiverId) {
  const info = await getEffectivePermissions(senderId);
  const { perms, isPaid } = info;

  if (!perm(perms.interest_to_anyone)) {
    const { data: rows } = await supabase.from("users").select("id, community").in("id", [senderId, receiverId]);
    const s = normCommunity(rows?.find((r) => r.id === senderId)?.community);
    const r = normCommunity(rows?.find((r2) => r2.id === receiverId)?.community);
    if (s && r && s !== r) {
      return { status: 403, body: { error: "Your plan lets you send interests only to your own community. Upgrade to contact other communities.", code: "COMMUNITY_RESTRICTED", requiresUpgrade: !isPaid } };
    }
  }

  // Paid plans created before this key existed (not explicitly set) stay unlimited
  const limit = Number(perms.daily_interests);
  if (Number.isFinite(limit) && (isExplicit(info, "daily_interests") || !isPaid)) {
    const { count, error } = await supabase
      .from("interests")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", senderId)
      .gte("created_at", startOfTodayISTIso());
    if (error) { console.error("Daily interest count error:", error.message); return null; }
    if ((count || 0) >= limit) {
      return { status: 403, body: { error: `Daily limit reached: your plan allows ${limit} interests per day. Try again tomorrow or upgrade.`, code: "DAILY_LIMIT", limit, used: count || 0, requiresUpgrade: !isPaid } };
    }
  }
  return null;
}


// 🛡️ Helper to validate UUID (Prevents SQL Injection)
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// 🛡️ Helper to escape HTML (Prevents Telegram injection)
const escapeHtml = (str) => {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

// ============================================================
// 🔒 PATCH /interests/respond/:interestId
// ============================================================
router.patch("/respond/:interestId", requireAuth, async (req, res) => {
  try {
    const { interestId } = req.params;
    const { status, reason } = req.body;

    if (!isValidUUID(interestId)) return res.status(400).json({ error: "Invalid interest ID" });
    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data: interestCheck, error: fetchErr } = await supabase
      .from("interests")
      .select("receiver_id")
      .eq("id", interestId)
      .single();

    if (fetchErr || !interestCheck) {
      return res.status(404).json({ error: "Interest not found" });
    }

    if (interestCheck.receiver_id !== req.userId) {
      return res.status(403).json({ error: "Forbidden: You are not the receiver of this interest" });
    }

    const updateData = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (status === "declined" && reason) {
      updateData.message = `Declined: ${reason}`;
    }

    const { data, error } = await supabase
      .from("interests")
      .update(updateData)
      .eq("id", interestId)
      .select()
      .single();

    if (error) throw error;

    // ⭐ Notify original sender
    try {
      const { data: responder } = await supabase.from("users").select("name").eq("id", data.receiver_id).single();
      const safeResponderName = escapeHtml(responder?.name || "Someone");

      await supabase.from("notifications").insert([
        {
          user_id: data.sender_id,
          actor_id: data.receiver_id,
          type: status === "accepted" ? "interest_accepted" : "interest_declined",
          title: status === "accepted" ? "Interest Accepted! 💕" : "Interest Declined",
          body: status === "accepted"
              ? `${safeResponderName} accepted your interest. You can now message them!`
              : `${safeResponderName} declined your interest.`,
          link: status === "accepted" ? `/messages?to=${data.receiver_id}` : "/interests",
        },
      ]);

      const { data: sender } = await supabase.from("users").select("telegram_chat_id, telegram_opt_in").eq("id", data.sender_id).single();

      if (sender?.telegram_opt_in && sender.telegram_chat_id) {
        if (status === "accepted") {
          await sendTelegram(
            sender.telegram_chat_id,
            `💕 <b>Interest Accepted!</b>\n\n` +
              `<b>${safeResponderName}</b> accepted your interest.\n` +
              `You can now message them!\n\n` +
              `👉 <a href="https://vivaha-frontend.vercel.app/messages?to=${data.receiver_id}">Chat Now →</a>`
          );
        } else {
          await sendTelegram(
            sender.telegram_chat_id,
            `💔 <b>Interest Declined</b>\n\n` +
              `<b>${safeResponderName}</b> declined your interest.\n\n` +
              `Keep exploring — your perfect match is waiting! 🎯\n\n` +
              `👉 <a href="https://vivaha-frontend.vercel.app/discover">Discover More →</a>`
          );
        }
      }
    } catch (e) { console.error("Notify error:", e); }

    res.json({ message: `Interest ${status}`, interest: data });
  } catch (err) {
    console.error("Respond error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /interests/received/:userId (Secured)
// ============================================================
router.get("/received/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.userId || !isValidUUID(userId)) return res.status(403).json({ error: "Forbidden" });

    const { status } = req.query;
    let query = supabase.from("interests").select("*").eq("receiver_id", userId).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const senderIds = [...new Set((data || []).map((i) => i.sender_id))];
    let userMap = {};
    if (senderIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified, photo_privacy").in("id", senderIds);
      (users || []).forEach((u) => {
        // 🛡️ Data Masking: Hide private photos
        let safeUser = publicUser(u, false);
        if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') safeUser.photo_url = null;
        userMap[u.id] = safeUser;
      });
    }

    const enriched = (data || []).map((i) => ({ ...i, sender: userMap[i.sender_id] || null }));
    res.json({ interests: enriched, total: enriched.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// GET /interests/sent/:userId (Secured)
// ============================================================
router.get("/sent/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.userId || !isValidUUID(userId)) return res.status(403).json({ error: "Forbidden" });

    const { status } = req.query;
    let query = supabase.from("interests").select("*").eq("sender_id", userId).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const receiverIds = [...new Set((data || []).map((i) => i.receiver_id))];
    let userMap = {};
    if (receiverIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified, photo_privacy").in("id", receiverIds);
      (users || []).forEach((u) => {
        let safeUser = publicUser(u, false);
        if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') safeUser.photo_url = null;
        userMap[u.id] = safeUser;
      });
    }

    const enriched = (data || []).map((i) => ({ ...i, receiver: userMap[i.receiver_id] || null }));
    res.json({ interests: enriched, total: enriched.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// GET /interests/count/:userId (Secured)
// ============================================================
router.get("/count/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.userId || !isValidUUID(userId)) return res.status(403).json({ error: "Forbidden" });

    const { count, error } = await supabase.from("interests").select("*", { count: "exact", head: true }).eq("receiver_id", userId).eq("status", "pending");
    if (error) throw error;
    res.json({ pendingCount: count || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// GET /interests/status/:userId/:otherId (Secured)
// ============================================================
router.get("/status/:userId/:otherId", requireAuth, async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    if (userId !== req.userId || !isValidUUID(otherId)) return res.status(403).json({ error: "Forbidden" });

    const { data, error } = await supabase.from("interests").select("*").or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`).maybeSingle();
    if (error) throw error;
    if (!data) return res.json({ status: "none", direction: null });
    const direction = data.sender_id === userId ? "sent" : "received";
    res.json({ status: data.status, direction, interest: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// 🔒 POST /interests/send (Already Secured)
// ============================================================
router.post("/send", requireAuth, validate(interestSchema), async (req, res) => {
  try {
    const { receiver_id, message } = req.body;
    const sender_id = req.userId;

    if (!sender_id || !receiver_id || !isValidUUID(receiver_id)) return res.status(400).json({ error: "Missing or invalid fields" });
    if (sender_id === receiver_id) return res.status(400).json({ error: "Cannot send interest to yourself" });

    // 🔒 Privacy first: blocked either way -> no interest
    if (await isBlockedEitherWay(sender_id, receiver_id)) return res.status(403).json({ error: "You cannot send an interest to this user.", code: "BLOCKED" });

    const { data: existing } = await supabase.from("interests").select("*").or(`and(sender_id.eq.${sender_id},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${sender_id})`).maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return res.status(400).json({ error: "Already connected" });
      if (existing.status === "pending") return res.status(400).json({ error: "Interest already sent" });
      if (existing.status === "declined" && existing.sender_id === sender_id) {
        const planBlock = await checkInterestPlan(sender_id, receiver_id); // 🧩 then plan rules
        if (planBlock) return res.status(planBlock.status).json(planBlock.body);
        const { data, error } = await supabase.from("interests").update({ status: "pending", created_at: new Date().toISOString(), responded_at: null, message: message || null }).eq("id", existing.id).select().single();
        if (error) throw error;
        return res.json({ message: "Interest re-sent", interest: data });
      }
      return res.status(400).json({ error: "Cannot send interest" });
    }

    const planBlock = await checkInterestPlan(sender_id, receiver_id); // 🧩 then plan rules
    if (planBlock) return res.status(planBlock.status).json(planBlock.body);

    const { data, error } = await supabase.from("interests").insert([{ sender_id, receiver_id, status: "pending", message: message || null }]).select().single();
    if (error) throw error;

    // ⭐ Notify receiver
    try {
      const { data: sender } = await supabase.from("users").select("name").eq("id", sender_id).single();
      const safeSenderName = escapeHtml(sender?.name || "Someone");

      await supabase.from("notifications").insert([{ user_id: receiver_id, actor_id: sender_id, type: "interest_received", title: "New Interest 💌", body: `${safeSenderName} sent you an interest`, link: "/interests" }]);

      const { data: receiver } = await supabase.from("users").select("telegram_chat_id, telegram_opt_in").eq("id", receiver_id).single();

      if (receiver?.telegram_opt_in && receiver.telegram_chat_id) {
        await sendTelegram(
          receiver.telegram_chat_id,
          `💌 <b>New Interest!</b>\n\n` +
            `<b>${safeSenderName}</b> sent you an interest.\n\n` +
            `👉 <a href="https://vivaha-frontend.vercel.app/interests">View on Vivaha →</a>`
        );
      }
    } catch (e) { console.error("Notify error:", e); }

    res.status(201).json({ message: "Interest sent!", interest: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// 🔒 POST /interests/shortlist (Already Secured)
// ============================================================
router.post("/shortlist", requireAuth, async (req, res) => {
  try {
    const { shortlisted_user_id } = req.body;
    const user_id = req.userId;

    if (!user_id || !shortlisted_user_id || !isValidUUID(shortlisted_user_id)) return res.status(400).json({ error: "Missing or invalid fields" });

    const { data: existing } = await supabase.from("shortlists").select("*").eq("user_id", user_id).eq("shortlisted_user_id", shortlisted_user_id).maybeSingle();
    if (existing) {
      await supabase.from("shortlists").delete().eq("id", existing.id);
      return res.json({ action: "removed" });
    }
    const { error } = await supabase.from("shortlists").insert([{ user_id, shortlisted_user_id }]);
    if (error) throw error;
    res.json({ action: "added" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// GET /interests/shortlisted/:userId (Secured)
// ============================================================
router.get("/shortlisted/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId !== req.userId || !isValidUUID(userId)) return res.status(403).json({ error: "Forbidden" });

    const { data, error } = await supabase.from("shortlists").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (data || []).map((s) => s.shortlisted_user_id);
    let userMap = {};
    if (ids.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name, age, gender, location, religion, caste, education, occupation, bio, photo_url, community, is_verified, photo_privacy").in("id", ids);
      (users || []).forEach((u) => {
        let safeUser = publicUser(u, false);
        if (u.photo_privacy === 'private' || u.photo_privacy === 'matches') safeUser.photo_url = null;
        userMap[u.id] = safeUser;
      });
    }

    const enriched = (data || []).map((s) => ({ ...s, user: userMap[s.shortlisted_user_id] || null }));
    res.json({ shortlisted: enriched, total: enriched.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
