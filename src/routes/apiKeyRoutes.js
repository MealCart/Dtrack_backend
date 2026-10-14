// src/routes/apiKeyRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const apiKeyController = require('../controllers/apiKeyController');

// Admin-only: JWT + role check
router.use(authenticate);
router.use(authorize('admin'));

// CRUD
router.get('/api-keys', apiKeyController.listKeys);
router.post('/api-keys', apiKeyController.createKey);
router.patch('/api-keys/:id/revoke', apiKeyController.revokeKey);
router.delete('/api-keys/:id', apiKeyController.deleteKey);

module.exports = router;