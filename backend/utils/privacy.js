// backend/utils/privacy.js

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

export async function computePhotoAccess(supabaseAdmin, viewerId, ownerId, ownerRow, viewerIsPaid = false) {
  if (!viewerId || !ownerId) return false;
  if (viewerId === ownerId) return true; // Owner always sees

  try {
    // 1. Check if owner is paid and viewer is free
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', ownerId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();
      
    const ownerIsPaid = !!sub && sub.plan.toLowerCase() !== 'free';
    const freeViewingPaid = ownerIsPaid && !viewerIsPaid;
    if (freeViewingPaid) return false;

    // 2. Check Privacy Rules
    const privacy = ownerRow?.photo_privacy || 'public';
    if (privacy === 'private') {
      // Check if viewer has an approved request
      const { data: req } = await supabaseAdmin
        .from('photo_requests')
        .select('status')
        .eq('requester_id', viewerId)
        .eq('owner_id', ownerId)
        .eq('status', 'approved')
        .maybeSingle();
      
      return !!req; // Returns true if approved, false otherwise
    }

    if (privacy === 'matches') {
      const { data: match } = await supabaseAdmin
        .from('interests')
        .select('id')
        .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${ownerId}),and(sender_id.eq.${ownerId},receiver_id.eq.${viewerId})`)
        .eq('status', 'accepted')
        .maybeSingle();
        
      if (!match) return false;
    }

    // Check approved photo requests regardless of privacy
    const { data: approval } = await supabaseAdmin
      .from('photo_requests')
      .select('id')
      .eq('requester_id', viewerId)
      .eq('owner_id', ownerId)
      .eq('status', 'approved')
      .maybeSingle();
      
    if (approval) return true;

    return true; // Public
  } catch (err) {
    console.error("Photo access error:", err);
    return false; // Fail safe
  }
           }
