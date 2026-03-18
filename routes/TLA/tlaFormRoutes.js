import express from "express";
import {
    requireLogin,
    getNewForm,
    getFormById,
    createTLA,
    updateTLA,
    generateDocx,
    discoverTlaPdfFields,
    previewTlaPdf,
    viewTlaPdf,
    viewTlaPdfApproval,
    uploadSignature,
    uploadSignatureFile,
    signatureUpload
} from "../../controllers/tlaController.js";

const formRoutes = express.Router();

// GET /tla/form        – blank new form
formRoutes.get("/", requireLogin, getNewForm);

// GET /tla/form/:id   – existing TLA pre-filled
formRoutes.get("/:id", requireLogin, getFormById);

// POST /tla/form      – create new TLA
formRoutes.post("/", requireLogin, createTLA);

// POST /tla/form/generate-docx – fill .docx template and send as download
formRoutes.post("/generate-docx", requireLogin, generateDocx);

// POST /tla/form/preview-pdf – render current form input to inline PDF preview
formRoutes.post('/preview-pdf', requireLogin, previewTlaPdf);

// GET /tla/form/pdf/:id – view saved TLA record as inline PDF
formRoutes.get('/pdf/:id', requireLogin, viewTlaPdf);

// GET /tla/form/pdf-approval/:id – view saved TLA record as inline PDF for approval roles
formRoutes.get('/pdf-approval/:id', requireLogin, viewTlaPdfApproval);

// GET /tla/form/pdf-xray – visualize all form field names in the TLA PDF template
formRoutes.get('/pdf-xray', requireLogin, discoverTlaPdfFields);

// POST /tla/form/:id/signature – upload professor PNG signature (base64 JSON)
formRoutes.post('/:id/signature', requireLogin, uploadSignature);

// POST /tla/form/:id/signature-file – upload professor PNG signature (multipart file)
formRoutes.post('/:id/signature-file', requireLogin, signatureUpload.single('signatureFile'), uploadSignatureFile);

// POST /tla/form/:id  – update existing TLA
formRoutes.post("/:id", requireLogin, updateTLA);

export default formRoutes;