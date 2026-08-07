// src/routes/labelRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { uploadLabel } = require('../middleware/upload');
const labelController = require('../controllers/labelController');

// All routes require authentication
router.use(authenticate);

// Label generation
router.post('/generate-labels', labelController.generateLabels);
router.post('/generate-and-download-labels', labelController.generateAndDownloadLabels);

// Label download
router.get('/download-labels/:filename', labelController.downloadLabels);

// Label management
router.get('/labels/:doNumber', labelController.getLabels);
router.post('/upload-label', uploadLabel.single('label'), labelController.uploadLabel);
router.delete('/labels/:id', labelController.deleteLabel);

module.exports = router;