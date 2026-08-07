// src/routes/collectionRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const collectionController = require('../controllers/collectionController');

// All routes require authentication
router.use(authenticate);

// ===== COLLECTION ROUTES =====

// Get collections
router.get('/collections', collectionController.getCollections);
router.get('/collections/:id', collectionController.getCollection);
router.get('/collection-by-donumber', collectionController.getCollectionByDoNumber);
router.get('/collections/group/:groupId', collectionController.getCollectionsByGroup);
router.get('/collections/recent', collectionController.getRecentCollections);
router.get('/collections/today', collectionController.getTodayCollections);

// Create collections
router.post('/create-collection', collectionController.createCollection);
router.post('/collections/bulk', collectionController.bulkCreateCollections);

// Update collection
router.patch('/collections/:do_number/status', collectionController.updateCollectionStatus);

// Delete collection
router.delete('/collections/:do_number', collectionController.deleteCollection);

// Stats
router.get('/collections-stats', collectionController.getCollectionStats);

module.exports = router;