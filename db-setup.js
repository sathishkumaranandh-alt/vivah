// ============================================================
//  VivahMatch — db-setup.js
//  Run ONCE after deploying to create all indexes and
//  configure MongoDB for best performance.
//
//  Run:  node db-setup.js
// ============================================================

require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true, useUnifiedTopology: true,
}).then(() => console.log("✅ Connected for DB setup"))
  .catch(err => { console.error(err); process.exit(1); });

const setup = async () => {
  const db = mongoose.connection.db;
  console.log("\n⚙️  VivahMatch Database Setup\n" + "═".repeat(40));

  // ── USERS COLLECTION ─────────────────────────────────────────
  console.log("\n📁 users collection...");
  const users = db.collection("users");
  await users.createIndex({ email: 1 },          { unique: true, name: "unique_email" });
  await users.createIndex({ gender: 1 },          { name: "idx_gender" });
  await users.createIndex({ premiumPlan: 1 },     { name: "idx_plan" });
  await users.createIndex({ isActive: 1 },        { name: "idx_active" });
  await users.createIndex({ createdAt: -1 },      { name: "idx_created" });
  await users.createIndex({ lastLogin: -1 },      { name: "idx_last_login" });
  await users.createIndex({ "premiumExpiry": 1 }, { name: "idx_premium_expiry", sparse: true });
  console.log("   ✓ 7 indexes created on users");

  // ── PROFILES COLLECTION ───────────────────────────────────────
  console.log("\n📁 profiles collection...");
  const profiles = db.collection("profiles");
  await profiles.createIndex({ user: 1 },                { unique: true, name: "unique_user" });
  await profiles.createIndex({ religion: 1, caste: 1 },  { name: "idx_rel_caste" });
  await profiles.createIndex({ city: 1, state: 1 },      { name: "idx_location" });
  await profiles.createIndex({ age: 1 },                 { name: "idx_age" });
  await profiles.createIndex({ star: 1 },                { name: "idx_star" });
  await profiles.createIndex({ incomeAmount: 1 },        { name: "idx_income" });
  await profiles.createIndex({ isVerified: 1, isHidden: 1 }, { name: "idx_status" });
  await profiles.createIndex({ isFeatured: -1, createdAt: -1 }, { name: "idx_featured" });
  await profiles.createIndex({ completeness: -1 },       { name: "idx_completeness" });
  await profiles.createIndex({ education: 1 },           { name: "idx_education" });
  await profiles.createIndex({ profession: 1 },          { name: "idx_profession" });
  await profiles.createIndex({ profileViews: -1 },       { name: "idx_views" });
  // Text search index
  await profiles.createIndex(
    { city: "text", caste: "text", profession: "text", education: "text", bio: "text" },
    { name: "text_search", weights: { city: 5, caste: 3, profession: 3, education: 2, bio: 1 } }
  );
  console.log("   ✓ 13 indexes created on profiles");

  // ── INTERESTS COLLECTION ──────────────────────────────────────
  console.log("\n📁 interests collection...");
  const interests = db.collection("interests");
  await interests.createIndex({ from: 1, to: 1 },       { unique: true, name: "unique_interest" });
  await interests.createIndex({ to: 1, status: 1 },     { name: "idx_received" });
  await interests.createIndex({ from: 1, createdAt: -1 },{ name: "idx_sent" });
  await interests.createIndex({ status: 1 },            { name: "idx_status" });
  await interests.createIndex({ createdAt: -1 },        { name: "idx_created" });
  console.log("   ✓ 5 indexes created on interests");

  // ── MESSAGES COLLECTION ───────────────────────────────────────
  console.log("\n📁 messages collection...");
  const messages = db.collection("messages");
  await messages.createIndex({ chatId: 1, createdAt: -1 }, { name: "idx_chat_history" });
  await messages.createIndex({ receiver: 1, isRead: 1 },   { name: "idx_unread" });
  await messages.createIndex({ sender: 1, createdAt: -1 }, { name: "idx_sent_msgs" });
  // TTL: auto-delete messages older than 1 year
  await messages.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 365 * 24 * 3600, name: "ttl_messages_1yr" }
  );
  console.log("   ✓ 4 indexes created on messages");

  // ── NOTIFICATIONS COLLECTION ──────────────────────────────────
  console.log("\n📁 notifications collection...");
  const notifs = db.collection("notifications");
  await notifs.createIndex({ user: 1, isRead: 1, createdAt: -1 }, { name: "idx_user_notifs" });
  // TTL: auto-delete notifications older than 90 days
  await notifs.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 90 * 24 * 3600, name: "ttl_notifs_90d" }
  );
  console.log("   ✓ 2 indexes on notifications (with 90-day TTL auto-delete)");

  // ── CONTACTVIEWS COLLECTION ───────────────────────────────────
  console.log("\n📁 contactviews collection...");
  const cvs = db.collection("contactviews");
  await cvs.createIndex({ viewedBy: 1, profileOf: 1 }, { unique: true, name: "unique_view" });
  await cvs.createIndex({ viewedBy: 1, createdAt: 1 }, { name: "idx_viewer_date" });
  // TTL: reset contact views daily (expire records after 24h)
  await cvs.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 24 * 3600, name: "ttl_contact_views_24h" }
  );
  console.log("   ✓ 3 indexes on contactviews (with 24h TTL auto-reset)");

  // ── PAYMENTS COLLECTION ───────────────────────────────────────
  console.log("\n📁 payments collection...");
  const payments = db.collection("payments");
  await payments.createIndex({ user: 1, createdAt: -1 }, { name: "idx_user_payments" });
  await payments.createIndex({ razorpayOrderId: 1 },     { name: "idx_order_id", sparse: true });
  await payments.createIndex({ status: 1 },              { name: "idx_status" });
  console.log("   ✓ 3 indexes on payments");

  // ── PROFILE VIEWS COLLECTION ──────────────────────────────────
  console.log("\n📁 profileviews collection...");
  const pviews = db.collection("profileviews");
  await pviews.createIndex({ viewed: 1, viewedAt: -1 }, { name: "idx_profile_views" });
  await pviews.createIndex({ viewer: 1, viewedAt: -1 }, { name: "idx_viewer" });
  // TTL: keep view logs for 30 days
  await pviews.createIndex(
    { viewedAt: 1 },
    { expireAfterSeconds: 30 * 24 * 3600, name: "ttl_views_30d" }
  );
  console.log("   ✓ 3 indexes on profileviews (with 30-day TTL)");

  // ── REPORTS COLLECTION ────────────────────────────────────────
  console.log("\n📁 reports collection...");
  const reports = db.collection("reports");
  await reports.createIndex({ reportedUser: 1, status: 1 }, { name: "idx_reported" });
  await reports.createIndex({ reportedBy: 1 },              { name: "idx_reporter" });
  console.log("   ✓ 2 indexes on reports");

  // ── SUCCESS STORIES ───────────────────────────────────────────
  console.log("\n📁 successstories collection...");
  const stories = db.collection("successstories");
  await stories.createIndex({ isPublished: 1, createdAt: -1 }, { name: "idx_published" });
  console.log("   ✓ 1 index on successstories");

  // ── VALIDATION RULES (optional) ───────────────────────────────
  console.log("\n📐 Adding collection validation...");
  try {
    await db.command({
      collMod: "users",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name","email","phone","password","gender"],
          properties: {
            email:  { bsonType: "string", pattern: "^[^@]+@[^@]+\\.[^@]+$" },
            gender: { bsonType: "string", enum: ["Bride","Groom"] },
            role:   { bsonType: "string", enum: ["user","admin","moderator"] },
          }
        }
      },
      validationLevel: "moderate",
    });
    console.log("   ✓ User collection validation set");
  } catch (e) {
    console.log("   ℹ️  Validation skipped (may need MongoDB 3.6+)");
  }

  // ── SUMMARY ───────────────────────────────────────────────────
  const allCollections = await db.listCollections().toArray();
  console.log("\n" + "═".repeat(40));
  console.log("✅ DATABASE SETUP COMPLETE!");
  console.log("═".repeat(40));
  console.log(`📦 Collections: ${allCollections.length}`);

  let totalIndexes = 0;
  for (const col of allCollections) {
    const idxs = await db.collection(col.name).listIndexes().toArray();
    totalIndexes += idxs.length;
    console.log(`   ${col.name.padEnd(20)} → ${idxs.length} indexes`);
  }
  console.log(`\n📊 Total indexes: ${totalIndexes}`);
  console.log("═".repeat(40));
  console.log("\n💡 TTL Indexes created:");
  console.log("   messages      → auto-delete after 365 days");
  console.log("   notifications → auto-delete after 90 days");
  console.log("   contactviews  → auto-delete after 24 hours (resets daily contact view count)");
  console.log("   profileviews  → auto-delete after 30 days");
  console.log("═".repeat(40) + "\n");

  mongoose.disconnect();
};

setup().catch(err => {
  console.error("❌ Setup failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
