import express from 'express';
import {
    requireLogin,
    requireApprovalRole,
    getApprovalPage,
    postApprovalAction,
    previewApprovalTlaPdf
} from '../../controllers/tlaController.js';

const approvalRoutes = express.Router();

// GET  /tla/approval       — render with static/placeholder data (for UI preview)
approvalRoutes.get('/', requireLogin, requireApprovalRole, getApprovalPage);

// GET  /tla/approval/:id   — render the approval review page for a specific TLA
approvalRoutes.get('/:id', requireLogin, requireApprovalRole, getApprovalPage);

// POST /tla/approval/:id   — save draft or submit verdict
approvalRoutes.post('/:id', requireLogin, requireApprovalRole, postApprovalAction);

// POST /tla/approval/:id/preview-pdf — preview PDF with current unsaved signature upload
approvalRoutes.post('/:id/preview-pdf', requireLogin, requireApprovalRole, previewApprovalTlaPdf);

export default approvalRoutes;
