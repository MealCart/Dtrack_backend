// src/routes/searchRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const searchController = require('../controllers/searchController');

// Search jobs by DO number - searches Detrack directly
router.get('/search/job', authenticate, searchController.searchJobByDoNumber);

// Search jobs by multiple criteria
router.get('/search/jobs', authenticate, searchController.searchJobs);

module.exports = router;