import express from 'express';
import { submitATA, approveATA, getPendingApprovals, 
  viewATAForm, viewAtaPdf, renderNewATA, getAdminHistory, previewAtaPdf, 
  discoverPdfFields, saveVipSignature, previewVipSignaturePdf, 
  getArchivedATAs } from '../../controllers/ataController.js';
import { requireAuth, checkRole } from '../../middleware/ata_authMiddleware.js';


const router = express.Router();
// ==========================================
// 🛣️ 1. FACULTY ROUTES
// ==========================================
const submitRoles = ['Professor', 'Program-Chair', 'Practicum-Coordinator', 'Dean'];
router.post('/submit', requireAuth, checkRole(...submitRoles), submitATA);
router.post('/preview-pdf', requireAuth, previewAtaPdf);
// ==========================================
// 🛣️ 2. ADMIN ROUTES
// ==========================================
// We added 'Practicum-Coordinator' to the list so the Middleware knows to check for the flag!
const adminRoles = ['Program-Chair', 'Practicum-Coordinator', 'Dean', 'VPAA', 'HRMO', 'HR'];

// Admin Approvals / Returns
router.put('/approve/:id', requireAuth, checkRole(...adminRoles), approveATA);

// The Inbox Route
router.get('/pending', requireAuth, checkRole(...adminRoles), getPendingApprovals);

// Read-only view for the admin
router.get('/view/:id', requireAuth, checkRole(...adminRoles), viewATAForm);
// Admin History (Archive)
router.get('/admin-history', requireAuth, checkRole(...adminRoles), getAdminHistory);

//testing route for PDF generation
router.get('/pdf/:id', requireAuth, viewAtaPdf);
// When they click "Start New ATA Form", run the new function!
router.get('/new', requireAuth, renderNewATA);

// Archived ATAs (HR Only)
router.get('/archived-atas', requireAuth, checkRole('HR', 'HRMO'), getArchivedATAs);

router.get('/pdf-xray', discoverPdfFields);

router.post('/settings/signature', requireAuth, saveVipSignature);
router.post('/preview-vip-signature', requireAuth, previewVipSignaturePdf);
export default router;