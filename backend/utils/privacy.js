// backend/utils/privacy.js

// 🛡️ Strips sensitive data before sending to another user
export function publicUser(user) {
  if (!user) return null;
  const {
    telegram_chat_id,
    telegram_opt_in,
    custom_permissions,
    role,
    category,
    email, // Hide email by default
    mobile, // Hide mobile by default
    ...safeUser
  } = user;
  
  return safeUser;
}

// 🛡️ Helper to check if a viewer can see full photos
export async function computePhotoAccess(supabaseAdmin, viewerId, ownerId, ownerRow, viewerPerms) {
  if (!viewerId || !ownerId) return false;
  if (viewerId === ownerId) return true;

  // If owner is paid and viewer is not, blur it
  const { data: sub } = await supabaseAdmin.from('subscriptions').select('plan, status').eq('user_id', ownerId).eq('status', 'active').gte('expires_at', new Date().toISOString()).maybeSingle();
  const ownerIsPaid = !!sub && sub.plan.toLowerCase() !== 'free';
  
  const viewerIsPaid = viewerPerms?.isPaid || false;
  const freeViewingPaid = ownerIsPaid && !viewerIsPaid;
  if (freeViewingPaid) return false;

  // Check photo privacy rules
  if (ownerRow.photo_privacy === 'private') return false;
  if (ownerRow.photo_privacy === 'matches') {
    const { data: match } = await supabaseAdmin.from('interests').select('id').or(`and(sender_id.eq.${viewerId},receiver_id.eq.${ownerId}),and(sender_id.eq.${ownerId},receiver_id.eq.${viewerId})`).eq('status', 'accepted').maybeSingle();
    if (!match) return false;
  }

  // Check photo request approvals
  const { data: approval } = await supabaseAdmin.from('photo_requests').select('id').eq('requester_id', viewerId).eq('owner_id', ownerId).eq('status', 'approved').maybeSingle();
  if (approval) return true;

  return true; // By default, show it if no restrictions
    }
