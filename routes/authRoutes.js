const express = require('express');
const router = express.Router();

// Controllers
const authController = require('../controllers/authController');

// Middlewares
const { protect, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validationMiddleware');

// Validations
const { registerValidation, loginValidation } = require('../validations/authValidation');

// ==================== PUBLIC ROUTES ====================
router.post('/register', registerValidation, validate, authController.register);
router.post('/login', loginValidation, validate, authController.login);

// ==================== PROTECTED ROUTES ====================
// All routes below this will require authentication
router.use(protect);

// User routes
router.get('/me', authController.getMe);
router.put('/profile', authController.updateProfile);
router.post('/logout', authController.logout);

// Dashboard routes
router.get('/matches', authController.getMatches);
router.get('/stats', authController.getStats);
router.get('/activities', authController.getActivities);
router.post('/send-interest', authController.sendInterest);
router.get('/explore', authController.getExploreProfiles);

// Shortlist routes
router.get('/shortlist', authController.getShortlist);
router.post('/shortlist', authController.toggleShortlist);

// Admin only routes
router.get('/admin', authorize('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Welcome admin!',
    user: req.user,
  });
});

module.exports = router;