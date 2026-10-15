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

// ============================================
// 1. CORS — Restrict to known origins
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
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) return callback(null, true);

      // Check exact match or vercel preview pattern
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
// 3. Rate Limiters
// ============================================
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Too many requests. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 5 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 70,
  message: { error: 'Too many heartbeats' },
});

// Apply limiters
app.use('/auth', authLimiter);
app.use('/messages/heartbeat', heartbeatLimiter);
app.use('/interests', strictLimiter);
app.use('/messages', strictLimiter);
app.use('/photo-requests', strictLimiter);
app.use('/contact-requests', strictLimiter);
app.use('/reports', strictLimiter);
app.use('/boost', strictLimiter);
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
// 4. Error Handler — No internal info leak
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
