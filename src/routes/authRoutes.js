// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

// ===== PUBLIC ROUTES - NO AUTHENTICATION REQUIRED =====
router.post('/register', authController.register);
router.post('/login', authController.login);

// ===== PROTECTED ROUTES - AUTHENTICATION REQUIRED =====
// All routes below this line require authentication
router.use(authenticate);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);

// Admin-only routes (require authentication + admin role)
router.post('/admin/create-customer', authorize('admin'), authController.adminCreateCustomer);
router.post('/admin/create-staff', authorize('admin'), authController.adminCreateStaff);

module.exports = router;