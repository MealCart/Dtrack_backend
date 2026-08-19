// src/routes/postcodeLookupRoutes.js
const express = require('express');
const router = express.Router();
const postcodeLookupController = require('../controllers/postcodeLookupController');

// ===== PUBLIC ROUTES (No authentication required) =====
// These routes should be accessible without a token

// Get delivery schedule for a postcode (shows all suburbs and delivery days)
router.get('/lookup/:postCode', postcodeLookupController.getPostcodeSchedule);

// Search postcodes for autocomplete
router.get('/lookup/search', postcodeLookupController.searchPostcodes);

// Check if a postcode is deliverable on a specific date
router.get('/lookup/:postCode/check/:date', postcodeLookupController.checkDeliveryDate);

// Get all suburbs for a postcode
router.get('/lookup/:postCode/suburbs', postcodeLookupController.getSuburbs);

module.exports = router;