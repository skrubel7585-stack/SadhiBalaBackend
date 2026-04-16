const { body } = require('express-validator');

const registerValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('mobileNumber')
    .notEmpty()
    .withMessage('Mobile number is required')
    .isLength({ min: 10, max: 10 })
    .withMessage('Mobile number must be exactly 10 digits')
    .matches(/^[0-9]+$/)
    .withMessage('Mobile number must contain only digits'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),

  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),

  body('lookingFor')
    .notEmpty()
    .withMessage('Looking for is required')
    .isIn(['male', 'female', 'both'])
    .withMessage('Looking for must be male, female, or both'),

  body('dateOfBirth')
    .notEmpty()
    .withMessage('Date of birth is required')
    .isISO8601()
    .withMessage('Invalid date format'),

  body('religion')
    .notEmpty()
    .withMessage('Religion is required'),

  body('motherTongue')
    .notEmpty()
    .withMessage('Mother tongue is required'),

  body('address.city')
    .notEmpty()
    .withMessage('City is required'),

  body('address.state')
    .notEmpty()
    .withMessage('State is required'),
];

// ✅ FIXED: Login validation - accepts mobileNumber OR email
const loginValidation = [
  body('mobileNumber')
    .optional()  // ✅ Optional - can login with mobile
    .isLength({ min: 10, max: 10 })
    .withMessage('Mobile number must be exactly 10 digits')
    .matches(/^[0-9]+$/)
    .withMessage('Mobile number must contain only digits'),
  
  body('email')
    .optional()  // ✅ Optional - can login with email
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  // ✅ Custom validation: either mobileNumber OR email must be provided
  body().custom((value, { req }) => {
    if (!req.body.mobileNumber && !req.body.email) {
      throw new Error('Either mobile number or email is required');
    }
    return true;
  })
];

// Forgot password validation
const forgotPasswordValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
];

// Reset password validation
const resetPasswordValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('otp')
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

// Update profile validation
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('mobileNumber')
    .optional()
    .isLength({ min: 10, max: 10 })
    .withMessage('Mobile number must be exactly 10 digits'),
];

module.exports = {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updateProfileValidation,
};