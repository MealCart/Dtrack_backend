// src/controllers/vehicleController.js
const DetrackService = require('../services/detrackService');

// ===== VEHICLE ENDPOINTS =====
exports.getVehicles = async (req, res) => {
  try {
    const response = await DetrackService.getVehicles();
    return res.json(response);
  } catch (error) {
    console.error('Vehicles fetch error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch vehicles',
      details: error.message
    });
  }
};