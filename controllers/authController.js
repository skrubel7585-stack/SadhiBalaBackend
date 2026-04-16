const authService = require('../services/authService');
const AppError = require('../utils/AppError');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user._id);
    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    // Client-side token removal - no server-side action needed for JWT
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ==================== DASHBOARD ROUTES ====================

// @desc    Get user matches
// @route   GET /api/auth/matches
// @access  Private
const getMatches = async (req, res, next) => {
  try {
    const matches = await authService.getMatches(req.user._id);
    res.status(200).json({
      success: true,
      matches,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user stats
// @route   GET /api/auth/stats
// @access  Private
const getStats = async (req, res, next) => {
  try {
    const stats = await authService.getStats(req.user._id);
    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user activities
// @route   GET /api/auth/activities
// @access  Private
const getActivities = async (req, res, next) => {
  try {
    const activities = await authService.getActivities(req.user._id);
    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send interest to a profile
// @route   POST /api/auth/send-interest
// @access  Private
const sendInterest = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const result = await authService.sendInterest(req.user._id, targetUserId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Get shortlisted profiles
// @route   GET /api/auth/shortlist
// @access  Private
// const getShortlist = async (req, res, next) => {
//   try {
//     const shortlist = await authService.getShortlistedProfiles(req.user._id);
//     res.status(200).json({
//       success: true,
//       shortlist,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// @desc    Add to shortlist
// @route   POST /api/auth/shortlist
// @access  Private
const addToShortlist = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const result = await authService.shortlistProfile(req.user._id, targetUserId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user._id, currentPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// @desc    Get explore profiles
// @route   GET /api/auth/explore
// @access  Private
const getExploreProfiles = async (req, res, next) => {
  try {
    const profiles = await authService.getExploreProfiles(req.user._id);
    res.status(200).json({
      success: true,
      profiles,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get shortlisted profiles
// @route   GET /api/auth/shortlist
// @access  Private
const getShortlist = async (req, res, next) => {
  try {
    const shortlist = await authService.getShortlistedProfiles(req.user._id);
    res.status(200).json({
      success: true,
      shortlist,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add to shortlist / Remove from shortlist
// @route   POST /api/auth/shortlist
// @access  Private
const toggleShortlist = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    
    if (!targetUserId) {
      throw new AppError("Target user ID is required", 400);
    }
    
    const result = await authService.shortlistProfile(req.user._id, targetUserId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  logout,
  getMatches,
  getStats,
  getActivities,
  sendInterest,
  getShortlist,
  addToShortlist,
  changePassword,
  getExploreProfiles,
  toggleShortlist
};