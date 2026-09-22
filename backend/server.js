import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import messageRoutes from "./routes/messages.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import reportRoutes from "./routes/reports.js";
import auditRoutes from "./routes/audit.js";
import interestRoutes from "./routes/interests.js";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Vivaha Matrimony Backend is running 🚀",
    timestamp: new Date().toISOString(),
    routes: ["/auth", "/profile", "/messages", "/subscriptions", "/reports", "/audit", "/interests", "/settings"],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

// API routes
app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/messages", messageRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/reports", reportRoutes);
app.use("/audit", auditRoutes);
app.use("/interests", interestRoutes);
app.use("/", auditRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl, method: req.method });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));