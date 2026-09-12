// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const otpController = require('../controllers/otpController');
const { authenticate, authorize } = require('../middleware/auth');

// ===== PUBLIC ROUTES (No auth required) =====
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/shopify-login', authController.shopifyLogin);

// OTP Routes - MUST BE PUBLIC
router.post('/send-otp', otpController.sendOTP);
router.post('/verify-otp', otpController.verifyOTP);
router.post('/resend-otp', otpController.resendOTP);
router.post('/reset-password', authController.resetPassword);

// ===== PROTECTED ROUTES (Auth required) =====
router.use(authenticate);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);

// Admin-only routes
router.post('/admin/create-customer', authorize('admin'), authController.adminCreateCustomer);
router.post('/admin/create-staff', authorize('admin'), authController.adminCreateStaff);
router.post('/admin/change-password', authorize('admin'), authController.adminChangePassword);

module.exports = router;