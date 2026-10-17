import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // JWT Token illa-na direct-a block pannidum
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

export async function requireAdmin(req, res, next) {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { data: admin, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.userId)
      .single();

    if (error || !admin || admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.adminId = req.userId;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
      }
