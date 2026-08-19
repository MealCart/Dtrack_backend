// src/routes/scanReportRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const scanReportController = require('../controllers/scanReportController');

// ===== SCAN REPORT ROUTES =====

// Get scan report for a specific date
router.get('/scan-report', authenticate, scanReportController.getScanReport);

// Get scan report summary for dashboard
router.get('/scan-report/summary', authenticate, scanReportController.getScanReportSummary);

// Get detailed scan report for a specific job
router.get('/scan-report/job/:doNumber', authenticate, scanReportController.getJobScanDetails);

// Export scan report as CSV/Excel
router.get('/scan-report/export', authenticate, scanReportController.exportScanReport);

module.exports = router;