// =====================================================================
// 🧩 SINGLE SOURCE OF TRUTH for "what can this user do?"
//
// Permissions come from the ADMIN-configured plan (membership_plans.permissions)
// + per-user overrides (users.custom_permissions). Nothing is hard-coded to
// plan names like "Gold"/"Platinum" - if the admin changes the Free plan to
// 7 photos, or creates a new "Silver" plan, it is enforced everywhere.
//
// RULE: owner PRIVACY is always checked first (photo / contact / profile
// visibility / blocks). Plan permissions only apply AFTER privacy allows it.
// =====================================================================
import supabaseAdmin from "../supabaseClient.js";

// Only used when the admin has not defined a key at all.
export const FALLBACK_FREE_PERMS = {
  daily_interests: 5, daily_recommendations: 5, max_photos: 3,
  advanced_search: false, see_visitors: false, unlimited_chat: false,
  profile_boost: false, contact_access: false, priority_support: false,
  see_dob: false, see_horoscope: false, see_income: false,
  interest_to_anyone: false, see_full_photo: false, request_photo: true,
  can_view_paid_profiles: false,
};

export const perm = (v) => v === true || v === "true" || v === 1 || v === "1";
const escapeIlike = (s) => String(s).replace(/[\\%_]/g, "\\$&");

// plan perms override fallback; custom (per-user) overrides plan when true/number
export function mergePermissions(planPerms = {}, custom = {}) {
  const merged = { ...FALLBACK_FREE_PERMS, ...(planPerms || {}) };
  Object.keys(custom || {}).forEach((key) => {
    const val = custom[key];
    if (val === true || typeof val === "number") merged[key] = val;
  });
  return merged;
}

// Active = status 'active' AND not expired (same rule everywhere)
export async function getActiveSubscription(userId) {
  if (!userId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, started_at, expires_at, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch { return null; }
}

async function getPlanRow(planName) {
  if (!planName) return null;
  try {
    const { data } = await supabaseAdmin
      .from("membership_plans")
      .select("permissions, name, price")
      .ilike("name", escapeIlike(String(planName).trim()))
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch { return null; }
}

// Paid = has an active, non-expired subscription whose plan is not "free".
export async function getEffectivePermissions(userId) {
  if (!userId) {
    return { plan: "Free", isPaid: false, perms: { ...FALLBACK_FREE_PERMS }, planPerms: {}, custom: {} };
  }
  try {
    const [{ data: u }, sub] = await Promise.all([
      supabaseAdmin.from("users").select("custom_permissions").eq("id", userId).maybeSingle(),
      getActiveSubscription(userId),
    ]);
    const plan = sub?.plan || "Free";
    const isPaid = !!sub && String(sub.plan || "").trim() !== "" && String(sub.plan).trim().toLowerCase() !== "free";
    const row = await getPlanRow(plan);
    const planPerms = row?.permissions || {};
    const custom = u?.custom_permissions || {};
    return { plan, isPaid, perms: mergePermissions(planPerms, custom), planPerms, custom };
  } catch {
    return { plan: "Free", isPaid: false, perms: { ...FALLBACK_FREE_PERMS }, planPerms: {}, custom: {} };
  }
}

export async function isPaidUser(userId) {
  return (await getEffectivePermissions(userId)).isPaid;
}

// Did the admin (plan or per-user) explicitly define this key?
export function isExplicit(info, key) {
  return Object.prototype.hasOwnProperty.call(info.planPerms || {}, key) ||
         Object.prototype.hasOwnProperty.call(info.custom || {}, key);
}
