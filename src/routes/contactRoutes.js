// src/routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const contactController = require('../controllers/contactController');

// All routes require authentication
router.use(authenticate);

// ===== CRUD OPERATIONS =====
// Get all contacts
router.get('/contacts', contactController.getContacts);

// Create contact
router.post('/contacts', contactController.createContact);

// Update contact
router.put('/contacts/:id', contactController.updateContact);

// Delete contact
router.delete('/contacts/:id', contactController.deleteContact);

// ===== SEARCH OPERATIONS (Specific routes FIRST) =====
// Search contacts (general search)
router.get('/contacts/search', contactController.searchContacts);

// 👇 CRITICAL: Autocomplete route - Must come BEFORE /contacts/:id
router.get('/contacts/autocomplete', contactController.searchContactsAutocomplete);

// ===== PARAM ROUTES (Generic routes LAST) =====
// Get single contact by ID
router.get('/contacts/:id', contactController.getContact);

// Get contact details by ID (for auto-fill)
router.get('/contacts/:id/details', contactController.getContactById);

// ===== IMPORT/EXPORT =====
// Import contacts from Excel
router.post('/contacts/import', upload.single('file'), contactController.importContacts);

// Export contacts to Excel
router.get('/contacts/export', contactController.exportContacts);

module.exports = router;