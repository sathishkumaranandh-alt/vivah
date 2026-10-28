// backend/utils/privacy.js

// 🛡️ Sent INSTEAD of the real photo URL whenever a photo is locked for the viewer.
// The real URL never leaves the server, so devtools / direct API calls cannot reveal it.
// (A plain grey silhouette; the frontend blurs it and shows the lock + request button as before.)
const LOCKED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
  '<rect width="400" height="500" fill="#e9d5dc"/>' +
  '<circle cx="200" cy="190" r="70" fill="#c9a6b3"/>' +
  '<path d="M60 500c0-110 62-170 140-170s140 60 140 170z" fill="#c9a6b3"/></svg>';
export const LOCKED_PHOTO_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(LOCKED_SVG);

export function publicUser(user, keepContact = false) {
  if (!user) return null;
  const {
    telegram_chat_id,
    telegram_opt_in,
    custom_permissions,
    role,
    category,
    ...safeUser
  } = user;

  // Only remove mobile/email if keepContact is false
  if (!keepContact) {
    delete safeUser.mobile;
    delete safeUser.email;
  }

  return safeUser;
}

const perm = (v) => v === true || v === 'true' || v === 1 || v === '1';

async function activePlanName(db, userId) {
  const { data } = await db
    .from('subscriptions')
    .select('plan')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.plan || null;
}

const isPaidPlan = (plan) => !!plan && plan.trim() !== '' && plan.toLowerCase() !== 'free';

async function viewerPermissions(db, viewerId, plan) {
  const merged = { can_view_paid_profiles: false, see_full_photo: false };
  try {
    const { data: planData } = await db
      .from('membership_plans')
      .select('permissions')
      .ilike('name', String(plan || 'Free').replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle();
    Object.assign(merged, planData?.permissions || {});
    const { data: u } = await db.from('users').select('custom_permissions').eq('id', viewerId).maybeSingle();
    const custom = u?.custom_permissions || {};
    Object.keys(custom).forEach((k) => {
      if (custom[k] === true || typeof custom[k] === 'number') merged[k] = custom[k];
    });
  } catch { /* keep defaults */ }
  return merged;
}

// ============================================================
// 🛡️ Single source of truth for "may this viewer see the owner's photos?"
// Same rules as the profile page / search cards (routes/profile.js):
//   approved by owner  → visible (wins over everything)
//   owner paid, viewer can't view paid profiles → locked
//   owner privacy private → locked
//   owner privacy matches and no interest between them → locked
//   otherwise visible
// Returns { canView, approved }
// ============================================================
export async function getPhotoAccess(db, viewerId, ownerId, ownerRow) {
  if (!viewerId || !ownerId) return { canView: false, approved: false };
  if (viewerId === ownerId) return { canView: true, approved: true };

  try {
    const { data: approvedRows } = await db
      .from('photo_requests')
      .select('id')
      .eq('requester_id', viewerId)
      .eq('owner_id', ownerId)
      .eq('status', 'approved')
      .limit(1);
    if (approvedRows && approvedRows.length > 0) return { canView: true, approved: true };

    const [ownerPlan, viewerPlan] = await Promise.all([
      activePlanName(db, ownerId),
      activePlanName(db, viewerId),
    ]);
    const ownerIsPaid = isPaidPlan(ownerPlan);
    const viewerIsPaid = isPaidPlan(viewerPlan);
    const perms = await viewerPermissions(db, viewerId, viewerPlan);

    const canViewPaidProfiles = viewerIsPaid || perm(perms.can_view_paid_profiles);
    if (ownerIsPaid && !canViewPaidProfiles) return { canView: false, approved: false, reason: 'plan_upgrade' };

    const privacy = ownerRow?.photo_privacy || 'public';
    if (privacy === 'private') return { canView: false, approved: false, reason: 'owner_privacy' };

    if (privacy === 'matches') {
      const { data: rows } = await db
        .from('interests')
        .select('id')
        .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${ownerId}),and(sender_id.eq.${ownerId},receiver_id.eq.${viewerId})`)
        .in('status', ['pending', 'accepted'])
        .limit(1);
      if (!rows || rows.length === 0) return { canView: false, approved: false, reason: 'owner_privacy' };
    }

    // plan permission (admin-set) applies after the owner's privacy choice
    if (ownerIsPaid && !perm(perms.see_full_photo)) return { canView: false, approved: false, reason: 'plan_upgrade' };

    return { canView: true, approved: false };
  } catch (err) {
    console.error('Photo access error:', err);
    return { canView: false, approved: false }; // fail safe
  }
}

// Kept for compatibility with older imports
export async function computePhotoAccess(supabaseAdmin, viewerId, ownerId, ownerRow) {
  const { canView } = await getPhotoAccess(supabaseAdmin, viewerId, ownerId, ownerRow);
  return canView;
}

// 🛡️ true when the owner has a paid plan and the viewer's plan cannot view paid profiles
export async function isFreeViewingPaid(db, viewerId, ownerId) {
  try {
    const [ownerPlan, viewerPlan] = await Promise.all([activePlanName(db, ownerId), activePlanName(db, viewerId)]);
    if (!isPaidPlan(ownerPlan)) return false;
    if (isPaidPlan(viewerPlan)) return false;
    const perms = await viewerPermissions(db, viewerId, viewerPlan);
    return !perm(perms.can_view_paid_profiles);
  } catch { return false; }
  }
      
