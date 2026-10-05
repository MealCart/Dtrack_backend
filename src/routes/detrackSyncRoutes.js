// src/routes/detrackSyncRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const detrackSyncController = require('../controllers/detrackSyncController');

// All routes require authentication
router.use(authenticate);

// Preview what's missing from Detrack for a date (customer only)
router.get('/detrack-sync/preview', detrackSyncController.previewSync);

// Commit the sync — insert missing jobs & collections
router.post('/detrack-sync/commit', detrackSyncController.commitSync);

module.exports = router;