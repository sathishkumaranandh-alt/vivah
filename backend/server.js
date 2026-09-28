import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Route Imports
import authRoutes from './routes/auth.js';
import boostRoutes from './routes/boost.js';
import profileRoutes from './routes/profile.js';
import messageRoutes from './routes/messages.js';
import subscriptionRoutes from './routes/subscriptions.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import interestRoutes from './routes/interests.js';
import notificationRoutes from './routes/notifications.js';
import photoRoutes from './routes/photos.js';
import communityRoutes from './routes/communities.js';
import visitorsRoutes from './routes/visitors.js';
import formConfigRoutes from './routes/formConfig.js';
import successStoriesRoutes from './routes/successStories.js';

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/boost', boostRoutes);
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

// Settings routes (these were part of audit.js)
app.use('/', auditRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Vivaha backend running', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
