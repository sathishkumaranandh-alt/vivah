// ============================================================
//  VivahMatch — config/db.js
//  MongoDB connection with retry logic
// ============================================================

const mongoose = require("mongoose");

const MAX_RETRIES   = 5;
const RETRY_DELAY   = 5000; // ms
let   retryCount    = 0;

const connectDB = async () => {
  const URI = process.env.MONGO_URI;

  if (!URI) {
    console.error("❌ MONGO_URI not set in environment variables.");
    process.exit(1);
  }

  const options = {
    useNewUrlParser:    true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    family: 4,           // Use IPv4
    maxPoolSize: 10,     // Max 10 connections in pool
    minPoolSize: 2,
  };

  try {
    const conn = await mongoose.connect(URI, options);
    retryCount = 0;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`⏳ Retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY / 1000}s...`);
      setTimeout(connectDB, RETRY_DELAY);
    } else {
      console.error("💥 Max retries reached. Exiting.");
      process.exit(1);
    }
  }
};

// ── Connection Events ──────────────────────────────────────────
mongoose.connection.on("connected", () =>
  console.log("🟢 Mongoose connected to DB")
);

mongoose.connection.on("error", (err) =>
  console.error("🔴 Mongoose connection error:", err.message)
);

mongoose.connection.on("disconnected", () => {
  console.warn("🟡 Mongoose disconnected. Reconnecting...");
  setTimeout(connectDB, RETRY_DELAY);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Closing DB connection...`);
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed. Exiting.");
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

module.exports = connectDB;
