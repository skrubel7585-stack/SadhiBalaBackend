const User = require('../models/User');
const Message = require('../models/Message');
const AppError = require('../utils/AppError');
const bcrypt = require('bcryptjs');

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -__v')
      .populate('shortlistedBy.userId', 'name age gender address.city profilePicture');
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res, next) => {
  try {
    const allowedUpdates = [
      'name', 'email', 'mobileNumber', 'gender', 'lookingFor',
      'dateOfBirth', 'religion', 'caste', 'motherTongue', 'maritalStatus',
      'education', 'occupation', 'annualIncome', 'address', 'height',
      'diet', 'smoking', 'drinking', 'about', 'partnerPreferences',
      'profilePicture'
    ];

    const updates = {};
    
    Object.keys(req.body).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    if (updates.dateOfBirth) {
      const calculateAge = (dob) => {
        const today = new Date();
        const birthDate = new Date(dob);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        return age;
      };
      updates.age = calculateAge(updates.dateOfBirth);
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    user.calculateProfileCompletion();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user account
// @route   DELETE /api/users/profile
// @access  Private
const deleteUserAccount = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   POST /api/users/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isPasswordMatch = await user.comparePassword(currentPassword);
    if (!isPasswordMatch) {
      throw new AppError('Current password is incorrect', 401);
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload profile picture
// @route   POST /api/users/upload-profile-picture
// @access  Private
const uploadProfilePicture = async (req, res, next) => {
  try {
    const { profilePictureUrl } = req.body;

    if (!profilePictureUrl) {
      throw new AppError('Profile picture URL is required', 400);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: profilePictureUrl },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/users/all
// @access  Private/Admin
const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const users = await User.find({})
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.status(200).json({
      success: true,
      users,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/:userId
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user status (active/blocked)
// @route   PUT /api/users/status/:userId
// @access  Private/Admin
const updateUserStatus = async (req, res, next) => {
  try {
    const { isActive, isBlocked, blockedReason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive, isBlocked, blockedReason },
      { new: true }
    ).select('-password');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get shortlisted profiles
// @route   GET /api/users/shortlist
// @access  Private
const getShortlistedProfiles = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('shortlistedBy.userId', 'name age gender address.city occupation profilePicture');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const shortlist = user.shortlistedBy.map(item => ({
      ...item.userId.toJSON(),
      shortlistedAt: item.shortlistedAt
    }));

    res.status(200).json({
      success: true,
      shortlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get matches for user
// @route   GET /api/users/matches
// @access  Private
const getMatchesForUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const matches = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      isBlocked: false,
      gender: user.lookingFor,
      lookingFor: user.gender,
      age: {
        $gte: user.partnerPreferences?.minAge || 18,
        $lte: user.partnerPreferences?.maxAge || 100,
      }
    })
    .select('-password -__v')
    .limit(50)
    .sort({ createdAt: -1 });

    // Calculate compatibility
    const matchesWithCompatibility = matches.map(match => ({
      ...match.toJSON(),
      compatibility: calculateCompatibility(user, match)
    }));

    res.status(200).json({
      success: true,
      matches: matchesWithCompatibility,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle shortlist
// @route   POST /api/users/shortlist/:userId
// @access  Private
const toggleShortlist = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      throw new AppError('You cannot shortlist your own profile', 400);
    }

    const user = await User.findById(req.user._id);
    const targetUser = await User.findById(userId);

    if (!user || !targetUser) {
      throw new AppError('User not found', 404);
    }

    const alreadyShortlisted = user.shortlistedBy?.some(
      item => item.userId.toString() === userId
    );

    if (alreadyShortlisted) {
      user.shortlistedBy = user.shortlistedBy.filter(
        item => item.userId.toString() !== userId
      );
      await user.save();
      return res.status(200).json({
        success: true,
        message: 'Profile removed from shortlist',
        isShortlisted: false,
      });
    } else {
      user.shortlistedBy.push({
        userId: targetUser._id,
        shortlistedAt: new Date(),
      });
      await user.save();
      return res.status(200).json({
        success: true,
        message: 'Profile shortlisted successfully',
        isShortlisted: true,
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Send interest to a profile
// @route   POST /api/users/interest/:userId
// @access  Private
const sendInterest = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      throw new AppError('You cannot send interest to yourself', 400);
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      throw new AppError('User not found', 404);
    }

    // You can implement interest model here
    res.status(200).json({
      success: true,
      message: 'Interest sent successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get interests
// @route   GET /api/users/interests
// @access  Private
const getInterests = async (req, res, next) => {
  try {
    // Implement interest fetching logic
    res.status(200).json({
      success: true,
      interests: [],
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update interest status
// @route   PUT /api/users/interest/:interestId/:status
// @access  Private
const updateInterestStatus = async (req, res, next) => {
  try {
    const { interestId, status } = req.params;
    // Implement interest status update logic
    res.status(200).json({
      success: true,
      message: `Interest ${status === 'accept' ? 'accepted' : 'rejected'}`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get profile views
// @route   GET /api/users/profile-views
// @access  Private
const getProfileViews = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('profileViews.viewedBy', 'name age gender address.city profilePicture');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      profileViews: user.profileViews || [],
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats
// @route   GET /api/users/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    const profileViews = user.profileViews?.length || 0;
    const shortlistCount = user.shortlistedBy?.length || 0;
    const matches = await User.countDocuments({
      lookingFor: user.gender,
      gender: user.lookingFor,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      stats: {
        profileViews,
        interests: shortlistCount,
        matches,
        profileScore: user.profileCompletion || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get recent activities
// @route   GET /api/users/dashboard/activities
// @access  Private
const getRecentActivities = async (req, res, next) => {
  try {
    // Fetch recent activities (profile views, interests, matches)
    const activities = [
      { id: 1, text: 'Someone viewed your profile', time: '5 min ago', icon: 'eye-outline' },
      { id: 2, text: 'New match request received', time: '1 hour ago', icon: 'heart-outline' },
      { id: 3, text: 'Your profile is 100% complete', time: '1 day ago', icon: 'checkmark-circle-outline' },
    ];

    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to calculate compatibility
const calculateCompatibility = (user1, user2) => {
  let score = 0;
  let total = 0;

  // Age compatibility
  if (user1.partnerPreferences) {
    if (user2.age >= user1.partnerPreferences.minAge && user2.age <= user1.partnerPreferences.maxAge) {
      score += 25;
    }
    total += 25;
  }

  // Religion compatibility
  if (user1.religion === user2.religion) {
    score += 25;
  }
  total += 25;

  // Location compatibility
  if (user1.address?.city === user2.address?.city) {
    score += 25;
  } else if (user1.address?.state === user2.address?.state) {
    score += 15;
  }
  total += 25;

  // Occupation compatibility
  if (user1.occupation === user2.occupation) {
    score += 25;
  }
  total += 25;

  return Math.round((score / total) * 100);
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  getAllUsers,
  getUserById,
  updateUserStatus,
  changePassword,
  uploadProfilePicture,
  getShortlistedProfiles,
  getMatchesForUser,
  getProfileViews,
  toggleShortlist,
  sendInterest,
  getInterests,
  updateInterestStatus,
  getDashboardStats,
  getRecentActivities,
};