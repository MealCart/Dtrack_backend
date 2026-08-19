// src/routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const jobRoutes = require('./jobRoutes');
const labelRoutes = require('./labelRoutes');
const collectionRoutes = require('./collectionRoutes');
const contactRoutes = require('./contactRoutes');
const timeRoutes = require('./timeRoutes');
const postcodeManagementRoutes = require('./postcodeManagementRoutes');
const calendarRoutes = require('./calendarRoutes');
const postcodeLookupRoutes = require('./postcodeLookupRoutes'); // 👈 NEW
const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/auth');
const scanReportRoutes = require('./scanReportRoutes');
// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// 👇 Postcode Lookup Routes - PUBLIC (No auth required)
// These must be registered BEFORE any auth middleware
router.use('/postcode', postcodeLookupRoutes);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

// Auth routes (public for login/register, authenticated for some)
router.use('/auth', authRoutes);

// Admin routes (authenticated + admin only)
router.use('/admin', adminRoutes);
router.use('/', scanReportRoutes);
// Core business routes (authenticated)
router.use('/', jobRoutes);
router.use('/', labelRoutes);
router.use('/', collectionRoutes);
router.use('/', contactRoutes);
router.use('/', timeRoutes);
router.use('/', calendarRoutes);

// 👇 Postcode Management Routes (Admin only)
router.use('/admin', postcodeManagementRoutes);

// Vehicle routes (authenticated)
router.get('/vehicles', authenticate, vehicleController.getVehicles);

module.exports = router;