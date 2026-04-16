const User = require("../models/User");
const {
  generateToken,
  generateRefreshToken,
} = require("../utils/generateToken");
const AppError = require("../utils/AppError");
const bcrypt = require("bcryptjs");

class AuthService {
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Register new user
  async register(userData) {
    const {
      name,
      email,
      mobileNumber,
      password,
      gender,
      lookingFor,
      dateOfBirth,
      religion,
      caste,
      motherTongue,
      maritalStatus,
      education,
      occupation,
      annualIncome,
      address,
      height,
      diet,
      smoking,
      drinking,
      about,
      partnerPreferences,
    } = userData;

    // Check if user already exists with email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      throw new AppError("User already exists with this email", 400);
    }

    // Check if user already exists with mobile number
    const existingMobile = await User.findOne({ mobileNumber });
    if (existingMobile) {
      throw new AppError("User already exists with this mobile number", 400);
    }

    // Calculate age from dateOfBirth
    const calculateAge = (dob) => {
      const today = new Date();
      const birthDate = new Date(dob);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      return age;
    };

    const age = dateOfBirth ? calculateAge(dateOfBirth) : null;

    // Validate age (minimum 18 years)
    if (age && age < 18) {
      throw new AppError("You must be at least 18 years old to register", 400);
    }

    // Hash password here (not in middleware)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      email,
      mobileNumber,
      password: hashedPassword,
      gender,
      lookingFor,
      dateOfBirth,
      age,
      religion,
      caste: caste || "",
      motherTongue,
      maritalStatus: maritalStatus || "Never Married",
      education: {
        highestDegree: education?.highestDegree || "",
        institution: education?.institution || "",
        fieldOfStudy: education?.fieldOfStudy || "",
      },
      occupation: occupation || "",
      annualIncome: annualIncome || "",
      address: {
        city: address?.city || "",
        state: address?.state || "",
        country: address?.country || "India",
      },
      height: height || "",
      diet: diet || "",
      smoking: smoking || "Never",
      drinking: drinking || "Never",
      about: about || "",
      partnerPreferences: {
        minAge: partnerPreferences?.minAge || 21,
        maxAge: partnerPreferences?.maxAge || 35,
        preferredReligion: partnerPreferences?.preferredReligion || "",
        preferredLocation: partnerPreferences?.preferredLocation || "",
      },
      isActive: true,
    });

    // Save user
    await user.save();

    // Calculate profile completion
    user.calculateProfileCompletion();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Remove password from response
    const userResponse = user.toJSON();

    return {
      success: true,
      message: "User registered successfully",
      token,
      refreshToken,
      user: userResponse,
    };
  }

  // Login user
  async login(credentials) {
    const { mobileNumber, password } = credentials;

    if (!mobileNumber || !password) {
      throw new AppError("Mobile number and password are required", 400);
    }

    const user = await User.findOne({ mobileNumber }).select("+password");
    if (!user) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    if (!user.isActive) {
      throw new AppError("Your account has been deactivated", 401);
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      throw new AppError("Invalid mobile number or password", 401);
    }

    user.lastLogin = new Date();
    user.lastActive = new Date();
    await user.save();

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    const userResponse = user.toJSON();

    return {
      success: true,
      message: "Login successful",
      token,
      refreshToken,
      user: userResponse,
    };
  }

  // Forgot password - send OTP
  async forgotPassword(email) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("No user found with this email", 404);
    }

    const otp = this.generateOTP();
    user.resetOTP = otp;
    user.resetOTPExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    console.log(`OTP for ${email}: ${otp}`);

    return {
      success: true,
      message: "OTP sent to your email",
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    };
  }

  // Reset password with OTP
  async resetPassword(email, otp, newPassword) {
    const user = await User.findOne({
      email,
      resetOTP: otp,
      resetOTPExpiry: { $gt: Date.now() },
    });

    if (!user) {
      throw new AppError("Invalid or expired OTP", 400);
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    await user.save();

    return {
      success: true,
      message: "Password reset successful",
    };
  }

  // Get current user
  async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const isPasswordMatch = await user.comparePassword(currentPassword);
    if (!isPasswordMatch) {
      throw new AppError("Current password is incorrect", 401);
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return {
      success: true,
      message: "Password changed successfully",
    };
  }

  // Update profile
  async updateProfile(userId, updateData) {
    const allowedUpdates = [
      "name",
      "email",
      "mobileNumber",
      "gender",
      "lookingFor",
      "dateOfBirth",
      "religion",
      "caste",
      "motherTongue",
      "maritalStatus",
      "education",
      "occupation",
      "annualIncome",
      "address",
      "height",
      "diet",
      "smoking",
      "drinking",
      "about",
      "partnerPreferences",
      "profilePicture",
    ];

    const updates = {};

    Object.keys(updateData).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = updateData[key];
      }
    });

    if (updates.dateOfBirth) {
      const calculateAge = (dob) => {
        const today = new Date();
        const birthDate = new Date(dob);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ) {
          age--;
        }
        return age;
      };
      updates.age = calculateAge(updates.dateOfBirth);
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    user.calculateProfileCompletion();
    await user.save();

    return {
      success: true,
      message: "Profile updated successfully",
      user,
    };
  }

  // ==================== DASHBOARD METHODS ====================

  // Get user matches
  async getMatches(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Find matches based on preferences
    const matches = await User.find({
      _id: { $ne: userId },
      isActive: true,
      gender: user.lookingFor,
      lookingFor: user.gender,
      age: {
        $gte: user.partnerPreferences?.minAge || 18,
        $lte: user.partnerPreferences?.maxAge || 100,
      },
    })
      .select("-password -__v")
      .limit(20);

    // Calculate compatibility for each match
    const matchesWithCompatibility = matches.map((match) => {
      const compatibility = this.calculateCompatibility(user, match);
      return {
        ...match.toJSON(),
        compatibility,
      };
    });

    return matchesWithCompatibility;
  }

  // Get user stats
  async getStats(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // TODO: Implement real stats from database
    return {
      profileViews: 156,
      interests: 23,
      matches: 12,
      profileScore: user.profileCompletion || 0,
    };
  }

  // Get user activities
  async getActivities(userId) {
    // TODO: Implement real activities from database
    return [
      {
        id: 1,
        text: "New match request from Priya Sharma",
        time: "5 min ago",
        icon: "heart-circle-outline",
      },
      {
        id: 2,
        text: "Your profile got 10 new views",
        time: "1 hour ago",
        icon: "eye-outline",
      },
      {
        id: 3,
        text: "Reminder: Complete your profile",
        time: "1 day ago",
        icon: "alert-circle-outline",
      },
    ];
  }

  // Send interest to a profile
  async sendInterest(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new AppError("You cannot send interest to yourself", 400);
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new AppError("User not found", 404);
    }

    // TODO: Implement interest storage logic
    return {
      success: true,
      message: "Interest sent successfully",
    };
  }

  // Get shortlisted profiles
  async getShortlistedProfiles(userId) {
    const user = await User.findById(userId).populate(
      "shortlistedBy.userId",
      "name age gender location profilePicture occupation",
    );
    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user.shortlistedBy.map((item) => ({
      ...item.userId.toJSON(),
      shortlistedAt: item.shortlistedAt,
    }));
  }

  // Shortlist a profile
  async shortlistProfile(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new AppError("You cannot shortlist your own profile", 400);
    }

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!user || !targetUser) {
      throw new AppError("User not found", 404);
    }

    const alreadyShortlisted = user.shortlistedBy?.some(
      (item) => item.userId.toString() === targetUserId,
    );

    if (alreadyShortlisted) {
      user.shortlistedBy = user.shortlistedBy.filter(
        (item) => item.userId.toString() !== targetUserId,
      );
      await user.save();
      return {
        success: true,
        message: "Profile removed from shortlist",
        isShortlisted: false,
      };
    } else {
      user.shortlistedBy.push({
        userId: targetUserId,
        shortlistedAt: new Date(),
      });
      await user.save();
      return {
        success: true,
        message: "Profile shortlisted successfully",
        isShortlisted: true,
      };
    }
  }

  // Calculate compatibility between two users
  calculateCompatibility(user1, user2) {
    let score = 0;
    let total = 0;

    // Age compatibility
    if (user1.partnerPreferences) {
      if (
        user2.age >= user1.partnerPreferences.minAge &&
        user2.age <= user1.partnerPreferences.maxAge
      ) {
        score += 20;
      }
      total += 20;
    }

    // Religion compatibility
    if (user1.religion === user2.religion) {
      score += 20;
    }
    total += 20;

    // Location compatibility
    if (user1.address?.city === user2.address?.city) {
      score += 20;
    } else if (user1.address?.state === user2.address?.state) {
      score += 10;
    }
    total += 20;

    // Occupation compatibility
    if (user1.occupation === user2.occupation) {
      score += 20;
    }
    total += 20;

    // Education compatibility
    if (user1.education?.highestDegree === user2.education?.highestDegree) {
      score += 20;
    }
    total += 20;

    return Math.round((score / total) * 100);
  }

  // Delete account
  async deleteAccount(userId) {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return {
      success: true,
      message: "Account deleted successfully",
    };
  }
  // Get explore profiles
  async getExploreProfiles(userId) {
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      throw new AppError("User not found", 404);
    }

    const profiles = await User.find({
      _id: { $ne: userId },
      isActive: true,
      gender: currentUser.lookingFor,
      lookingFor: currentUser.gender,
    })
      .select("-password -__v")
      .limit(30);

    // Calculate compatibility for each profile
    return profiles.map((profile) => ({
      ...profile.toJSON(),
      compatibility: this.calculateCompatibility(currentUser, profile),
    }));
  }

  // Get shortlisted profiles
  async getShortlistedProfiles(userId) {
    const user = await User.findById(userId).populate(
      "shortlistedBy.userId",
      "name age gender address.city occupation profilePicture",
    );
    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user.shortlistedBy.map((item) => ({
      ...item.userId.toJSON(),
      shortlistedAt: item.shortlistedAt,
    }));
  }

  // Shortlist a profile
  async shortlistProfile(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new AppError("You cannot shortlist your own profile", 400);
    }

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!user || !targetUser) {
      throw new AppError("User not found", 404);
    }

    // Initialize shortlistedBy array if it doesn't exist
    if (!user.shortlistedBy) {
      user.shortlistedBy = [];
    }

    const alreadyShortlisted = user.shortlistedBy.some(
      (item) => item.userId.toString() === targetUserId,
    );

    if (alreadyShortlisted) {
      user.shortlistedBy = user.shortlistedBy.filter(
        (item) => item.userId.toString() !== targetUserId,
      );
      await user.save();
      return {
        success: true,
        message: "Profile removed from shortlist",
        isShortlisted: false,
      };
    } else {
      user.shortlistedBy.push({
        userId: targetUserId,
        shortlistedAt: new Date(),
      });
      await user.save();
      return {
        success: true,
        message: "Profile shortlisted successfully",
        isShortlisted: true,
      };
    }
  }
}

module.exports = new AuthService();
