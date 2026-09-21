import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import messageRoutes from "./routes/messages.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import reportRoutes from "./routes/reports.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================
// HEALTH CHECK ROUTES
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Vivaha Matrimony Backend is running 🚀",
    timestamp: new Date().toISOString(),
    routes: [
      "/auth",
      "/profile",
      "/messages",
      "/subscriptions",
      "/reports",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

// ============================================================
// API ROUTES
// ============================================================
app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/messages", messageRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/reports", reportRoutes);

// ============================================================
// 404 HANDLER (for unknown routes)
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));