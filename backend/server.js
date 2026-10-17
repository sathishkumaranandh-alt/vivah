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
// 1. CORS — Allow Main URL + Vercel Previews + Localhost
// ============================================
const ALLOWED_ORIGINS = [
  'https://vivaha-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) return callback(null, true);

      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        // ✅ Allow ALL Vercel preview deployments for this project
        (origin.includes('vivaha-frontend') && origin.endsWith('.vercel.app')) ||
        origin.includes('localhost');

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn('🚫 CORS blocked:', origin);
        callback(new Error('Not allowed by CORS'));
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
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
});

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: 'Too many actions. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  message: { error: 'Too many heartbeats' },
});

const pollingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 400,
  message: { error: 'Polling too fast' },
});

// ============================================
// Apply limiters
// ============================================
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
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
});
