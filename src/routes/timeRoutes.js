// src/routes/timeRoutes.js
const express = require('express');
const router = express.Router();

// ===== GET SERVER TIME - PUBLIC ROUTE =====
router.get('/server-time', (req, res) => {
  try {
    const now = new Date();
    console.log('🕐 Server time requested:', now.toISOString());
    res.json({
      success: true,
      time: now.toISOString(),
      timestamp: now.getTime(),
      timezone: 'Australia/Sydney',
      message: 'Server time fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error getting server time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server time',
      message: error.message
    });
  }
});

module.exports = router;