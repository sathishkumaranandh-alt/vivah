import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// 🔒 SHARED ADMIN MIDDLEWARE
// Verifies requester has role='admin' in DB
// ============================================
export async function requireAdmin(req, res, next) {
  try {
    const adminId =
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
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
        }
