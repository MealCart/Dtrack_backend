// src/routes/calendarRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const calendarController = require('../controllers/calendarController');
const dbCalendarController = require('../controllers/dbCalendarController');

// All routes require authentication
router.use(authenticate);

// Compatibility URLs also read the database only.
router.get('/calendar', calendarController.getCalendarData);
router.get('/calendar/date/:date', calendarController.getDateDetails);

// ===== NEW: DB-backed calendar =====
router.get('/db-calendar', dbCalendarController.getDbCalendar);

module.exports = router;