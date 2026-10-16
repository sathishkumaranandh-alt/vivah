import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// 🔒 AUTH MIDDLEWARE — Verify Supabase JWT
// Sets req.userId from verified token
// ============================================
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // ── JWT path (secure)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.userId = user.id;
      req.userEmail = user.email;
      req.isLegacy = false;
      return next();
    }

    // ── Fallback path (legacy) — for backward compat during rollout
    const legacyId =
      req.body?.user_id ||
      req.body?.sender_id ||
      req.body?.requester_id ||
      req.query?.userId ||
      req.query?.viewerId ||
      req.query?.requesterId ||
      req.query?.admin_id ||
      req.headers['x-admin-id'];

    if (legacyId) {
      // ⚠️ Log for monitoring — will be removed after full rollout
      console.warn('⚠️ LEGACY AUTH (no JWT):', {
        userId: legacyId,
        method: req.method,
        path: req.path,
      });

      req.userId = legacyId;
      req.isLegacy = true;
      return next();
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

// ============================================
// 🔒 ADMIN MIDDLEWARE — Verify admin role
// Uses req.userId if set, otherwise falls back to admin_id
// ============================================
export async function requireAdmin(req, res, next) {
  try {
    const adminId =
      req.userId ||
      req.query.admin_id ||
      req.headers['x-admin-id'] ||
      req.body?.admin_id;

    if (!adminId) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { data: admin, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', adminId)
      .single();

    if (error || !admin || admin.role !== 'admin') {
      console.warn('🚫 Unauthorized admin attempt:', adminId);
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.adminId = adminId;
    req.userId = adminId;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
  }
