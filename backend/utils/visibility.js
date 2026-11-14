// backend/utils/visibility.js
// "Who can see my profile" (profile_visibility: everyone | verified | paid | matches) for LISTS
// (search, recommendations, advanced search, premium matches).
// The single-profile page already enforces the same rules; this keeps lists consistent with it,
// so a member who chose "Matches only" / "Paid only" / "Verified only" does not show up for everyone else.
import { MATCH_STATUSES } from './privacy.js';

export async function filterByProfileVisibility(supabaseAdmin, viewerId, users, viewerIsPaid) {
  try {
    const list = users || [];
    const restricted = list.filter((u) => u.id !== viewerId && u.profile_visibility && u.profile_visibility !== 'everyone');
    if (restricted.length === 0) return list;

    let viewerVerified = false;
    if (restricted.some((u) => u.profile_visibility === 'verified')) {
      const { data: v } = await supabaseAdmin.from('users').select('is_verified').eq('id', viewerId).maybeSingle();
      viewerVerified = !!v?.is_verified;
    }

    const matched = new Set();
    const matchIds = restricted.filter((u) => u.profile_visibility === 'matches').map((u) => u.id);
    if (matchIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from('interests')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`)
        .in('status', MATCH_STATUSES);
      (rows || []).forEach((r) => {
        const other = r.sender_id === viewerId ? r.receiver_id : r.sender_id;
        matched.add(other);
      });
    }

    return list.filter((u) => {
      if (u.id === viewerId) return true;
      switch (u.profile_visibility) {
        case 'paid': return !!viewerIsPaid;
        case 'verified': return viewerVerified;
        case 'matches': return matched.has(u.id);
        default: return true;
      }
    });
  } catch (e) {
    console.error('filterByProfileVisibility error (list left unfiltered):', e.message);
    return users || [];
  }
}
