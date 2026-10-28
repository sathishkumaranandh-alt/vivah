import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import paymentRoutes from './routes/payments.js';


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

// Trust Render's proxy
app.set('trust proxy', 1);

// ============================================
// 🛡️ 1. SECURITY HEADERS (no extra package needed)
// ============================================
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // API is called from the frontend domain
  res.setHeader('Cache-Control', 'no-store'); // API responses contain private data

  // 🛡️ Never leak internal DB / library error text on 5xx responses.
  // (Routes that deliberately show a message set res.locals.exposeError = true)
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && body.error && !res.locals.exposeError) {
      console.error('❌ 5xx hidden from client:', req.method, req.path, '→', body.error);
      body = { ...body, error: 'Something went wrong. Please try again.' };
      delete body.details;
    }
    return originalJson(body);
  };
  next();
});


// ============================================
// 🛡️ 2. STRICT CORS
// ============================================
const ALLOWED_ORIGINS = [
  'https://vivaha-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      // 🛡️ No wildcard: only the exact production site (+ extra origins you list in the EXTRA_ORIGINS env var, comma separated)
      const extra = (process.env.EXTRA_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
      const isVercelPreview = extra.includes(origin);
      const isExactLocalhost = origin === 'http://localhost:3000' || origin === 'http://localhost:5173';

      if (ALLOWED_ORIGINS.includes(origin) || isVercelPreview || (process.env.NODE_ENV === 'development' && isExactLocalhost)) {
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
// 3. Body size limit
// ============================================
app.use(express.json({
  limit: '2mb',
  // keep the exact bytes: Cashfree webhook signature is calculated over the raw body
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ============================================
// 🛡️ 4. RATE LIMITERS
// ============================================
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: 'Too many actions. Please wait a minute.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in a minute.' },
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

// Apply limiters
app.use('/messages/heartbeat', heartbeatLimiter);
app.use('/messages/chat', pollingLimiter);
app.use('/messages/typing-status', pollingLimiter);
app.use('/messages/conversations', pollingLimiter);
app.use('/messages/unread', pollingLimiter);
app.use('/notifications', pollingLimiter);

app.use('/messages/send', actionLimiter);
app.use('/interests/send', actionLimiter);
app.use('/interests/respond', actionLimiter);
app.use('/interests/shortlist', actionLimiter);
app.use('/photo-requests/request', actionLimiter);
app.use('/contact-requests/request', actionLimiter);
app.use('/reports', actionLimiter);
app.use('/boost', actionLimiter);
app.use('/payments', actionLimiter);
app.use('/telegram/generate-token', actionLimiter);

app.use('/auth', authLimiter);
app.use(generalLimiter); 

// ============================================
// 5. Routes
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
app.use('/payments', paymentRoutes);
app.use('/blocks', blockRoutes);


// 🛡️ FIX: Mount auditRoutes on root (/) as well so /settings works
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
    error: status === 500 ? 'Something went wrong. Please try again.' : err.message || 'Request failed',
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
                
