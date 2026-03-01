import express from 'express';
import { submitATA, approveATA, getPendingApprovals, viewATAForm } from '../controllers/ataController.js'; 
import { requireAuth, checkRole } from '../middleware/authMiddleware.js'; // 🚨 NEW: Imported checkRole!

const router = express.Router();

// ==========================================
// 🛣️ 1. FACULTY ROUTES
// ==========================================
// Only regular Professors can submit forms
router.post('/submit', requireAuth, checkRole('Professor'), submitATA);

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

export default router;