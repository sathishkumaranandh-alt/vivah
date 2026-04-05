// ============================================================
//  VivahMatch — models/index.js
//  All Mongoose models in one file.
//  Import in server.js:  const Models = require("./models");
// ============================================================

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const { Schema, model } = mongoose;

// ──────────────────────────────────────────────────────────────
//  1. USER
// ──────────────────────────────────────────────────────────────
const UserSchema = new Schema({
  name:           { type: String, required: true, trim: true, maxlength: 80 },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:          { type: String, required: true, trim: true },
  password:       { type: String, required: true, minlength: 6, select: false },
  gender:         { type: String, enum: ["Bride","Groom"], required: true },
  role:           { type: String, enum: ["user","admin","moderator"], default: "user" },

  // Account status
  isActive:       { type: Boolean, default: true },
  isEmailVerified:{ type: Boolean, default: false },
  emailOtp:       { type: String, select: false },
  emailOtpExpiry: { type: Date,   select: false },

  // Premium
  premiumPlan:    { type: String, enum: ["free","gold","diamond"], default: "free" },
  isPremium:      { type: Boolean, default: false },
  premiumExpiry:  { type: Date },
  premiumHistory: [{
    plan:       String,
    startDate:  Date,
    endDate:    Date,
    paidAmount: Number,
    paymentId:  String,
  }],

  // Shortlisted / blocked
  shortlisted:    [{ type: Schema.Types.ObjectId, ref: "User" }],
  blocked:        [{ type: Schema.Types.ObjectId, ref: "User" }],

  // Activity
  lastLogin:       { type: Date },
  profileComplete: { type: Boolean, default: false },
  loginCount:      { type: Number, default: 0 },

  // Password reset
  resetToken:       { type: String, select: false },
  resetTokenExpiry: { type: Date,   select: false },
}, {
  timestamps: true,
  toJSON:  { virtuals: true },
  toObject:{ virtuals: true },
});

// Virtual: profile
UserSchema.virtual("profile", {
  ref: "Profile", localField: "_id", foreignField: "user", justOne: true,
});

// Hash password before save
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  delete obj.emailOtp;
  return obj;
};

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ gender: 1, isActive: 1 });
UserSchema.index({ premiumPlan: 1 });
UserSchema.index({ createdAt: -1 });

const User = model("User", UserSchema);

// ──────────────────────────────────────────────────────────────
//  2. PROFILE
// ──────────────────────────────────────────────────────────────
const PhotoSchema = new Schema({
  url:       { type: String, required: true },
  publicId:  { type: String, required: true },
  isPrimary: { type: Boolean, default: false },
  caption:   { type: String, maxlength: 100 },
}, { _id: false });

const PartnerPrefSchema = new Schema({
  ageMin:      { type: Number, default: 21, min: 18, max: 70 },
  ageMax:      { type: Number, default: 35, min: 18, max: 70 },
  heightMin:   String,
  heightMax:   String,
  religion:    [String],
  caste:       [String],
  education:   [String],
  profession:  [String],
  city:        [String],
  state:       [String],
  country:     [String],
  income:      String,
  mangalik:    String,
  diet:        [String],
  smoking:     String,
  drinking:    String,
  description: { type: String, maxlength: 500 },
}, { _id: false });

const ProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

  // ── Personal ──────────────────────────────────────────
  dob:         Date,
  age:         { type: Number, min: 18, max: 80 },
  height:      String,
  weight:      String,
  complexion:  { type: String, enum: ["Very Fair","Fair","Wheatish","Wheatish Brown","Dark",""] , default: "" },
  bodyType:    { type: String, enum: ["Slim","Athletic","Average","Heavy",""] , default: "" },
  specialNeeds:{ type: Boolean, default: false },
  maritalStatus:{ type: String, enum: ["Never Married","Divorced","Widowed","Awaiting Divorce"], default: "Never Married" },
  childrenCount:{ type: Number, default: 0 },

  // ── Religion / Caste ─────────────────────────────────
  religion:    String,
  caste:       String,
  subCaste:    String,
  gothra:      String,
  kulam:       String,   // Tamil specific

  // ── Astrology ────────────────────────────────────────
  star:          String, // Nakshatra / Thiruvadhirai etc.
  rashi:         String, // Moon sign
  lagnam:        String, // Ascendant (Tamil)
  mangalik:      { type: String, enum: ["Yes","No","Partial","Don't know"], default: "Don't know" },
  timeOfBirth:   String,
  placeOfBirth:  String,
  horoscopeDoc:  String, // Cloudinary URL for Jathagam PDF

  // ── Location ─────────────────────────────────────────
  city:          String,
  district:      String,
  state:         String,
  country:       { type: String, default: "India" },
  pincode:       String,
  nri:           { type: Boolean, default: false },
  nriCountry:    String,

  // ── Education & Career ───────────────────────────────
  education:        String,
  educationField:   String,
  college:          String,
  profession:       String,
  company:          String,
  workCity:         String,
  income:           String,
  incomeAmount:     Number, // numeric for sorting/filtering
  workingAbroad:    { type: Boolean, default: false },

  // ── Family ───────────────────────────────────────────
  familyType:       { type: String, enum: ["Joint","Nuclear","Extended",""] , default: "" },
  familyStatus:     { type: String, enum: ["Middle class","Upper middle class","Rich","Affluent",""] , default: "" },
  fatherName:       String,
  fatherOccupation: String,
  motherName:       String,
  motherOccupation: String,
  siblings:         { type: Number, default: 0 },
  siblingsMarried:  { type: Number, default: 0 },

  // ── Lifestyle ────────────────────────────────────────
  diet:         { type: String, enum: ["Vegetarian","Non-Vegetarian","Eggetarian","Vegan",""] , default: "" },
  smoking:      { type: String, enum: ["No","Occasionally","Yes"], default: "No" },
  drinking:     { type: String, enum: ["No","Occasionally","Yes"], default: "No" },
  languages:    [String],
  hobbies:      [String],

  // ── Bio / Text ───────────────────────────────────────
  bio:          { type: String, maxlength: 1000 },
  aboutFamily:  { type: String, maxlength: 500 },

  // ── Photos ───────────────────────────────────────────
  photos:       [PhotoSchema],

  // ── Partner Preferences ──────────────────────────────
  partnerPref:  { type: PartnerPrefSchema, default: () => ({}) },

  // ── Status / Meta ────────────────────────────────────
  isVerified:   { type: Boolean, default: false },
  verifiedAt:   Date,
  verifiedBy:   { type: Schema.Types.ObjectId, ref: "User" },
  profileViews: { type: Number, default: 0 },
  weeklyViews:  { type: Number, default: 0 },
  isHidden:     { type: Boolean, default: false },
  isFeatured:   { type: Boolean, default: false },
  featuredUntil:Date,
  lastBoosted:  Date,
  completeness: { type: Number, default: 0 }, // 0-100 percent
}, {
  timestamps: true,
  toJSON:  { virtuals: true },
  toObject:{ virtuals: true },
});

// Calculate profile completeness before save
ProfileSchema.pre("save", function (next) {
  const fields = ["age","religion","caste","city","education","profession","bio","photos","star","gothra","diet","familyType"];
  let filled = 0;
  fields.forEach(f => {
    if (f === "photos") { if (this.photos?.length > 0) filled++; }
    else if (this[f]) filled++;
  });
  this.completeness = Math.round((filled / fields.length) * 100);
  next();
});

// Indexes
ProfileSchema.index({ user: 1 }, { unique: true });
ProfileSchema.index({ religion: 1, caste: 1 });
ProfileSchema.index({ city: 1, state: 1 });
ProfileSchema.index({ age: 1 });
ProfileSchema.index({ star: 1 });
ProfileSchema.index({ incomeAmount: 1 });
ProfileSchema.index({ isVerified: 1, isHidden: 1 });
ProfileSchema.index({ isFeatured: -1, createdAt: -1 });
ProfileSchema.index({ completeness: -1 });

const Profile = model("Profile", ProfileSchema);

// ──────────────────────────────────────────────────────────────
//  3. INTEREST
// ──────────────────────────────────────────────────────────────
const InterestSchema = new Schema({
  from:    { type: Schema.Types.ObjectId, ref: "User", required: true },
  to:      { type: Schema.Types.ObjectId, ref: "User", required: true },
  status:  { type: String, enum: ["pending","accepted","declined","withdrawn"], default: "pending" },
  message: { type: String, maxlength: 300, trim: true },
  // Withdrawal
  withdrawnAt: Date,
  withdrawnBy: { type: Schema.Types.ObjectId, ref: "User" },
  // Response
  respondedAt: Date,
}, {
  timestamps: true,
});

// Prevent duplicate interests
InterestSchema.index({ from: 1, to: 1 }, { unique: true });
InterestSchema.index({ to: 1, status: 1 });
InterestSchema.index({ from: 1, createdAt: -1 });
InterestSchema.index({ status: 1, createdAt: -1 });

const Interest = model("Interest", InterestSchema);

// ──────────────────────────────────────────────────────────────
//  4. MESSAGE
// ──────────────────────────────────────────────────────────────
const MessageSchema = new Schema({
  chatId:   { type: String, required: true, index: true },
  sender:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text:     { type: String, required: true, maxlength: 1000, trim: true },
  type:     { type: String, enum: ["text","image","system"], default: "text" },
  imageUrl: String,
  isRead:   { type: Boolean, default: false },
  readAt:   Date,
  deletedBy:[{ type: Schema.Types.ObjectId, ref: "User" }],
}, {
  timestamps: true,
});

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ receiver: 1, isRead: 1 });

const Message = model("Message", MessageSchema);

// ──────────────────────────────────────────────────────────────
//  5. NOTIFICATION
// ──────────────────────────────────────────────────────────────
const NotificationSchema = new Schema({
  user:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  type:   { type: String, enum: ["interest","accepted","declined","message","view","system","plan","verify"], required: true },
  title:  { type: String, required: true },
  body:   String,
  link:   String,
  isRead: { type: Boolean, default: false },
  from:   { type: Schema.Types.ObjectId, ref: "User" },
}, {
  timestamps: true,
});

NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

const Notification = model("Notification", NotificationSchema);

// ──────────────────────────────────────────────────────────────
//  6. CONTACT VIEW
// ──────────────────────────────────────────────────────────────
const ContactViewSchema = new Schema({
  viewedBy:  { type: Schema.Types.ObjectId, ref: "User", required: true },
  profileOf: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, {
  timestamps: true,
});

ContactViewSchema.index({ viewedBy: 1, profileOf: 1 }, { unique: true });
ContactViewSchema.index({ viewedBy: 1, createdAt: 1 });

const ContactView = model("ContactView", ContactViewSchema);

// ──────────────────────────────────────────────────────────────
//  7. PAYMENT
// ──────────────────────────────────────────────────────────────
const PaymentSchema = new Schema({
  user:            { type: Schema.Types.ObjectId, ref: "User", required: true },
  plan:            { type: String, enum: ["gold","diamond"], required: true },
  durationMonths:  { type: Number, required: true },
  amount:          { type: Number, required: true },
  currency:        { type: String, default: "INR" },
  status:          { type: String, enum: ["created","paid","failed","refunded"], default: "created" },
  // Razorpay
  razorpayOrderId:   String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  // Dates
  paidAt:   Date,
  expiryDate: Date,
}, {
  timestamps: true,
});

PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ razorpayOrderId: 1 });

const Payment = model("Payment", PaymentSchema);

// ──────────────────────────────────────────────────────────────
//  8. SUCCESS STORY
// ──────────────────────────────────────────────────────────────
const SuccessStorySchema = new Schema({
  bride:       { type: Schema.Types.ObjectId, ref: "User" },
  groom:       { type: Schema.Types.ObjectId, ref: "User" },
  brideName:   String,
  groomName:   String,
  city:        String,
  marriageDate:Date,
  quote:       { type: String, maxlength: 500 },
  photo:       String,
  isPublished: { type: Boolean, default: false },
  likes:       { type: Number, default: 0 },
  monthsMet:   Number,
}, {
  timestamps: true,
});

SuccessStorySchema.index({ isPublished: 1, createdAt: -1 });

const SuccessStory = model("SuccessStory", SuccessStorySchema);

// ──────────────────────────────────────────────────────────────
//  9. REPORT
// ──────────────────────────────────────────────────────────────
const ReportSchema = new Schema({
  reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reportedUser:{ type: Schema.Types.ObjectId, ref: "User", required: true },
  reason:     { type: String, enum: ["Fake profile","Abusive behavior","Spam","Married person","Other"], required: true },
  description:{ type: String, maxlength: 500 },
  status:     { type: String, enum: ["open","reviewed","resolved","dismissed"], default: "open" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewNote: String,
}, {
  timestamps: true,
});

ReportSchema.index({ reportedUser: 1, status: 1 });

const Report = model("Report", ReportSchema);

// ──────────────────────────────────────────────────────────────
//  10. PROFILE VIEW LOG
// ──────────────────────────────────────────────────────────────
const ProfileViewSchema = new Schema({
  viewer:    { type: Schema.Types.ObjectId, ref: "User", required: true },
  viewed:    { type: Schema.Types.ObjectId, ref: "User", required: true },
  viewedAt:  { type: Date, default: Date.now },
}, {
  timestamps: false,
});

ProfileViewSchema.index({ viewed: 1, viewedAt: -1 });
ProfileViewSchema.index({ viewer: 1, viewedAt: -1 });

const ProfileView = model("ProfileView", ProfileViewSchema);

// ──────────────────────────────────────────────────────────────
//  EXPORTS
// ──────────────────────────────────────────────────────────────
module.exports = {
  User,
  Profile,
  Interest,
  Message,
  Notification,
  ContactView,
  Payment,
  SuccessStory,
  Report,
  ProfileView,
};
