import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Route Imports
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import messageRoutes from './routes/messages.js';
import subscriptionRoutes from './routes/subscriptions.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import interestRoutes from './routes/interests.js';
import userPermissionsRoutes from './routes/userPermissions.js';
import notificationRoutes from './routes/notifications.js';
import photoRoutes from './routes/photos.js';
import communityRoutes from './routes/communities.js';
import visitorsRoutes from './routes/visitors.js';
import formConfigRoutes from './routes/formConfig.js';
import successStoriesRoutes from './routes/successStories.js';
import boostRoutes from './routes/boost.js';
import photoRequestsRoutes from './routes/photoRequests.js';
import contactRequestsRoutes from './routes/contactRequests.js';
import premiumRoutes from './routes/premium.js';
import plansRoutes from './routes/plans.js';
import telegramRoutes from './routes/telegram.js';
import blockRoutes from './routes/blocks.js';

dotenv.config();
const app = express();

// Trust Render's proxy (needed for accurate IP in rate limit)
app.set('trust proxy', 1);

// ============================================
// 1. CORS
// ============================================
const ALLOWED_ORIGINS = [
  'https://vivaha-frontend.vercel.app',
  'https://vivaha-frontend-6756.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        /^https:\/\/vivaha-frontend-[a-z0-9]+\.vercel\.app$/.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn('🚫 CORS blocked:', origin);
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// ============================================
// 2. Body size limit
// ============================================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============================================
// 3. Rate Limiters — Different per route type
// ============================================
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // Was 100 — Chat polling needs more
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // Skip GET requests (polling)
});

// Sensitive user actions (send interest, message, request)
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40, // Was 15 — More breathing room
  message: { error: 'Too many actions. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login/signup
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // Was 5
  message: { error: 'Too many login attempts. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Heartbeat (users send every 60s + tab switches)
const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150, // Was 70
  message: { error: 'Too many heartbeats' },
});

// Polling endpoints — very generous
const pollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 400, // For chat/notifications polling
  message: { error: 'Polling too fast' },
});

// ============================================
// Apply limiters (order matters!)
// ============================================

// Specific endpoints first
app.use('/messages/heartbeat', heartbeatLimiter);

// Polling GETs — generous
app.use('/messages/chat', pollingLimiter);
app.use('/messages/typing-status', pollingLimiter);
app.use('/messages/conversations', pollingLimiter);
app.use('/messages/unread', pollingLimiter);
app.use('/notifications', pollingLimiter);

// Sensitive POST actions — strict
app.use('/messages/send', actionLimiter);
app.use('/interests/send', actionLimiter);
app.use('/interests/respond', actionLimiter);
app.use('/interests/shortlist', actionLimiter);
app.use('/photo-requests/request', actionLimiter);
app.use('/contact-requests/request', actionLimiter);
app.use('/reports', actionLimiter);
app.use('/boost', actionLimiter);

// Auth — strictest
app.use('/auth', authLimiter);

// General fallback
app.use(generalLimiter);

// ============================================
// Routes
// ============================================
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/messages', messageRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/reports', reportRoutes);
app.use('/audit', auditRoutes);
app.use('/interests', interestRoutes);
app.use('/notifications', notificationRoutes);
app.use('/photos', photoRoutes);
app.use('/communities', communityRoutes);
app.use('/visitors', visitorsRoutes);
app.use('/form-config', formConfigRoutes);
app.use('/success-stories', successStoriesRoutes);
app.use('/photo-requests', photoRequestsRoutes);
app.use('/contact-requests', contactRequestsRoutes);
app.use('/user-permissions', userPermissionsRoutes);
app.use('/boost', boostRoutes);
app.use('/premium', premiumRoutes);
app.use('/plans', plansRoutes);
app.use('/telegram', telegramRoutes);
app.use('/blocks', blockRoutes);
app.use('/', auditRoutes);

// ============================================
// Health check
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'Vivaha backend running',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Server error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  const status = err.status || 500;
  res.status(status).json({
    error:
      status === 500
        ? 'Something went wrong. Please try again.'
        : err.message || 'Request failed',
  });
});

// ============================================
// Start server
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
});
