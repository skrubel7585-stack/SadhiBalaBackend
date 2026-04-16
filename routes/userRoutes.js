const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/userController');

// All routes are protected (require authentication)
router.use(protect);

// ==================== PROFILE ROUTES ====================
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.delete('/profile', deleteUserAccount);
router.post('/change-password', changePassword);
router.post('/upload-profile-picture', uploadProfilePicture);

// ==================== DASHBOARD ROUTES ====================
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activities', getRecentActivities);

// ==================== MATCHES & SHORTLIST ROUTES ====================
router.get('/matches', getMatchesForUser);
router.get('/shortlist', getShortlistedProfiles);
router.post('/shortlist/:userId', toggleShortlist);

// ==================== INTEREST ROUTES ====================
router.post('/interest/:userId', sendInterest);
router.get('/interests', getInterests);
router.put('/interest/:interestId/:status', updateInterestStatus);

// ==================== PROFILE VIEWS ====================
router.get('/profile-views', getProfileViews);
router.post('/view-profile/:userId', (req, res) => {
  // Track profile view
  res.json({ success: true, message: 'Profile view tracked' });
});

// ==================== ADMIN ROUTES ====================
router.get('/all', authorize('admin'), getAllUsers);
router.get('/:userId', authorize('admin'), getUserById);
router.put('/status/:userId', authorize('admin'), updateUserStatus);

module.exports = router;