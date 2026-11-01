// =====================================================================
// 🧩 SINGLE SOURCE OF TRUTH for "what can this user do?"
//
// Permissions come from the ADMIN-configured plan (membership_plans.permissions)
// + per-user overrides (users.custom_permissions). Nothing is hard-coded to
// plan names like "Gold"/"Platinum" - if the admin changes the Free plan to
// 7 photos, or creates a new "Diamond" plan, it is enforced everywhere.
//
// RULE: the owner's PRIVACY lock is always checked first (photo / contact /
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

// NOTE: never .single() here - it throws on duplicates / zero rows and the
// caller would silently fall back to defaults (= admin changes ignored).
async function getPlanRow(planName) {
  if (!planName) return null;
  try {
    const { data } = await supabaseAdmin
      .from("membership_plans")
      .select("permissions, name, price")
      .ilike("name", escapeIlike(String(planName).trim()))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch { return null; }
}

// Paid = has an active, non-expired subscription whose plan is not "free".
export async function getEffectivePermissions(userId) {
  const empty = { plan: "Free", isPaid: false, sub: null, perms: { ...FALLBACK_FREE_PERMS }, planPerms: {}, custom: {} };
  if (!userId) return empty;
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
    const perms = mergePermissions(planPerms, custom);
    // Paid plans created before these keys existed keep working: if the admin never
    // defined them, a paid plan implies them. Once the admin sets them, THEY decide.
    if (isPaid) {
      const info = { planPerms, custom };
      ["contact_access", "can_view_paid_profiles"].forEach((k) => { if (!isExplicit(info, k)) perms[k] = true; });
    }
    // remember which keys the admin explicitly defined (plan or per-user) - see planLocks()
    const explicitKeys = new Set([
      ...Object.keys(planPerms || {}),
      ...Object.keys(custom || {}).filter((k) => custom[k] === true || typeof custom[k] === "number"),
    ]);
    Object.defineProperty(perms, "__explicit", { value: explicitKeys, enumerable: false });
    return { plan, isPaid, sub, perms, planPerms, custom };
  } catch {
    return empty;
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

// 🧩 Does the viewer's PLAN hide this owner's data?
//  - owner is paid  : locked when the viewer's plan lacks the permission (as before)
//  - owner is free  : locked ONLY when the admin explicitly set that permission on the viewer's
//                     plan, so admin changes to the Free plan also apply free -> free.
export function planLocks(ownerIsPaid, perms, key) {
  if (perm((perms || {})[key])) return false;
  return !!ownerIsPaid || !!(perms && perms.__explicit && perms.__explicit.has(key));
}

// 🧩 Human-readable feature list built LIVE from the admin's plan permissions,
// so what users see on the Plans / My Subscription pages always matches what the server enforces.
const FEATURE_LABELS = [
  ["daily_interests", (n) => `${n} interests per day`, "number"],
  ["daily_recommendations", (n) => `${n} recommendations per day`, "number"],
  ["max_photos", (n) => `Upload up to ${n} photos`, "number"],
  ["advanced_search", "Advanced search filters"],
  ["see_visitors", "See who viewed your profile"],
  ["unlimited_chat", "Unlimited chat"],
  ["profile_boost", "Profile boost included"],
  ["contact_access", "View contact details"],
  ["priority_support", "Priority support"],
  ["see_dob", "See date of birth"],
  ["see_horoscope", "See horoscope details"],
  ["see_income", "See income details"],
  ["interest_to_anyone", "Send interest to any community"],
  ["see_full_photo", "See full photos (no blur)"],
  ["request_photo", "Request to view photos"],
  ["can_view_paid_profiles", "View paid member profiles"],
];
export function planFeatureList(permissions = {}) {
  const p = permissions || {};
  const out = [];
  FEATURE_LABELS.forEach(([key, label, kind]) => {
    if (kind === "number") {
      const n = Number(p[key]);
      if (Number.isFinite(n) && n > 0) out.push(label(n));
    } else if (perm(p[key])) out.push(label);
  });
  return out;
}

// Look up a plan row by name (case-insensitive) and return its live feature list
export async function getPlanFeatures(planName) {
  const row = await getPlanRow(planName);
  return row ? planFeatureList(row.permissions) : [];
        }
      
