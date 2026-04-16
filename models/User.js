const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    mobileNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 6, select: false },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    lookingFor: { type: String, enum: ["male", "female", "both"], required: true },
    dateOfBirth: { type: Date, required: true },
    age: { type: Number },
    address: {
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, default: "India" },
    },
    education: {
      highestDegree: String,
      institution: String,
      fieldOfStudy: String,
    },
    occupation: String,
    annualIncome: String,
    religion: { type: String, enum: ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Other"], required: true },
    caste: String,
    motherTongue: String,
    height: String,
    diet: String,
    smoking: { type: String, default: "Never" },
    drinking: { type: String, default: "Never" },
    about: String,
    partnerPreferences: {
      minAge: { type: Number, default: 21 },
      maxAge: { type: Number, default: 35 },
      preferredReligion: String,
      preferredLocation: String,
    },
    maritalStatus: { type: String, default: "Never Married" },
    profilePicture: String,
    profileCompletion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    lastLogin: Date,
    lastActive: { type: Date, default: Date.now },
    resetOTP: String,
    resetOTPExpiry: Date,
    shortlistedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        shortlistedAt: { type: Date, default: Date.now },
      },
    ],
    profileViews: [
      {
        viewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// ⚠️ NO MIDDLEWARE HERE - We'll handle everything in the service

// Compare password method (sync)
userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compareSync(candidatePassword, this.password);
};

// Calculate profile completion
userSchema.methods.calculateProfileCompletion = function() {
  let completed = 0;
  const fields = ['name', 'email', 'mobileNumber', 'gender', 'lookingFor', 'dateOfBirth', 'address.city', 'religion'];
  fields.forEach(field => {
    if (field.includes('.')) {
      const [p, c] = field.split('.');
      if (this[p] && this[p][c]) completed++;
    } else if (this[field]) completed++;
  });
  this.profileCompletion = Math.round((completed / fields.length) * 100);
  return this.profileCompletion;
};

// Calculate age
userSchema.methods.calculateAge = function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// To JSON transform
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  delete user.resetOTP;
  delete user.resetOTPExpiry;
  return user;
};

module.exports = mongoose.model("User", userSchema);