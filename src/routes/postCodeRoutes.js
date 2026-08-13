// src/routes/postCodeRoutes.js
const express = require('express');
const router = express.Router();
// ❌ REMOVE THIS - const { authenticate } = require('../middleware/auth');
const postCodeValidationController = require('../controllers/postCodeValidationController');

// ✅ All routes are public (no authentication)
// If you want to protect them, add authentication per route

// Validate a single post code with date
router.post('/validate-postcode', postCodeValidationController.validatePostCode);

// Validate multiple post codes (for bulk upload)
router.post('/validate-postcodes-bulk', postCodeValidationController.validatePostCodesBulk);

// Get delivery schedule for a post code
router.get('/postcode-schedule/:postCode', postCodeValidationController.getPostCodeSchedule);

// Get all post codes by region
router.get('/postcodes/:region', postCodeValidationController.getPostCodesByRegion);

module.exports = router;