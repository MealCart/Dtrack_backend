// src/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const jobController = require('../controllers/jobController');
const collectionController = require('../controllers/collectionController');
const dbJobController = require('../controllers/dbJobController');
// All routes require authentication
router.use(authenticate);

// ===== DATABASE JOBS =====
router.get('/db-jobs', jobController.getJobs);
router.get('/db-jobs/:id', jobController.getJob);

// ===== CREATE JOBS =====
router.post('/create-job', jobController.createJob);
router.post('/upload-manifest', upload.single('file'), jobController.uploadManifest);

// ===== COLLECTION UPLOAD =====
router.post('/upload-collection-manifest', upload.single('file'), collectionController.uploadCollectionManifest);

// ===== DETRACK API JOBS WITH FILTERS & PAGINATION =====
router.get('/detrack-jobs', jobController.getDetrackJobsWithFilters);

// ===== FETCH COLLECTIONS FROM DETRACK =====
router.get('/detrack-collections', jobController.getDetrackCollections);

// ===== DETRACK API JOBS =====
router.get('/jobs', jobController.getDetrackJobs);
router.get('/jobs/:id', jobController.getDetrackJob);
router.get('/job-by-donumber', jobController.getJobByDoNumber);

// ===== DOWNLOAD / GENERATE POD =====
router.get('/download-pod/:doNumber', jobController.downloadPod);
router.get('/generate-pod/:doNumber', jobController.generatePod);

// ===== BOX SCANNING ROUTES =====
router.get('/box-status/:do_number', jobController.getBoxStatus);
router.post('/scan-box', jobController.scanBox);
router.post('/bulk-scan', jobController.bulkScan);

// ===== DASHBOARD =====
router.get('/dashboard-stats', jobController.getDashboardStats);

// ===== GROUPS =====
router.get('/groups', jobController.getGroups);
router.get('/groups/search-all', jobController.searchAllGroups);

// ===== 👇 NEW: CANCEL JOB =====
// Cancel a job (soft delete - updates status to 'cancelled')
router.put('/jobs/:doNumber/cancel', jobController.cancelJob);

// ===== 👇 NEW: UPDATE JOB =====
// Update a job (address, recipient, instructions, etc.)
router.put('/jobs/:doNumber', jobController.updateJob);


router.get('/db-jobs-list', dbJobController.getDbJobs);
router.get('/db-collections-list', dbJobController.getDbCollections);
module.exports = router;