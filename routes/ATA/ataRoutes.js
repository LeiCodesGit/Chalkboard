import express from 'express';
import { submitATA, approveATA, getPendingApprovals, viewATAForm, viewAtaPdf } from '../../controllers/ataController.js';
import { requireAuth, checkRole } from '../../middleware/ata_authMiddleware.js';

const router = express.Router();
// ==========================================
// 🛣️ 1. FACULTY ROUTES
// ==========================================
const submitRoles = ['Professor', 'Program-Chair', 'Practicum-Coordinator', 'Dean'];
router.post('/submit', requireAuth, checkRole(...submitRoles), submitATA);
// ==========================================
// 🛣️ 2. ADMIN ROUTES
// ==========================================
// 'Professor' is included here ONLY because Bastasa made the Practicum Coordinator a Professor with a boolean flag.
const adminRoles = ['Program-Chair', 'Dean', 'VPAA', 'HRMO'];

// Admin Approvals / Returns
router.put('/approve/:id', requireAuth, checkRole(...adminRoles), approveATA);

// The Inbox Route
router.get('/pending', requireAuth, checkRole(...adminRoles), getPendingApprovals);

// Read-only view for the admin
router.get('/view/:id', requireAuth, checkRole(...adminRoles), viewATAForm);

//testing route for PDF generation
router.get('/pdf/:id', requireAuth, viewAtaPdf);

export default router;