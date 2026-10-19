import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// 🔒 AUTH MIDDLEWARE — Verify Supabase JWT
// ============================================
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // JWT Token இல்லைனா உடனே Block பண்ணும்
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // இது தான் மத்த எல்லா Route-க்கும் யார் Request அனுப்புறாங்கனு சொல்லும்
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

// ============================================
// 🔒 ADMIN MIDDLEWARE — Verify admin role
// ============================================
export async function requireAdmin(req, res, next) {
  // 🛡️ Admin Check பண்றதுக்கு முன்னாடி Auth Check நடக்கணும்
  if (!req.userId) {
    // User Auth ஆகலைனா, முதல்ல requireAuth-ஐ ரன் பண்ணி, அது முடிஞ்சதும் checkAdminRole-ஐ கூப்பிடும்
    return requireAuth(req, res, async () => {
      await checkAdminRole(req, res, next);
    });
  }
  // ஏற்கனவே Auth ஆகியிருந்தா நேரடியா Admin Role-ஐ செக் பண்ணும்
  await checkAdminRole(req, res, next);
}

async function checkAdminRole(req, res, next) {
  try {
    const { data: admin, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.userId)
      .single();

    if (error || !admin || admin.role !== 'admin') {
      console.warn('🚫 Unauthorized admin attempt:', req.userId);
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.adminId = req.userId;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ error: 'Admin check failed' });
  }
}
