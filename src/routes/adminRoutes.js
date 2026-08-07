// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// ===== USER MANAGEMENT =====
// Get users
router.get('/users', adminController.getUsers);
router.get('/users/customers', adminController.getCustomers);
router.get('/users/staff', adminController.getStaff);
router.get('/users/:userId', adminController.getUserById);

// Create users
router.post('/users', adminController.createUser);
router.post('/users/customer', adminController.createCustomer);

// Update users
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId/role', adminController.updateUserRole);

// Delete users
router.delete('/users/:userId', adminController.deleteUser);

// Bulk operations
router.post('/users/bulk/status', adminController.bulkUpdateStatus);
router.post('/users/bulk/delete', adminController.bulkDeleteUsers);

// ===== GROUP CUSTOMER MANAGEMENT =====
// Check if group has customer
router.get('/groups/:groupId/customer', adminController.checkGroupCustomer);
router.get('/groups/:groupId/customer/details', adminController.getCustomerByGroup);

// ===== STATISTICS =====
router.get('/stats/customers', adminController.getCustomerStats);
router.get('/stats/staff', adminController.getStaffStats);

// ===== GROUP WITH CUSTOMER STATUS (Future) =====
router.get('/groups/with-customer-status', adminController.getGroupsWithCustomerStatus);

module.exports = router;
