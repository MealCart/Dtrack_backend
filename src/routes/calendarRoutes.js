// src/routes/calendarRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const calendarController = require('../controllers/calendarController');

// All routes require authentication
router.use(authenticate);

// Get calendar data for a date range
router.get('/calendar', calendarController.getCalendarData);

// Get calendar data for a specific date (with job details)
router.get('/calendar/date/:date', calendarController.getDateDetails);

module.exports = router;