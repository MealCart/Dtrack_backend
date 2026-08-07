// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

// Admin-only routes
router.post('/admin/create-customer', authenticate, authorize('admin'), authController.adminCreateCustomer);
router.post('/admin/create-staff', authenticate, authorize('admin'), authController.adminCreateStaff);

module.exports = router;
