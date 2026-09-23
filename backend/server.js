import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import messageRoutes from "./routes/messages.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import reportRoutes from "./routes/reports.js";
import auditRoutes from "./routes/audit.js";
import interestRoutes from "./routes/interests.js";
import notificationRoutes from "./routes/notifications.js";
import communityRoutes from "./routes/communities.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Vivaha Matrimony Backend is running 🚀" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", uptime: process.uptime() });
});

app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/messages", messageRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/reports", reportRoutes);
app.use("/audit", auditRoutes);
app.use("/interests", interestRoutes);
app.use("/notifications", notificationRoutes);
app.use("/communities", communityRoutes);
app.use("/", auditRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl, method: req.method });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));