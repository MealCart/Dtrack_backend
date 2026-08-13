// src/routes/postcodeManagementRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const postcodeController = require('../controllers/postcodeManagementController');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// ============================================
// WEEKLY SCHEDULE ROUTES
// ============================================
router.get('/postcodes/weekly', postcodeController.getWeeklySchedules);
router.get('/postcodes/weekly/:postCode', postcodeController.getWeeklySchedule);
router.post('/postcodes/weekly', postcodeController.createWeeklySchedule);
router.put('/postcodes/weekly/:postCode', postcodeController.updateWeeklySchedule);
router.delete('/postcodes/weekly/:postCode', postcodeController.deleteWeeklySchedule);

// ============================================
// FORTNIGHTLY POSTCODES ROUTES
// ============================================
router.get('/postcodes/fortnightly-postcodes', postcodeController.getFortnightlyPostcodes);
router.get('/postcodes/fortnightly-postcodes/:id', postcodeController.getFortnightlyPostcode);
router.post('/postcodes/fortnightly-postcodes', postcodeController.createFortnightlyPostcode);
router.put('/postcodes/fortnightly-postcodes/:id', postcodeController.updateFortnightlyPostcode);
router.delete('/postcodes/fortnightly-postcodes/:id', postcodeController.deleteFortnightlyPostcode);

// ============================================
// FORTNIGHTLY DATES ROUTES
// ============================================
router.get('/postcodes/fortnightly-dates', postcodeController.getFortnightlyDates);
router.get('/postcodes/fortnightly-dates/:id', postcodeController.getFortnightlyDate);
router.post('/postcodes/fortnightly-dates', postcodeController.createFortnightlyDate);
router.put('/postcodes/fortnightly-dates/:id', postcodeController.updateFortnightlyDate);
router.delete('/postcodes/fortnightly-dates/:id', postcodeController.deleteFortnightlyDate);

module.exports = router;