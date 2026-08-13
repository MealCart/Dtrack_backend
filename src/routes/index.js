// src/routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const jobRoutes = require('./jobRoutes');
const labelRoutes = require('./labelRoutes');
const collectionRoutes = require('./collectionRoutes');
const contactRoutes = require('./contactRoutes');
const timeRoutes = require('./timeRoutes');  // 👈 Time routes
const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/auth');

// ===== PUBLIC ROUTES (No Auth Required) =====
router.use('/time', timeRoutes);  // 👈 Server time endpoint

// ===== AUTH ROUTES =====
router.use('/auth', authRoutes);

// ===== ADMIN ROUTES (Protected) =====
router.use('/admin', adminRoutes);

// ===== JOB ROUTES (Protected) =====
router.use('/', jobRoutes);

// ===== LABEL ROUTES (Protected) =====
router.use('/', labelRoutes);

// ===== COLLECTION ROUTES (Protected) =====
router.use('/', collectionRoutes);

// ===== CONTACT ROUTES (Protected) =====
router.use('/', contactRoutes);

// ===== VEHICLE ROUTES (Protected) =====
router.get('/vehicles', authenticate, vehicleController.getVehicles);

module.exports = router;