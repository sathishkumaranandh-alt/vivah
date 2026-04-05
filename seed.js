// ============================================================
//  VivahMatch — seed.js
//  Seeds MongoDB with realistic Tamil Nadu matrimony data
//
//  Run:  node seed.js          → seed all data
//        node seed.js --clear  → delete all data
//        node seed.js --admin  → create admin only
// ============================================================

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// ── DB Connect ────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true, useUnifiedTopology: true,
}).then(() => console.log("✅ Connected to MongoDB for seeding"))
  .catch(err => { console.error("❌ DB Error:", err); process.exit(1); });

// ── Inline Schemas (minimal, for seeding only) ───────────────
const { Schema, model } = mongoose;
const hash = (p) => bcrypt.hashSync(p, 10);

const User = model("User", new Schema({
  name: String, email: { type: String, unique: true }, phone: String,
  password: String, gender: String, role: { type: String, default: "user" },
  isActive: { type: Boolean, default: true }, premiumPlan: { type: String, default: "free" },
  isPremium: { type: Boolean, default: false }, profileComplete: { type: Boolean, default: false },
}, { timestamps: true }));

const Profile = model("Profile", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true },
  age: Number, dob: Date, height: String, weight: String,
  religion: String, caste: String, gothra: String, star: String, rashi: String,
  mangalik: { type: String, default: "No" }, placeOfBirth: String,
  city: String, district: String, state: { type: String, default: "Tamil Nadu" },
  country: { type: String, default: "India" },
  education: String, profession: String, company: String, income: String, incomeAmount: Number,
  familyType: String, familyStatus: String,
  fatherOccupation: String, motherOccupation: String, siblings: Number,
  diet: String, smoking: { type: String, default: "No" }, drinking: { type: String, default: "No" },
  languages: [String], hobbies: [String],
  bio: String, aboutFamily: String,
  photos: [{ url: String, publicId: String, isPrimary: Boolean }],
  partnerPref: {
    ageMin: Number, ageMax: Number, religion: [String],
    caste: [String], education: [String], city: [String], description: String,
  },
  isVerified: { type: Boolean, default: false },
  profileViews: { type: Number, default: 0 },
  isHidden: { type: Boolean, default: false },
  completeness: { type: Number, default: 85 },
  maritalStatus: { type: String, default: "Never Married" },
}, { timestamps: true }));

const Interest = model("Interest", new Schema({
  from: { type: Schema.Types.ObjectId, ref: "User" },
  to:   { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "pending" },
  message: String,
}, { timestamps: true }));

const Notification = model("Notification", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  type: String, title: String, body: String, isRead: { type: Boolean, default: false },
  from: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true }));

const SuccessStory = model("SuccessStory", new Schema({
  brideName: String, groomName: String, city: String,
  marriageDate: Date, quote: String, photo: String,
  isPublished: { type: Boolean, default: true }, monthsMet: Number,
}, { timestamps: true }));

// ── Sample Data ───────────────────────────────────────────────
const BRIDE_DATA = [
  {
    name: "Priya Sharma", email: "priya@vivah.com", phone: "9876543201",
    gender: "Bride", premiumPlan: "gold", isPremium: true,
    profile: {
      age: 26, height: "5'4\"", weight: "55 kg",
      religion: "Hindu", caste: "Brahmin", gothra: "Kashyapa",
      star: "Rohini", rashi: "Taurus", mangalik: "No",
      placeOfBirth: "Chennai", city: "Chennai", district: "Chennai",
      education: "MBA", profession: "Software Engineer", company: "TCS",
      income: "8 LPA", incomeAmount: 800000,
      familyType: "Nuclear", familyStatus: "Middle class",
      fatherOccupation: "Retired Government Officer",
      motherOccupation: "Homemaker", siblings: 1,
      diet: "Vegetarian", languages: ["Tamil","English","Hindi"],
      hobbies: ["Classical Dance","Cooking","Reading","Travel"],
      bio: "Passionate software engineer who loves classical dance, travel, and cooking traditional recipes. I come from a close-knit family in Chennai and cherish our values and traditions. Looking to build a beautiful life with someone who shares similar values.",
      aboutFamily: "We are a nuclear family settled in Chennai. Father is a retired government officer and mother is a homemaker. One younger sister who is pursuing MBBS.",
      photos: [{ url: "https://i.pravatar.cc/400?img=47", publicId: "seed_p1", isPrimary: true }],
      partnerPref: { ageMin: 27, ageMax: 34, religion: ["Hindu"], caste: ["Brahmin"], education: ["MBA","B.Tech","ME"], city: ["Chennai","Bangalore","Coimbatore"], description: "Looking for an educated, family-oriented partner who respects our culture and traditions." },
      isVerified: true, profileViews: 245, completeness: 95,
    }
  },
  {
    name: "Ananya Krishnan", email: "ananya@vivah.com", phone: "9876543202",
    gender: "Bride", premiumPlan: "free",
    profile: {
      age: 24, height: "5'2\"", weight: "50 kg",
      religion: "Hindu", caste: "Nadar", gothra: "Atreya",
      star: "Uthiram", rashi: "Virgo", mangalik: "No",
      placeOfBirth: "Coimbatore", city: "Coimbatore", district: "Coimbatore",
      education: "MBBS", profession: "Doctor", company: "PSG Hospitals",
      income: "12 LPA", incomeAmount: 1200000,
      familyType: "Joint", familyStatus: "Upper middle class",
      fatherOccupation: "Businessman", motherOccupation: "Teacher", siblings: 2,
      diet: "Non-Vegetarian", languages: ["Tamil","Malayalam","English"],
      hobbies: ["Music","Reading","Nature Walks","Yoga"],
      bio: "MBBS doctor passionate about healthcare. I love music, books, and nature walks. Family is my priority. Looking for a life partner who is caring, educated, and family-oriented.",
      aboutFamily: "Joint family in Coimbatore. Father runs a textile business, mother is a school teacher. Two younger brothers both in college.",
      photos: [{ url: "https://i.pravatar.cc/400?img=45", publicId: "seed_p2", isPrimary: true }],
      partnerPref: { ageMin: 25, ageMax: 32, religion: ["Hindu"], education: ["MBBS","B.Tech","MBA"], city: ["Coimbatore","Chennai","Madurai"], description: "Looking for a well-educated, respectful, and family-loving partner." },
      isVerified: true, profileViews: 189, completeness: 90,
    }
  },
  {
    name: "Meera Rajan", email: "meera@vivah.com", phone: "9876543203",
    gender: "Bride", premiumPlan: "diamond", isPremium: true,
    profile: {
      age: 28, height: "5'5\"", weight: "58 kg",
      religion: "Hindu", caste: "Vellalar", gothra: "Vasishtha",
      star: "Karthigai", rashi: "Leo", mangalik: "No",
      placeOfBirth: "Madurai", city: "Madurai", district: "Madurai",
      education: "M.Tech", profession: "Architect", company: "L&T Construction",
      income: "10 LPA", incomeAmount: 1000000,
      familyType: "Nuclear", familyStatus: "Upper middle class",
      fatherOccupation: "Civil Engineer", motherOccupation: "Nurse", siblings: 0,
      diet: "Eggetarian", languages: ["Tamil","English"],
      hobbies: ["Painting","Yoga","Long Drives","Travel","Photography"],
      bio: "Creative architect who finds beauty in design and simplicity. I enjoy painting, yoga, and long drives. I believe life is beautiful when lived with purpose. Looking for someone who shares my passion for creativity and exploration.",
      aboutFamily: "Small nuclear family in Madurai. Father is a retired civil engineer, mother is a nurse. Only child, so family is very important to me.",
      photos: [{ url: "https://i.pravatar.cc/400?img=41", publicId: "seed_p3", isPrimary: true }],
      partnerPref: { ageMin: 29, ageMax: 36, religion: ["Hindu"], city: ["Madurai","Chennai","Bangalore"], description: "Looking for someone with ambition, warmth, and a good sense of humor." },
      isVerified: false, profileViews: 312, completeness: 88,
    }
  },
  {
    name: "Divya Nair", email: "divya@vivah.com", phone: "9876543204",
    gender: "Bride", premiumPlan: "free",
    profile: {
      age: 25, height: "5'3\"", weight: "52 kg",
      religion: "Hindu", caste: "Nair", gothra: "Bhardwaj",
      star: "Mrigasira", rashi: "Gemini", mangalik: "No",
      placeOfBirth: "Bangalore", city: "Bangalore", district: "Bangalore Urban",
      education: "BCA", profession: "UX Designer", company: "Infosys",
      income: "9 LPA", incomeAmount: 900000,
      familyType: "Nuclear", familyStatus: "Middle class",
      fatherOccupation: "Bank Manager", motherOccupation: "Homemaker", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","Kannada","English","Malayalam"],
      hobbies: ["UI Design","Sketching","Movies","Cooking","Badminton"],
      bio: "UX designer who believes in creating meaningful experiences — in work and in life. I am creative, independent, and family-loving. Looking for a partner who respects both tradition and modernity.",
      aboutFamily: "Family settled in Bangalore. Dad is a bank manager, mom is a homemaker. One elder brother who is married and settled in the US.",
      photos: [{ url: "https://i.pravatar.cc/400?img=44", publicId: "seed_p4", isPrimary: true }],
      partnerPref: { ageMin: 26, ageMax: 32, religion: ["Hindu"], city: ["Bangalore","Chennai","Hyderabad"], description: "Looking for a creative, open-minded partner with strong family values." },
      isVerified: true, profileViews: 156, completeness: 85,
    }
  },
  {
    name: "Kavitha Murugan", email: "kavitha@vivah.com", phone: "9876543205",
    gender: "Bride", premiumPlan: "gold", isPremium: true,
    profile: {
      age: 27, height: "5'4\"", weight: "56 kg",
      religion: "Hindu", caste: "Mudaliar", gothra: "Kaundinya",
      star: "Anusham", rashi: "Scorpio", mangalik: "Partial",
      placeOfBirth: "Trichy", city: "Trichy", district: "Tiruchirappalli",
      education: "MCA", profession: "Data Analyst", company: "Wipro",
      income: "7 LPA", incomeAmount: 700000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Shop Owner", motherOccupation: "Homemaker", siblings: 2,
      diet: "Vegetarian", languages: ["Tamil","English","Telugu"],
      hobbies: ["Carnatic Music","Kolam","Temple Visits","Cooking","Gardening"],
      bio: "Numbers and stories both fascinate me. I love Carnatic music and weekend temple visits with family. Simple, traditional at heart but modern in thought. Looking for a partner who balances career and family beautifully.",
      aboutFamily: "Joint family in Trichy. Father runs a small business. Traditional Mudaliar family with strong values. Two elder brothers both married and settled.",
      photos: [{ url: "https://i.pravatar.cc/400?img=48", publicId: "seed_p5", isPrimary: true }],
      partnerPref: { ageMin: 28, ageMax: 35, religion: ["Hindu"], caste: ["Mudaliar","Nadar","Vellalar"], city: ["Trichy","Chennai","Coimbatore"], description: "Looking for a grounded, respectful partner from a good family." },
      isVerified: true, profileViews: 203, completeness: 92,
    }
  },
  {
    name: "Lakshmi Venkat", email: "lakshmi@vivah.com", phone: "9876543206",
    gender: "Bride", premiumPlan: "free",
    profile: {
      age: 23, height: "5'1\"", weight: "48 kg",
      religion: "Hindu", caste: "Gounder", gothra: "Agasthya",
      star: "Aswini", rashi: "Aries", mangalik: "No",
      placeOfBirth: "Salem", city: "Salem", district: "Salem",
      education: "B.Sc", profession: "Teacher", company: "Government School",
      income: "5 LPA", incomeAmount: 500000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Farmer", motherOccupation: "Homemaker", siblings: 3,
      diet: "Non-Vegetarian", languages: ["Tamil","Telugu","English"],
      hobbies: ["Gardening","Tamil Literature","Kolam","Cooking","Stitching"],
      bio: "Educator at heart. Teaching young minds is my greatest purpose. I love gardening and reading Tamil literature. I am a homely, traditional girl who values family above everything.",
      aboutFamily: "Large joint family in Salem. Father is a farmer, we have agricultural land. Traditional Gounder family with strong ties to culture and heritage.",
      photos: [{ url: "https://i.pravatar.cc/400?img=43", publicId: "seed_p6", isPrimary: true }],
      partnerPref: { ageMin: 24, ageMax: 30, religion: ["Hindu"], caste: ["Gounder","Mudaliar"], city: ["Salem","Coimbatore","Erode"], description: "Looking for a humble, caring, family-first partner." },
      isVerified: false, profileViews: 98, completeness: 80,
    }
  },
  {
    name: "Saranya Pillai", email: "saranya@vivah.com", phone: "9876543207",
    gender: "Bride", premiumPlan: "diamond", isPremium: true,
    profile: {
      age: 29, height: "5'5\"", weight: "60 kg",
      religion: "Hindu", caste: "Pillai", gothra: "Vishwamitra",
      star: "Pooradam", rashi: "Sagittarius", mangalik: "No",
      placeOfBirth: "Chennai", city: "Chennai", district: "Chennai",
      education: "MBA", profession: "HR Manager", company: "Cognizant",
      income: "11 LPA", incomeAmount: 1100000,
      familyType: "Nuclear", familyStatus: "Upper middle class",
      fatherOccupation: "IAS Officer", motherOccupation: "Professor", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","English","Hindi"],
      hobbies: ["Bharatanatyam","Cooking","Travel","Networking","Reading"],
      bio: "HR professional who understands people deeply. I enjoy cooking, Bharatanatyam, and family gatherings. I am well-traveled, independent, and looking for a partner who complements my personality.",
      aboutFamily: "Premium nuclear family in Chennai. Father is a senior IAS officer, mother is a university professor. One younger brother pursuing CA.",
      photos: [{ url: "https://i.pravatar.cc/400?img=40", publicId: "seed_p7", isPrimary: true }],
      partnerPref: { ageMin: 30, ageMax: 36, religion: ["Hindu"], education: ["MBA","IAS/IPS","MBBS"], city: ["Chennai","Bangalore","Hyderabad"], description: "Looking for a stable, emotionally mature, and ambitious life partner." },
      isVerified: true, profileViews: 421, completeness: 98,
    }
  },
  {
    name: "Nithya Subramanian", email: "nithya@vivah.com", phone: "9876543208",
    gender: "Bride", premiumPlan: "free",
    profile: {
      age: 26, height: "5'3\"", weight: "54 kg",
      religion: "Hindu", caste: "Brahmin", gothra: "Parasara",
      star: "Swathi", rashi: "Libra", mangalik: "No",
      placeOfBirth: "Madurai", city: "Madurai", district: "Madurai",
      education: "B.E", profession: "Civil Engineer", company: "PWD",
      income: "8 LPA", incomeAmount: 800000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Government Employee", motherOccupation: "Homemaker", siblings: 2,
      diet: "Vegetarian", languages: ["Tamil","English","Sanskrit"],
      hobbies: ["Trekking","Cooking","Classical Music","Road Trips","Yoga"],
      bio: "Civil engineer with a passion for sustainable architecture. I love trekking, cooking, and family road trips. Traditional values with a modern outlook on life.",
      aboutFamily: "Joint Brahmin family in Madurai. Government background. Very traditional and religious household. Two older brothers settled abroad.",
      photos: [{ url: "https://i.pravatar.cc/400?img=46", publicId: "seed_p8", isPrimary: true }],
      partnerPref: { ageMin: 27, ageMax: 34, religion: ["Hindu"], caste: ["Brahmin"], city: ["Madurai","Chennai","Trichy"], description: "Looking for a kind, ambitious, and family-loving partner from a Brahmin background." },
      isVerified: true, profileViews: 134, completeness: 87,
    }
  },
];

const GROOM_DATA = [
  {
    name: "Arun Selvam", email: "arun@vivah.com", phone: "9876543101",
    gender: "Groom", premiumPlan: "diamond", isPremium: true,
    profile: {
      age: 29, height: "5'10\"", weight: "72 kg",
      religion: "Hindu", caste: "Brahmin", gothra: "Kashyapa",
      star: "Revathi", rashi: "Pisces", mangalik: "No",
      placeOfBirth: "Chennai", city: "Chennai", district: "Chennai",
      education: "MBA", profession: "Business Analyst", company: "Deloitte",
      income: "14 LPA", incomeAmount: 1400000,
      familyType: "Nuclear", familyStatus: "Upper middle class",
      fatherOccupation: "Retired Professor", motherOccupation: "Doctor", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","English","Hindi"],
      hobbies: ["Cricket","Travel","Cooking","Reading","Fitness"],
      bio: "Driven professional who values family traditions. Love cricket, travel, and trying new cuisines. I believe in balance — career ambition and family bonding go hand in hand.",
      aboutFamily: "Nuclear family in Chennai. Father is a retired professor, mother is a practicing doctor. One elder sister married and settled in the US.",
      photos: [{ url: "https://i.pravatar.cc/400?img=12", publicId: "seed_g1", isPrimary: true }],
      partnerPref: { ageMin: 24, ageMax: 30, religion: ["Hindu"], caste: ["Brahmin","Iyer","Iyengar"], education: ["MBA","MBBS","B.Tech"], city: ["Chennai","Bangalore"], description: "Looking for an educated, cheerful, and understanding partner who loves family." },
      isVerified: true, profileViews: 367, completeness: 95,
    }
  },
  {
    name: "Karthik Rajan", email: "karthik@vivah.com", phone: "9876543102",
    gender: "Groom", premiumPlan: "free",
    profile: {
      age: 27, height: "5'9\"", weight: "70 kg",
      religion: "Hindu", caste: "Nadar", gothra: "Atreya",
      star: "Sathayam", rashi: "Aquarius", mangalik: "No",
      placeOfBirth: "Coimbatore", city: "Coimbatore", district: "Coimbatore",
      education: "B.Tech", profession: "Software Developer", company: "Zoho",
      income: "11 LPA", incomeAmount: 1100000,
      familyType: "Nuclear", familyStatus: "Middle class",
      fatherOccupation: "Textile Businessman", motherOccupation: "Homemaker", siblings: 2,
      diet: "Non-Vegetarian", languages: ["Tamil","English","Hindi"],
      hobbies: ["Guitar","Cricket","Hiking","Cooking","Travelling"],
      bio: "Full-stack developer by day, guitarist by night. Simple, honest, and looking for my forever partner. I love music, travel, and meaningful conversations over good food.",
      aboutFamily: "Nuclear family settled in Coimbatore. Father runs a textile business. Two younger sisters in college. Close-knit family with strong Nadar community values.",
      photos: [{ url: "https://i.pravatar.cc/400?img=15", publicId: "seed_g2", isPrimary: true }],
      partnerPref: { ageMin: 22, ageMax: 28, religion: ["Hindu"], city: ["Coimbatore","Chennai","Bangalore"], description: "Looking for a smart, kind, and fun-loving life partner from a traditional family." },
      isVerified: true, profileViews: 221, completeness: 88,
    }
  },
  {
    name: "Vijay Kumar", email: "vijay@vivah.com", phone: "9876543103",
    gender: "Groom", premiumPlan: "gold", isPremium: true,
    profile: {
      age: 31, height: "5'11\"", weight: "78 kg",
      religion: "Hindu", caste: "Vellalar", gothra: "Vasishtha",
      star: "Uthiradam", rashi: "Capricorn", mangalik: "No",
      placeOfBirth: "Madurai", city: "Madurai", district: "Madurai",
      education: "ME", profession: "Civil Engineer", company: "L&T",
      income: "9 LPA", incomeAmount: 900000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Government Engineer", motherOccupation: "Homemaker", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","English"],
      hobbies: ["Trekking","Cycling","Reading","Temple Visits","Football"],
      bio: "Infrastructure engineer passionate about building bridges — in steel and in relationships. I love trekking, cycling, and exploring nature. Strongly rooted in culture and family.",
      aboutFamily: "Large joint family in Madurai. Father is a government engineer. Traditional Vellalar family with a beautiful home in Madurai city.",
      photos: [{ url: "https://i.pravatar.cc/400?img=18", publicId: "seed_g3", isPrimary: true }],
      partnerPref: { ageMin: 24, ageMax: 30, religion: ["Hindu"], city: ["Madurai","Chennai","Trichy"], description: "Looking for a warm, respectful, and family-oriented partner." },
      isVerified: false, profileViews: 178, completeness: 86,
    }
  },
  {
    name: "Surya Narayanan", email: "surya@vivah.com", phone: "9876543104",
    gender: "Groom", premiumPlan: "diamond", isPremium: true,
    profile: {
      age: 26, height: "5'8\"", weight: "68 kg",
      religion: "Hindu", caste: "Iyer", gothra: "Bhardwaj",
      star: "Rohini", rashi: "Taurus", mangalik: "No",
      placeOfBirth: "Bangalore", city: "Bangalore", district: "Bangalore Urban",
      education: "B.Com", profession: "Chartered Accountant", company: "KPMG",
      income: "13 LPA", incomeAmount: 1300000,
      familyType: "Nuclear", familyStatus: "Upper middle class",
      fatherOccupation: "CA", motherOccupation: "School Principal", siblings: 1,
      diet: "Vegetarian", languages: ["Tamil","Kannada","English","Sanskrit"],
      hobbies: ["Chess","Philosophy","Bike Rides","Carnatic Music","Books"],
      bio: "Chartered accountant with a love for chess, philosophy, and weekend bike rides across the ghats. I come from an Iyer family that values education and culture deeply.",
      aboutFamily: "Nuclear family settled in Bangalore for 15 years. Father is a senior CA, mother is a school principal. One younger sister doing her engineering.",
      photos: [{ url: "https://i.pravatar.cc/400?img=20", publicId: "seed_g4", isPrimary: true }],
      partnerPref: { ageMin: 22, ageMax: 28, religion: ["Hindu"], caste: ["Brahmin","Iyer","Iyengar"], city: ["Bangalore","Chennai"], description: "Looking for an intellectually curious and warm partner from a Brahmin family." },
      isVerified: true, profileViews: 289, completeness: 94,
    }
  },
  {
    name: "Dinesh Balaji", email: "dinesh@vivah.com", phone: "9876543105",
    gender: "Groom", premiumPlan: "free",
    profile: {
      age: 28, height: "5'9\"", weight: "71 kg",
      religion: "Hindu", caste: "Mudaliar", gothra: "Kaundinya",
      star: "Punarpusam", rashi: "Cancer", mangalik: "No",
      placeOfBirth: "Trichy", city: "Trichy", district: "Tiruchirappalli",
      education: "B.Pharm", profession: "Pharmacist", company: "Apollo Pharmacy",
      income: "7 LPA", incomeAmount: 700000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Pharmacist", motherOccupation: "Homemaker", siblings: 2,
      diet: "Non-Vegetarian", languages: ["Tamil","English","Telugu"],
      hobbies: ["Cooking","Badminton","Old Tamil Songs","Temple Visits","Gardening"],
      bio: "Healthcare professional who values simplicity. I love cooking, badminton, and classic Tamil songs. Looking for a homely, cheerful partner to build a simple, happy life.",
      aboutFamily: "Joint family in Trichy. Father is also a pharmacist. Traditional Mudaliar family settled here for generations. Two younger sisters.",
      photos: [{ url: "https://i.pravatar.cc/400?img=22", publicId: "seed_g5", isPrimary: true }],
      partnerPref: { ageMin: 22, ageMax: 28, religion: ["Hindu"], caste: ["Mudaliar","Nadar","Vellalar"], city: ["Trichy","Madurai","Chennai"], description: "Looking for a simple, homely, and cheerful life partner." },
      isVerified: true, profileViews: 143, completeness: 83,
    }
  },
  {
    name: "Praveen Gopal", email: "praveen@vivah.com", phone: "9876543106",
    gender: "Groom", premiumPlan: "free",
    profile: {
      age: 25, height: "5'10\"", weight: "73 kg",
      religion: "Hindu", caste: "Gounder", gothra: "Agasthya",
      star: "Chithirai", rashi: "Libra", mangalik: "No",
      placeOfBirth: "Salem", city: "Salem", district: "Salem",
      education: "B.E", profession: "Mechanical Engineer", company: "Ashok Leyland",
      income: "6 LPA", incomeAmount: 600000,
      familyType: "Joint", familyStatus: "Middle class",
      fatherOccupation: "Farmer", motherOccupation: "Homemaker", siblings: 3,
      diet: "Non-Vegetarian", languages: ["Tamil","English"],
      hobbies: ["Motorsports","Trekking","Fitness","Cricket","Farming"],
      bio: "Early career engineer with big dreams. Passionate about motorsports, trekking, and family values. I am hardworking, grounded, and deeply attached to my family and community.",
      aboutFamily: "Large agricultural family in Salem. We own farmland. Father is a successful farmer. Three siblings, one elder sister married. Traditional Gounder community.",
      photos: [{ url: "https://i.pravatar.cc/400?img=25", publicId: "seed_g6", isPrimary: true }],
      partnerPref: { ageMin: 21, ageMax: 26, religion: ["Hindu"], caste: ["Gounder","Mudaliar"], city: ["Salem","Erode","Coimbatore"], description: "Looking for an energetic, positive, and supportive partner." },
      isVerified: false, profileViews: 89, completeness: 78,
    }
  },
  {
    name: "Rahul Menon", email: "rahul@vivah.com", phone: "9876543107",
    gender: "Groom", premiumPlan: "diamond", isPremium: true,
    profile: {
      age: 30, height: "5'11\"", weight: "75 kg",
      religion: "Hindu", caste: "Nair", gothra: "Vishwamitra",
      star: "Anusham", rashi: "Scorpio", mangalik: "No",
      placeOfBirth: "Chennai", city: "Chennai", district: "Chennai",
      education: "M.Tech", profession: "Product Manager", company: "Google",
      income: "28 LPA", incomeAmount: 2800000,
      familyType: "Nuclear", familyStatus: "Affluent",
      fatherOccupation: "IIT Professor", motherOccupation: "Gynecologist", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","Malayalam","English","Hindi"],
      hobbies: ["Reading","Fitness","Gourmet Cooking","Travel","Badminton"],
      bio: "Tech product manager at Google building products that matter. Avid reader, foodie, and fitness enthusiast. I love deep conversations, world travel, and home-cooked meals. Seeking a strong, independent partner.",
      aboutFamily: "Premium nuclear family in Adyar, Chennai. Father teaches at IIT Madras, mother runs a clinic. One younger brother studying at IIM.",
      photos: [{ url: "https://i.pravatar.cc/400?img=28", publicId: "seed_g7", isPrimary: true }],
      partnerPref: { ageMin: 24, ageMax: 30, religion: ["Hindu"], education: ["M.Tech","MBA","MBBS"], city: ["Chennai","Bangalore","Hyderabad"], description: "Looking for an independent, caring, and intellectually stimulating partner." },
      isVerified: true, profileViews: 534, completeness: 97,
    }
  },
  {
    name: "Sanjay Venkatesh", email: "sanjay@vivah.com", phone: "9876543108",
    gender: "Groom", premiumPlan: "gold", isPremium: true,
    profile: {
      age: 27, height: "5'9\"", weight: "69 kg",
      religion: "Hindu", caste: "Brahmin", gothra: "Parasara",
      star: "Hastham", rashi: "Virgo", mangalik: "No",
      placeOfBirth: "Hyderabad", city: "Hyderabad", district: "Hyderabad",
      education: "MBA", profession: "Marketing Manager", company: "Samsung",
      income: "12 LPA", incomeAmount: 1200000,
      familyType: "Nuclear", familyStatus: "Upper middle class",
      fatherOccupation: "IAS Officer", motherOccupation: "Homemaker", siblings: 1,
      diet: "Non-Vegetarian", languages: ["Tamil","Telugu","English","Hindi"],
      hobbies: ["Photography","Travel","Cooking","Cricket","Music"],
      bio: "Creative marketing manager who loves storytelling. Travel, photography, and cooking are my passions. Born Tamil, raised in Hyderabad — I carry both cultures beautifully. Looking for a warm, expressive partner.",
      aboutFamily: "Nuclear Tamil Brahmin family in Hyderabad. Father is an IAS officer, transferred here 15 years ago. One younger sister studying medicine.",
      photos: [{ url: "https://i.pravatar.cc/400?img=30", publicId: "seed_g8", isPrimary: true }],
      partnerPref: { ageMin: 22, ageMax: 28, religion: ["Hindu"], caste: ["Brahmin"], city: ["Hyderabad","Chennai","Bangalore"], description: "Looking for a warm, expressive, and family-oriented partner." },
      isVerified: true, profileViews: 267, completeness: 91,
    }
  },
];

const SUCCESS_STORIES_DATA = [
  { brideName: "Anitha", groomName: "Suresh", city: "Chennai", marriageDate: new Date("2024-02-14"), quote: "We found each other on VivahMatch and within 6 months we were married. The horoscope matching gave our families confidence. Best decision of our lives!", monthsMet: 4 },
  { brideName: "Preethi", groomName: "Ramesh", city: "Coimbatore", marriageDate: new Date("2023-11-10"), quote: "The verified badge made us trust each other from day one. Three months of chatting, one proposal, and a lifetime of love. Thank you VivahMatch!", monthsMet: 3 },
  { brideName: "Kavitha", groomName: "Arjun", city: "Madurai", marriageDate: new Date("2024-01-05"), quote: "As an NRI family, we were worried about finding the right match back home. VivahMatch's advanced filters made it effortless. So grateful!", monthsMet: 5 },
  { brideName: "Deepa", groomName: "Senthil", city: "Trichy", marriageDate: new Date("2023-08-22"), quote: "Premium plan was worth every rupee. The relationship manager guided our families through the entire process patiently.", monthsMet: 6 },
  { brideName: "Yamini", groomName: "Gowtham", city: "Bangalore", marriageDate: new Date("2024-03-01"), quote: "We matched on a Monday, chatted for weeks, met in December, and got engaged on Valentine's Day. VivahMatch made it possible!", monthsMet: 2 },
  { brideName: "Hema", groomName: "Kiran", city: "Salem", marriageDate: new Date("2023-06-15"), quote: "Our parents were skeptical about online matrimony, but seeing our story they now recommend VivahMatch to everyone!", monthsMet: 7 },
];

// ── SEED FUNCTION ─────────────────────────────────────────────
const seed = async () => {
  const args  = process.argv.slice(2);
  const clear  = args.includes("--clear");
  const adminOnly = args.includes("--admin");

  console.log("\n🌱 VivahMatch Database Seeder\n" + "═".repeat(40));

  if (clear) {
    console.log("🗑️  Clearing all data...");
    await Promise.all([
      User.deleteMany({}),
      Profile.deleteMany({}),
      Interest.deleteMany({}),
      Notification.deleteMany({}),
      SuccessStory.deleteMany({}),
    ]);
    console.log("✅ All data cleared.\n");
    mongoose.disconnect();
    return;
  }

  // 1. ADMIN USER
  console.log("👤 Creating admin user...");
  const existingAdmin = await User.findOne({ email: "admin@vivah.com" });
  let adminUser;
  if (!existingAdmin) {
    adminUser = await User.create({
      name: "VivahMatch Admin",
      email: "admin@vivah.com",
      phone: "9000000000",
      password: hash("Admin@123"),
      gender: "Groom",
      role: "admin",
      premiumPlan: "diamond",
      isPremium: true,
      profileComplete: true,
    });
    console.log("   ✓ Admin created — admin@vivah.com / Admin@123");
  } else {
    adminUser = existingAdmin;
    console.log("   ℹ️  Admin already exists. Skipping.");
  }

  if (adminOnly) {
    console.log("\n✅ Admin-only seed complete.");
    mongoose.disconnect();
    return;
  }

  // 2. BRIDE USERS + PROFILES
  console.log("\n👰 Seeding bride profiles...");
  const brideUsers = [];
  for (const data of BRIDE_DATA) {
    try {
      let user = await User.findOne({ email: data.email });
      if (!user) {
        user = await User.create({
          name: data.name, email: data.email, phone: data.phone,
          password: hash("Test@1234"), gender: data.gender,
          premiumPlan: data.premiumPlan, isPremium: data.isPremium || false,
          profileComplete: true,
        });
      }
      await Profile.findOneAndUpdate(
        { user: user._id },
        { user: user._id, ...data.profile },
        { upsert: true, new: true }
      );
      brideUsers.push(user);
      console.log(`   ✓ ${data.name} (${data.premiumPlan})`);
    } catch (err) {
      console.error(`   ✗ ${data.name}: ${err.message}`);
    }
  }

  // 3. GROOM USERS + PROFILES
  console.log("\n🤵 Seeding groom profiles...");
  const groomUsers = [];
  for (const data of GROOM_DATA) {
    try {
      let user = await User.findOne({ email: data.email });
      if (!user) {
        user = await User.create({
          name: data.name, email: data.email, phone: data.phone,
          password: hash("Test@1234"), gender: data.gender,
          premiumPlan: data.premiumPlan, isPremium: data.isPremium || false,
          profileComplete: true,
        });
      }
      await Profile.findOneAndUpdate(
        { user: user._id },
        { user: user._id, ...data.profile },
        { upsert: true, new: true }
      );
      groomUsers.push(user);
      console.log(`   ✓ ${data.name} (${data.premiumPlan})`);
    } catch (err) {
      console.error(`   ✗ ${data.name}: ${err.message}`);
    }
  }

  // 4. SAMPLE INTERESTS
  console.log("\n💌 Creating sample interests...");
  const interestPairs = [
    { from: 0, to: 0, status: "pending",  msg: "Your profile looks wonderful!" },
    { from: 1, to: 1, status: "accepted", msg: "I'd love to connect." },
    { from: 2, to: 2, status: "pending",  msg: "Impressed by your profile." },
    { from: 3, to: 3, status: "accepted", msg: "We seem to be a great match!" },
    { from: 4, to: 4, status: "declined", msg: "Hello!" },
    { from: 0, to: 1, status: "pending",  msg: "Interested in knowing more." },
  ];

  for (const pair of interestPairs) {
    try {
      const from = groomUsers[pair.from];
      const to   = brideUsers[pair.to];
      if (!from || !to) continue;
      await Interest.findOneAndUpdate(
        { from: from._id, to: to._id },
        { from: from._id, to: to._id, status: pair.status, message: pair.msg },
        { upsert: true }
      );
    } catch (err) { /* skip duplicates */ }
  }
  console.log(`   ✓ ${interestPairs.length} interests seeded`);

  // 5. SAMPLE NOTIFICATIONS
  console.log("\n🔔 Creating sample notifications...");
  if (brideUsers[0] && groomUsers[0]) {
    await Notification.create([
      { user: brideUsers[0]._id, type: "interest", title: "New Interest!", body: `${groomUsers[0].name} sent you an interest.`, from: groomUsers[0]._id },
      { user: brideUsers[1]._id, type: "view",     title: "Profile Viewed", body: `${groomUsers[1].name} viewed your profile.`, from: groomUsers[1]._id },
      { user: groomUsers[0]._id, type: "accepted", title: "Interest Accepted! 🎉", body: `${brideUsers[1].name} accepted your interest.`, from: brideUsers[1]._id },
      { user: brideUsers[0]._id, type: "system",   title: "Profile Tip 💡", body: "Add your horoscope details to get 50% more matches!" },
    ]);
  }
  console.log("   ✓ Notifications seeded");

  // 6. SUCCESS STORIES
  console.log("\n💍 Seeding success stories...");
  for (const s of SUCCESS_STORIES_DATA) {
    await SuccessStory.findOneAndUpdate(
      { brideName: s.brideName, groomName: s.groomName },
      s,
      { upsert: true }
    );
  }
  console.log(`   ✓ ${SUCCESS_STORIES_DATA.length} success stories seeded`);

  // 7. SUMMARY
  const [users, profiles, interests, stories] = await Promise.all([
    User.countDocuments(),
    Profile.countDocuments(),
    Interest.countDocuments(),
    SuccessStory.countDocuments(),
  ]);

  console.log("\n" + "═".repeat(40));
  console.log("✅ SEEDING COMPLETE!");
  console.log("═".repeat(40));
  console.log(`👤 Users:          ${users}`);
  console.log(`📋 Profiles:       ${profiles}`);
  console.log(`💌 Interests:      ${interests}`);
  console.log(`💍 Success Stories:${stories}`);
  console.log("═".repeat(40));
  console.log("\n🔑 Test Logins:");
  console.log("   Admin:  admin@vivah.com   / Admin@123");
  console.log("   Bride:  priya@vivah.com   / Test@1234");
  console.log("   Groom:  arun@vivah.com    / Test@1234");
  console.log("═".repeat(40) + "\n");

  mongoose.disconnect();
};

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
