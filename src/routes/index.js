// src/routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const jobRoutes = require('./jobRoutes');
const labelRoutes = require('./labelRoutes');
const collectionRoutes = require('./collectionRoutes');
const contactRoutes = require('./contactRoutes');
const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/auth');

// Register all route modules
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/', jobRoutes);
router.use('/', labelRoutes);
router.use('/', collectionRoutes);
router.use('/', contactRoutes);  // 👈 Contact routes registered here

// Vehicle routes
router.get('/vehicles', authenticate, vehicleController.getVehicles);

module.exports = router;