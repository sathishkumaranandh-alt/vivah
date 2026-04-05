// ============================================================
//  VivahMatch Backend — server.js
//  Stack: Node.js · Express · MongoDB (Mongoose) · JWT
//  Deploy: Render.com (free tier)
// ============================================================
//
//  SETUP (run once locally or in Render shell):
//    npm install express mongoose bcryptjs jsonwebtoken
//                dotenv cors multer cloudinary
//                multer-storage-cloudinary express-validator
//                morgan helmet express-rate-limit
//
//  ENV VARIABLES (set in Render dashboard):
//    MONGO_URI        = mongodb+srv://...
//    JWT_SECRET       = any_long_random_string
//    PORT             = 5000
//    CLOUDINARY_NAME  = your_cloud_name
//    CLOUDINARY_KEY   = your_api_key
//    CLOUDINARY_SEC   = your_api_secret
//    CLIENT_URL       = https://your-frontend.com
// ============================================================

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

// ──────────────────────────────────────────────────────────────
//  CLOUDINARY CONFIG
// ──────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SEC,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "vivah-match", allowed_formats: ["jpg","jpeg","png","webp"] },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

// ──────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  credentials: true,
}));
app.use(express.json({ limit: "10kb" }));
app.use(morgan("dev"));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: "Too many requests, please try again later." },
}));

// Strict rate limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
});

// ──────────────────────────────────────────────────────────────
//  DATABASE CONNECTION
// ──────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_PUBLIC_URL) || process.env.MONGO_URL,{
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => { console.error("❌ MongoDB error:", err); process.exit(1); });
// ──────────────────────────────────────────────────────────────
//  MONGOOSE SCHEMAS
// ──────────────────────────────────────────────────────────────

// --- User Schema ---
const UserSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  password:    { type: String, required: true, minlength: 6 },
  gender:      { type: String, enum: ["Bride","Groom"], required: true },
  role:        { type: String, enum: ["user","admin"], default: "user" },
  isActive:    { type: Boolean, default: true },
  isPremium:   { type: Boolean, default: false },
  premiumPlan: { type: String, enum: ["free","gold","diamond"], default: "free" },
  premiumExpiry: { type: Date },
  lastLogin:   { type: Date },
  profileComplete: { type: Boolean, default: false },
}, { timestamps: true });

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

const User = mongoose.model("User", UserSchema);

// --- Profile Schema ---
const ProfileSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  // Personal
  dob:           { type: Date },
  age:           { type: Number },
  height:        { type: String },
  weight:        { type: String },
  complexion:    { type: String },
  bodyType:      { type: String },
  // Religion
  religion:      { type: String },
  caste:         { type: String },
  subCaste:      { type: String },
  gothra:        { type: String },
  // Astrology
  star:          { type: String },
  rashi:         { type: String },
  mangalik:      { type: String, enum: ["Yes","No","Partial","Don't know"], default: "Don't know" },
  timeOfBirth:   { type: String },
  placeOfBirth:  { type: String },
  // Location
  city:          { type: String },
  state:         { type: String },
  country:       { type: String, default: "India" },
  // Education & Career
  education:     { type: String },
  educationDetail: { type: String },
  profession:    { type: String },
  company:       { type: String },
  income:        { type: String },
  // Family
  familyType:    { type: String, enum: ["Joint","Nuclear","Extended"] },
  familyStatus:  { type: String, enum: ["Middle class","Upper middle class","Rich","Affluent"] },
  fatherOccupation: { type: String },
  motherOccupation: { type: String },
  siblings:      { type: Number, default: 0 },
  // Lifestyle
  diet:          { type: String, enum: ["Vegetarian","Non-Vegetarian","Eggetarian","Vegan"] },
  smoking:       { type: String, enum: ["No","Occasionally","Yes"], default: "No" },
  drinking:      { type: String, enum: ["No","Occasionally","Yes"], default: "No" },
  languages:     [{ type: String }],
  hobbies:       [{ type: String }],
  // Bio
  bio:           { type: String, maxlength: 1000 },
  lookingFor:    { type: String, maxlength: 500 },
  // Photos
  photos:        [{ url: String, publicId: String, isPrimary: Boolean }],
  // Partner Preferences
  partnerAgeMin:     { type: Number, default: 21 },
  partnerAgeMax:     { type: Number, default: 35 },
  partnerHeightMin:  { type: String },
  partnerReligion:   [{ type: String }],
  partnerCaste:      [{ type: String }],
  partnerEducation:  [{ type: String }],
  partnerProfession: [{ type: String }],
  partnerCity:       [{ type: String }],
  partnerIncome:     { type: String },
  partnerMangalik:   { type: String },
  // Status
  isVerified:    { type: Boolean, default: false },
  verifiedAt:    { type: Date },
  profileViews:  { type: Number, default: 0 },
  isHidden:      { type: Boolean, default: false },
}, { timestamps: true });

const Profile = mongoose.model("Profile", ProfileSchema);

// --- Interest Schema ---
const InterestSchema = new mongoose.Schema({
  from:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:  { type: String, enum: ["pending","accepted","declined"], default: "pending" },
  message: { type: String, maxlength: 300 },
}, { timestamps: true });

InterestSchema.index({ from: 1, to: 1 }, { unique: true });

const Interest = mongoose.model("Interest", InterestSchema);

// --- Message Schema ---
const MessageSchema = new mongoose.Schema({
  chatId:    { type: String, required: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text:      { type: String, required: true, maxlength: 1000 },
  isRead:    { type: Boolean, default: false },
  readAt:    { type: Date },
}, { timestamps: true });

MessageSchema.index({ chatId: 1, createdAt: -1 });

const Message = mongoose.model("Message", MessageSchema);

// --- Contact View Schema ---
const ContactViewSchema = new mongoose.Schema({
  viewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  profileOf:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

ContactViewSchema.index({ viewedBy: 1, profileOf: 1 }, { unique: true });

const ContactView = mongoose.model("ContactView", ContactViewSchema);

// --- Notification Schema ---
const NotificationSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type:    { type: String, enum: ["interest","accepted","message","view","system"], required: true },
  title:   { type: String, required: true },
  body:    { type: String },
  link:    { type: String },
  isRead:  { type: Boolean, default: false },
  from:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

const Notification = mongoose.model("Notification", NotificationSchema);

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const sendRes = (res, status, success, message, data = {}) =>
  res.status(status).json({ success, message, ...data });

// Validate middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendRes(res, 400, false, errors.array()[0].msg);
  next();
};

// ──────────────────────────────────────────────────────────────
//  AUTH MIDDLEWARE
// ──────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return sendRes(res, 401, false, "Not authorized. No token.");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return sendRes(res, 401, false, "User no longer exists.");
    if (!req.user.isActive) return sendRes(res, 401, false, "Account has been deactivated.");
    next();
  } catch (err) {
    return sendRes(res, 401, false, "Token invalid or expired.");
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") return sendRes(res, 403, false, "Admin access required.");
  next();
};

const premiumRequired = (plan = "gold") => (req, res, next) => {
  const plans = { free: 0, gold: 1, diamond: 2 };
  if (plans[req.user.premiumPlan] < plans[plan]) {
    return sendRes(res, 403, false, `This feature requires ${plan} plan or higher.`);
  }
  next();
};

// Plan limits
const PLAN_LIMITS = {
  free:    { interestsPerDay: 5, contactViews: 0, profileViews: 10 },
  gold:    { interestsPerDay: 50, contactViews: 50, profileViews: 999 },
  diamond: { interestsPerDay: 999, contactViews: 999, profileViews: 999 },
};

// ──────────────────────────────────────────────────────────────
//  ROUTES
// ──────────────────────────────────────────────────────────────

// ── 1. HEALTH ─────────────────────────────────────────────────
app.get("/", (req, res) =>
  res.json({ success: true, message: "VivahMatch API is running 🚀", version: "1.0.0" })
);
app.get("/health", (req, res) =>
  res.json({ success: true, status: "healthy", uptime: process.uptime(), db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" })
);

// ── 2. AUTH ROUTES ─────────────────────────────────────────────
const authRouter = express.Router();

// REGISTER
authRouter.post("/register", authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().withMessage("Phone number is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("gender").isIn(["Bride","Groom"]).withMessage("Gender must be Bride or Groom"),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, email, phone, password, gender } = req.body;
      const exists = await User.findOne({ email });
      if (exists) return sendRes(res, 400, false, "Email already registered.");
      const user = await User.create({ name, email, phone, password, gender });
      // Create empty profile
      await Profile.create({ user: user._id });
      const token = generateToken(user._id);
      return sendRes(res, 201, true, "Account created successfully!", {
        token,
        user: { id: user._id, name, email, gender, role: user.role, premiumPlan: user.premiumPlan }
      });
    } catch (err) {
      console.error(err);
      return sendRes(res, 500, false, "Registration failed. Try again.");
    }
  }
);

// LOGIN
authRouter.post("/login", authLimiter,
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await user.matchPassword(password)))
        return sendRes(res, 401, false, "Invalid email or password.");
      if (!user.isActive)
        return sendRes(res, 401, false, "Account deactivated. Contact support.");
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });
      const token = generateToken(user._id);
      return sendRes(res, 200, true, "Login successful!", {
        token,
        user: { id: user._id, name: user.name, email: user.email, gender: user.gender, role: user.role, premiumPlan: user.premiumPlan, isPremium: user.isPremium }
      });
    } catch (err) {
      return sendRes(res, 500, false, "Login failed. Try again.");
    }
  }
);

// GET ME
authRouter.get("/me", protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    return sendRes(res, 200, true, "User fetched", { user: req.user, profile });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch user.");
  }
});

// CHANGE PASSWORD
authRouter.put("/change-password", protect,
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be 6+ chars"),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      if (!(await user.matchPassword(req.body.currentPassword)))
        return sendRes(res, 400, false, "Current password is incorrect.");
      user.password = req.body.newPassword;
      await user.save();
      return sendRes(res, 200, true, "Password changed successfully.");
    } catch (err) {
      return sendRes(res, 500, false, "Failed to change password.");
    }
  }
);

app.use("/api/auth", authRouter);

// ── 3. PROFILE ROUTES ─────────────────────────────────────────
const profileRouter = express.Router();

// GET OWN PROFILE
profileRouter.get("/me", protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id }).populate("user", "name email gender phone premiumPlan isPremium");
    if (!profile) return sendRes(res, 404, false, "Profile not found.");
    return sendRes(res, 200, true, "Profile fetched", { profile });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch profile.");
  }
});

// UPDATE PROFILE
profileRouter.put("/me", protect, async (req, res) => {
  try {
    const allowed = ["dob","age","height","weight","complexion","bodyType","religion","caste","subCaste","gothra","star","rashi","mangalik","timeOfBirth","placeOfBirth","city","state","country","education","educationDetail","profession","company","income","familyType","familyStatus","fatherOccupation","motherOccupation","siblings","diet","smoking","drinking","languages","hobbies","bio","lookingFor","partnerAgeMin","partnerAgeMax","partnerHeightMin","partnerReligion","partnerCaste","partnerEducation","partnerProfession","partnerCity","partnerIncome","partnerMangalik","isHidden"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const profile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    // Mark profile complete if basic fields filled
    const isComplete = profile.religion && profile.city && profile.education && profile.profession && profile.bio;
    if (isComplete && !req.user.profileComplete) {
      await User.findByIdAndUpdate(req.user._id, { profileComplete: true });
    }

    return sendRes(res, 200, true, "Profile updated successfully.", { profile });
  } catch (err) {
    console.error(err);
    return sendRes(res, 500, false, "Profile update failed.");
  }
});

// UPLOAD PHOTO
profileRouter.post("/me/photos", protect, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return sendRes(res, 400, false, "No photo uploaded.");

    const profile = await Profile.findOne({ user: req.user._id });

    // Check photo limit by plan
    const maxPhotos = { free: 2, gold: 10, diamond: 30 }[req.user.premiumPlan] || 2;
    if (profile.photos.length >= maxPhotos)
      return sendRes(res, 400, false, `Your plan allows max ${maxPhotos} photos. Upgrade to add more.`);

    const isPrimary = profile.photos.length === 0;
    profile.photos.push({ url: req.file.path, publicId: req.file.filename, isPrimary });
    await profile.save();

    return sendRes(res, 201, true, "Photo uploaded successfully.", { photos: profile.photos });
  } catch (err) {
    return sendRes(res, 500, false, "Photo upload failed.");
  }
});

// DELETE PHOTO
profileRouter.delete("/me/photos/:publicId", protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    const photo = profile.photos.find(p => p.publicId === req.params.publicId);
    if (!photo) return sendRes(res, 404, false, "Photo not found.");

    await cloudinary.uploader.destroy(photo.publicId);
    profile.photos = profile.photos.filter(p => p.publicId !== req.params.publicId);
    if (profile.photos.length > 0 && !profile.photos.some(p => p.isPrimary)) {
      profile.photos[0].isPrimary = true;
    }
    await profile.save();
    return sendRes(res, 200, true, "Photo deleted.", { photos: profile.photos });
  } catch (err) {
    return sendRes(res, 500, false, "Could not delete photo.");
  }
});

// SET PRIMARY PHOTO
profileRouter.put("/me/photos/:publicId/primary", protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    profile.photos.forEach(p => { p.isPrimary = p.publicId === req.params.publicId; });
    await profile.save();
    return sendRes(res, 200, true, "Primary photo updated.", { photos: profile.photos });
  } catch (err) {
    return sendRes(res, 500, false, "Could not update primary photo.");
  }
});

// SEARCH PROFILES
profileRouter.get("/search", protect, async (req, res) => {
  try {
    const {
      gender, ageMin = 18, ageMax = 60, religion, caste, city, state,
      education, profession, incomeMin, star, rashi, mangalik,
      page = 1, limit = 12, sort = "newest"
    } = req.query;

    const searchGender = gender || (req.user.gender === "Bride" ? "Groom" : "Bride");

    // Find user IDs of opposite gender
    const userIds = await User.find({ gender: searchGender, isActive: true }).distinct("_id");

    const query = {
      user: { $in: userIds, $ne: req.user._id },
      isHidden: { $ne: true },
    };

    if (ageMin || ageMax) query.age = { $gte: +ageMin, $lte: +ageMax };
    if (religion) query.religion = religion;
    if (caste) query.caste = new RegExp(caste, "i");
    if (city) query.city = new RegExp(city, "i");
    if (state) query.state = new RegExp(state, "i");
    if (education) query.education = new RegExp(education, "i");
    if (profession) query.profession = new RegExp(profession, "i");
    if (star) query.star = star;
    if (rashi) query.rashi = rashi;
    if (mangalik) query.mangalik = mangalik;

    const sortMap = {
      newest:  { createdAt: -1 },
      oldest:  { createdAt: 1 },
      "age-asc": { age: 1 },
      "age-desc": { age: -1 },
    };
    const sortOption = sortMap[sort] || sortMap.newest;

    const skip = (page - 1) * Math.min(+limit, 30);
    const total = await Profile.countDocuments(query);
    const profiles = await Profile.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Math.min(+limit, 30))
      .populate("user", "name gender isPremium premiumPlan profileComplete")
      .select("-partnerReligion -partnerCaste -partnerEducation -partnerProfession");

    return sendRes(res, 200, true, "Profiles fetched", {
      profiles,
      pagination: { total, page: +page, pages: Math.ceil(total / +limit), limit: +limit }
    });
  } catch (err) {
    console.error(err);
    return sendRes(res, 500, false, "Search failed.");
  }
});

// GET SINGLE PROFILE (and increment view count)
profileRouter.get("/:userId", protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.params.userId })
      .populate("user", "name gender isPremium premiumPlan createdAt");

    if (!profile || profile.isHidden) return sendRes(res, 404, false, "Profile not found.");

    // Increment view count (not for own profile)
    if (req.params.userId !== req.user._id.toString()) {
      await Profile.findOneAndUpdate({ user: req.params.userId }, { $inc: { profileViews: 1 } });
      // Create notification for profile owner
      await Notification.create({
        user: req.params.userId,
        type: "view",
        title: "Someone viewed your profile",
        body: `${req.user.name} viewed your profile`,
        from: req.user._id,
      });
    }

    // Hide contact details for non-premium or if not interest-accepted
    let showContact = false;
    if (req.user.premiumPlan !== "free") {
      const alreadyViewed = await ContactView.findOne({ viewedBy: req.user._id, profileOf: req.params.userId });
      if (alreadyViewed) {
        showContact = true;
      } else {
        const limit = PLAN_LIMITS[req.user.premiumPlan].contactViews;
        const viewedToday = await ContactView.countDocuments({
          viewedBy: req.user._id,
          createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
        });
        if (viewedToday < limit) {
          await ContactView.create({ viewedBy: req.user._id, profileOf: req.params.userId });
          showContact = true;
        }
      }
    }

    const profileData = profile.toObject();
    if (!showContact) {
      delete profileData.user.phone;
    }

    return sendRes(res, 200, true, "Profile fetched", { profile: profileData, showContact });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch profile.");
  }
});

// SHORTLIST (Like) PROFILES
profileRouter.post("/:userId/shortlist", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const shortlisted = user.shortlisted || [];
    const idx = shortlisted.findIndex(id => id.toString() === req.params.userId);
    let action;
    if (idx > -1) {
      shortlisted.splice(idx, 1);
      action = "removed";
    } else {
      shortlisted.push(req.params.userId);
      action = "added";
    }
    await User.findByIdAndUpdate(req.user._id, { shortlisted });
    return sendRes(res, 200, true, `Profile ${action} from shortlist.`, { action });
  } catch (err) {
    return sendRes(res, 500, false, "Shortlist action failed.");
  }
});

app.use("/api/profiles", profileRouter);

// ── 4. INTEREST ROUTES ─────────────────────────────────────────
const interestRouter = express.Router();

// SEND INTEREST
interestRouter.post("/send/:toUserId", protect, async (req, res) => {
  try {
    if (req.params.toUserId === req.user._id.toString())
      return sendRes(res, 400, false, "Cannot send interest to yourself.");

    // Check daily limit
    const limit = PLAN_LIMITS[req.user.premiumPlan].interestsPerDay;
    const sentToday = await Interest.countDocuments({
      from: req.user._id,
      createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
    });
    if (sentToday >= limit)
      return sendRes(res, 429, false, `Daily interest limit (${limit}) reached. Upgrade your plan.`);

    const existing = await Interest.findOne({ from: req.user._id, to: req.params.toUserId });
    if (existing) return sendRes(res, 400, false, "Interest already sent.");

    const interest = await Interest.create({
      from: req.user._id,
      to: req.params.toUserId,
      message: req.body.message || "",
    });

    // Notify receiver
    await Notification.create({
      user: req.params.toUserId,
      type: "interest",
      title: "New Interest Received!",
      body: `${req.user.name} has sent you an interest.`,
      from: req.user._id,
    });

    return sendRes(res, 201, true, "Interest sent successfully!", { interest });
  } catch (err) {
    return sendRes(res, 500, false, "Could not send interest.");
  }
});

// RESPOND TO INTEREST
interestRouter.put("/:interestId/respond", protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted","declined"].includes(status))
      return sendRes(res, 400, false, "Status must be 'accepted' or 'declined'.");

    const interest = await Interest.findById(req.params.interestId);
    if (!interest) return sendRes(res, 404, false, "Interest not found.");
    if (interest.to.toString() !== req.user._id.toString())
      return sendRes(res, 403, false, "Not authorized.");
    if (interest.status !== "pending")
      return sendRes(res, 400, false, "Interest already responded to.");

    interest.status = status;
    await interest.save();

    // Notify sender
    await Notification.create({
      user: interest.from,
      type: "accepted",
      title: status === "accepted" ? "Interest Accepted! 🎉" : "Interest Declined",
      body: status === "accepted"
        ? `${req.user.name} has accepted your interest. Start a conversation!`
        : `${req.user.name} has declined your interest.`,
      from: req.user._id,
    });

    return sendRes(res, 200, true, `Interest ${status}.`, { interest });
  } catch (err) {
    return sendRes(res, 500, false, "Could not respond to interest.");
  }
});

// GET RECEIVED INTERESTS
interestRouter.get("/received", protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { to: req.user._id };
    if (status) query.status = status;

    const total = await Interest.countDocuments(query);
    const interests = await Interest.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * +limit)
      .limit(+limit)
      .populate({ path: "from", select: "name gender", populate: { path: "profile", model: "Profile", select: "city education profession photos age" } });

    return sendRes(res, 200, true, "Received interests fetched", {
      interests,
      pagination: { total, page: +page, pages: Math.ceil(total / +limit) }
    });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch interests.");
  }
});

// GET SENT INTERESTS
interestRouter.get("/sent", protect, async (req, res) => {
  try {
    const interests = await Interest.find({ from: req.user._id })
      .sort({ createdAt: -1 })
      .populate("to", "name gender");
    return sendRes(res, 200, true, "Sent interests fetched", { interests });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch sent interests.");
  }
});

// GET MATCHES (mutually accepted)
interestRouter.get("/matches", protect, async (req, res) => {
  try {
    const accepted = await Interest.find({
      $or: [{ from: req.user._id }, { to: req.user._id }],
      status: "accepted",
    }).populate("from to", "name gender");

    const matches = accepted.map(i => ({
      interest: i,
      partner: i.from._id.toString() === req.user._id.toString() ? i.to : i.from,
    }));

    return sendRes(res, 200, true, "Matches fetched", { matches });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch matches.");
  }
});

app.use("/api/interests", interestRouter);

// ── 5. MESSAGE ROUTES ──────────────────────────────────────────
const messageRouter = express.Router();

const getChatId = (a, b) => [a, b].sort().join("_");

// SEND MESSAGE (only if interest accepted)
messageRouter.post("/send/:toUserId", protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return sendRes(res, 400, false, "Message cannot be empty.");

    // Check if interest is accepted between the two users
    const accepted = await Interest.findOne({
      $or: [
        { from: req.user._id, to: req.params.toUserId, status: "accepted" },
        { from: req.params.toUserId, to: req.user._id, status: "accepted" }
      ]
    });

    if (!accepted && req.user.premiumPlan === "free")
      return sendRes(res, 403, false, "You can only chat after interest is accepted. Upgrade to Diamond to chat freely.");

    const chatId = getChatId(req.user._id.toString(), req.params.toUserId);
    const message = await Message.create({
      chatId,
      sender: req.user._id,
      receiver: req.params.toUserId,
      text: text.trim(),
    });

    // Notify receiver
    await Notification.create({
      user: req.params.toUserId,
      type: "message",
      title: `New message from ${req.user.name}`,
      body: text.slice(0, 60),
      from: req.user._id,
    });

    return sendRes(res, 201, true, "Message sent.", { message });
  } catch (err) {
    return sendRes(res, 500, false, "Message failed.");
  }
});

// GET CHAT HISTORY
messageRouter.get("/chat/:withUserId", protect, async (req, res) => {
  try {
    const chatId = getChatId(req.user._id.toString(), req.params.withUserId);
    const { page = 1, limit = 30 } = req.query;

    const total = await Message.countDocuments({ chatId });
    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * +limit)
      .limit(+limit);

    // Mark as read
    await Message.updateMany(
      { chatId, receiver: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return sendRes(res, 200, true, "Messages fetched", {
      messages: messages.reverse(),
      pagination: { total, page: +page, pages: Math.ceil(total / +limit) }
    });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch messages.");
  }
});

// GET ALL CHATS (inbox)
messageRouter.get("/inbox", protect, async (req, res) => {
  try {
    // Get distinct chatIds involving this user
    const msgs = await Message.aggregate([
      { $match: { $or: [{ sender: req.user._id }, { receiver: req.user._id }] } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$chatId", lastMessage: { $first: "$$ROOT" } } },
      { $sort: { "lastMessage.createdAt": -1 } },
    ]);

    const inbox = await Promise.all(msgs.map(async (m) => {
      const otherId = m.lastMessage.sender.toString() === req.user._id.toString()
        ? m.lastMessage.receiver : m.lastMessage.sender;
      const other = await User.findById(otherId).select("name gender");
      const unread = await Message.countDocuments({ chatId: m._id, receiver: req.user._id, isRead: false });
      return { chatId: m._id, partner: other, lastMessage: m.lastMessage, unread };
    }));

    return sendRes(res, 200, true, "Inbox fetched", { inbox });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch inbox.");
  }
});

app.use("/api/messages", messageRouter);

// ── 6. NOTIFICATION ROUTES ─────────────────────────────────────
const notifRouter = express.Router();

notifRouter.get("/", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Notification.countDocuments({ user: req.user._id });
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * +limit)
      .limit(+limit)
      .populate("from", "name");
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    return sendRes(res, 200, true, "Notifications fetched", {
      notifications, unreadCount,
      pagination: { total, page: +page, pages: Math.ceil(total / +limit) }
    });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch notifications.");
  }
});

notifRouter.put("/mark-read", protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    return sendRes(res, 200, true, "All notifications marked as read.");
  } catch (err) {
    return sendRes(res, 500, false, "Failed to mark notifications.");
  }
});

notifRouter.delete("/:id", protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    return sendRes(res, 200, true, "Notification deleted.");
  } catch (err) {
    return sendRes(res, 500, false, "Could not delete notification.");
  }
});

app.use("/api/notifications", notifRouter);

// ── 7. PAYMENT / PLAN UPGRADE ─────────────────────────────────
const planRouter = express.Router();

planRouter.post("/upgrade", protect, async (req, res) => {
  try {
    const { plan, durationMonths = 1 } = req.body;
    if (!["gold","diamond"].includes(plan))
      return sendRes(res, 400, false, "Invalid plan. Choose gold or diamond.");

    // In production, integrate Razorpay here and verify payment
    // For now, direct upgrade (demo)
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + +durationMonths);

    await User.findByIdAndUpdate(req.user._id, {
      premiumPlan: plan,
      isPremium: true,
      premiumExpiry: expiry,
    });

    await Notification.create({
      user: req.user._id,
      type: "system",
      title: `🎉 Upgraded to ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan!`,
      body: `Your ${plan} plan is active until ${expiry.toDateString()}. Enjoy premium features!`,
    });

    return sendRes(res, 200, true, `Successfully upgraded to ${plan} plan!`, {
      plan, expiry
    });
  } catch (err) {
    return sendRes(res, 500, false, "Upgrade failed.");
  }
});

planRouter.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("premiumPlan isPremium premiumExpiry");
    const limits = PLAN_LIMITS[user.premiumPlan];
    return sendRes(res, 200, true, "Plan status fetched", { user, limits });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch plan status.");
  }
});

app.use("/api/plan", planRouter);

// ── 8. ADMIN ROUTES ────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(protect, adminOnly);

// Dashboard stats
adminRouter.get("/stats", async (req, res) => {
  try {
    const [totalUsers, totalProfiles, totalInterests, totalMessages, premiumUsers, brides, grooms, verifiedProfiles] = await Promise.all([
      User.countDocuments(),
      Profile.countDocuments(),
      Interest.countDocuments(),
      Message.countDocuments(),
      User.countDocuments({ isPremium: true }),
      User.countDocuments({ gender: "Bride" }),
      User.countDocuments({ gender: "Groom" }),
      Profile.countDocuments({ isVerified: true }),
    ]);

    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select("name email gender premiumPlan createdAt");

    return sendRes(res, 200, true, "Admin stats fetched", {
      stats: { totalUsers, totalProfiles, totalInterests, totalMessages, premiumUsers, brides, grooms, verifiedProfiles },
      recentUsers
    });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch stats.");
  }
});

// List all users
adminRouter.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, gender, plan, search } = req.query;
    const query = {};
    if (gender) query.gender = gender;
    if (plan) query.premiumPlan = plan;
    if (search) query.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
    ];
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * +limit)
      .limit(+limit)
      .select("-password");
    return sendRes(res, 200, true, "Users fetched", {
      users,
      pagination: { total, page: +page, pages: Math.ceil(total / +limit) }
    });
  } catch (err) {
    return sendRes(res, 500, false, "Could not fetch users.");
  }
});

// Deactivate / Activate user
adminRouter.put("/users/:id/toggle", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendRes(res, 404, false, "User not found.");
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    return sendRes(res, 200, true, `User ${user.isActive ? "activated" : "deactivated"}.`, { isActive: user.isActive });
  } catch (err) {
    return sendRes(res, 500, false, "Could not toggle user status.");
  }
});

// Verify profile
adminRouter.put("/profiles/:userId/verify", async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user: req.params.userId },
      { isVerified: true, verifiedAt: new Date() },
      { new: true }
    );
    if (!profile) return sendRes(res, 404, false, "Profile not found.");

    await Notification.create({
      user: req.params.userId,
      type: "system",
      title: "✅ Profile Verified!",
      body: "Your profile has been verified by our team. You now have a verified badge.",
    });

    return sendRes(res, 200, true, "Profile verified successfully.", { profile });
  } catch (err) {
    return sendRes(res, 500, false, "Verification failed.");
  }
});

// Delete user (soft delete)
adminRouter.delete("/users/:id", async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    return sendRes(res, 200, true, "User deactivated.");
  } catch (err) {
    return sendRes(res, 500, false, "Could not delete user.");
  }
});

// Send system notification to all
adminRouter.post("/notify-all", async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title) return sendRes(res, 400, false, "Title is required.");
    const users = await User.find({ isActive: true }).distinct("_id");
    const notifications = users.map(userId => ({ user: userId, type: "system", title, body }));
    await Notification.insertMany(notifications);
    return sendRes(res, 200, true, `Notification sent to ${users.length} users.`);
  } catch (err) {
    return sendRes(res, 500, false, "Notification failed.");
  }
});

app.use("/api/admin", adminRouter);

// ──────────────────────────────────────────────────────────────
//  HOROSCOPE MATCHING
// ──────────────────────────────────────────────────────────────
const STAR_COMPATIBILITY = {
  Ashwini:    { compatible: ["Ashwini","Bharani","Rohini","Mrigashira","Punarvasu","Pushya","Hasta","Chitra","Swati","Jyeshtha","Mula","Uttarashada","Shatabhisha","Uttarabhadra","Revati"] },
  Bharani:    { compatible: ["Ashwini","Bharani","Rohini","Ardra","Punarvasu","Uttaraphalguni","Hasta","Vishakha","Anuradha","Uttarashada","Dhanishtha","Shatabhisha","Purvaabhadra","Revati"] },
  Rohini:     { compatible: ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Punarvasu","Pushya","Hasta","Chitra","Anuradha","Mula","Uttarashada","Shatabhisha","Uttarabhadra","Revati"] },
  Mrigashira: { compatible: ["Ashwini","Rohini","Mrigashira","Ardra","Pushya","Magha","Uttaraphalguni","Hasta","Vishakha","Jyeshtha","Uttarashada","Shravana","Purvaabhadra"] },
  Ardra:      { compatible: ["Bharani","Mrigashira","Ardra","Punarvasu","Ashlesha","Purvaphalguni","Uttaraphalguni","Chitra","Swati","Anuradha","Uttarashada","Dhanishtha","Shatabhisha"] },
};

app.post("/api/horoscope/match", protect, async (req, res) => {
  try {
    const { star1, rashi1, star2, rashi2, gothra1, gothra2 } = req.body;

    let score = 0;
    const details = [];

    // Gothra check (different gothra required)
    if (gothra1 && gothra2) {
      if (gothra1.toLowerCase() !== gothra2.toLowerCase()) {
        score += 20;
        details.push({ factor: "Gothra", score: 20, max: 20, result: "Compatible — Different Gothra ✓" });
      } else {
        details.push({ factor: "Gothra", score: 0, max: 20, result: "Incompatible — Same Gothra ✗" });
      }
    }

    // Star compatibility
    if (star1 && star2) {
      const compat = STAR_COMPATIBILITY[star1];
      if (compat?.compatible.includes(star2)) {
        score += 36;
        details.push({ factor: "Star (Nakshatra)", score: 36, max: 36, result: `${star1} is compatible with ${star2} ✓` });
      } else {
        const partial = 18;
        score += partial;
        details.push({ factor: "Star (Nakshatra)", score: partial, max: 36, result: "Partial compatibility — consult astrologer" });
      }
    }

    // Rashi compatibility (simplified)
    const rashiGroups = {
      Fire: ["Aries","Leo","Sagittarius"],
      Earth: ["Taurus","Virgo","Capricorn"],
      Air: ["Gemini","Libra","Aquarius"],
      Water: ["Cancer","Scorpio","Pisces"],
    };
    const friendlyElements = { Fire:["Fire","Air"], Earth:["Earth","Water"], Air:["Air","Fire"], Water:["Water","Earth"] };
    if (rashi1 && rashi2) {
      const el1 = Object.entries(rashiGroups).find(([,signs]) => signs.includes(rashi1))?.[0];
      const el2 = Object.entries(rashiGroups).find(([,signs]) => signs.includes(rashi2))?.[0];
      if (el1 && el2 && friendlyElements[el1]?.includes(el2)) {
        score += 24;
        details.push({ factor: "Rashi", score: 24, max: 24, result: `${rashi1} and ${rashi2} — Friendly elements ✓` });
      } else {
        score += 12;
        details.push({ factor: "Rashi", score: 12, max: 24, result: "Neutral compatibility" });
      }
    }

    const total = 80;
    const percent = Math.round((score / total) * 100);
    let verdict, color;
    if (percent >= 80) { verdict = "Excellent Match"; color = "green"; }
    else if (percent >= 60) { verdict = "Good Match"; color = "blue"; }
    else if (percent >= 40) { verdict = "Average Match"; color = "orange"; }
    else { verdict = "Low Compatibility — Consult Astrologer"; color = "red"; }

    return sendRes(res, 200, true, "Horoscope matching complete", {
      score, total, percent, verdict, color, details
    });
  } catch (err) {
    return sendRes(res, 500, false, "Horoscope matching failed.");
  }
});

// ──────────────────────────────────────────────────────────────
//  ERROR HANDLING
// ──────────────────────────────────────────────────────────────
app.use((req, res) => sendRes(res, 404, false, `Route not found: ${req.method} ${req.originalUrl}`));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (err.name === "ValidationError") {
    const msgs = Object.values(err.errors).map(e => e.message);
    return sendRes(res, 400, false, msgs[0]);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return sendRes(res, 400, false, `${field} already exists.`);
  }
  return sendRes(res, 500, false, err.message || "Internal server error.");
});

// ──────────────────────────────────────────────────────────────
//  START SERVER
// ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 VivahMatch server running on port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
