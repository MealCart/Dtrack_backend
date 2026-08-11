// src/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const jobController = require('../controllers/jobController');
const collectionController = require('../controllers/collectionController');

// All routes require authentication
router.use(authenticate);

// Database jobs
router.get('/db-jobs', jobController.getJobs);
router.get('/db-jobs/:id', jobController.getJob);

// Create jobs
router.post('/create-job', jobController.createJob);
router.post('/upload-manifest', upload.single('file'), jobController.uploadManifest);

// Collection upload
router.post('/upload-collection-manifest', upload.single('file'), collectionController.uploadCollectionManifest);

// 👇 Detrack API jobs with filters & pagination
router.get('/detrack-jobs', jobController.getDetrackJobsWithFilters);

// 👇 Fetch collections from Detrack
router.get('/detrack-collections', jobController.getDetrackCollections);

// Detrack API jobs
router.get('/jobs', jobController.getDetrackJobs);
router.get('/jobs/:id', jobController.getDetrackJob);
router.get('/job-by-donumber', jobController.getJobByDoNumber);

// Download POD
router.get('/download-pod/:doNumber', jobController.downloadPod);

// Generate POD
router.get('/generate-pod/:doNumber', jobController.generatePod);

// Box scanning routes
router.get('/box-status/:do_number', jobController.getBoxStatus);
router.post('/scan-box', jobController.scanBox);
router.post('/bulk-scan', jobController.bulkScan);

// Dashboard
router.get('/dashboard-stats', jobController.getDashboardStats);

// Groups
router.get('/groups', jobController.getGroups);
router.get('/groups/search-all', jobController.searchAllGroups);

module.exports = router;