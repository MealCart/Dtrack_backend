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
const postcodeManagementRoutes = require('./postcodeManagementRoutes'); // 👈 MUST EXIST
const vehicleController = require('../controllers/vehicleController');
const { authenticate } = require('../middleware/auth');

// Register all route modules
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/', jobRoutes);
router.use('/', labelRoutes);
router.use('/', collectionRoutes);
router.use('/', contactRoutes);
router.use('/', timeRoutes);

// 👇 Postcode Management Routes (Admin only)
router.use('/admin', postcodeManagementRoutes);

// Vehicle routes
router.get('/vehicles', authenticate, vehicleController.getVehicles);

module.exports = router;