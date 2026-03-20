import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';

// ==========================================
// 1. EMBEDDED SUBDOCUMENTS (Mapping to the PDF Sections)
// ==========================================
const sectionB_Schema = new mongoose.Schema({
    courseCode: String,
    section: String,
    units: Number,
    effectiveDate: String
});

const sectionC_Schema = new mongoose.Schema({
    courseCode: String,
    section: String,
    units: Number,
    effectiveDate: String
});

const sectionD_Schema = new mongoose.Schema({
    workDescription: String,
    units: Number,
    effectiveDate: String
});

const sectionE_Schema = new mongoose.Schema({
    courseCode: String,
    numberOfStudents: Number,
    coordinator: String
});

const sectionF_Schema = new mongoose.Schema({
    employer: String,
    position: String,
    courseOrUnits: String,
    hoursPerWeek: Number
});

const sectionG_Schema = new mongoose.Schema({
    courseId: String,
    moduleCode: String,
    section: String,
    units: Number,
    numberOfStudents: Number,
    type: { 
        type: String, 
        enum: ['lecture', 'lab'], 
        required: true 
    }
});

// Handles State Machine Audit Trail
const approvalHistorySchema = new mongoose.Schema({
    approverRole: { 
        type: String, 
        // 👇 FIXED: Added 'HR' so the database accepts Vince's signature!
        enum: ['Professor','Program-Chair', 'Practicum-Coordinator', 'Dean', 'VPAA', 'HR', 'HRMO'] 
    },
    approverName: { type: String }, 
    approvalStatus: { type: String, enum: ['RESUBMITTED','ENDORSED', 'VALIDATED', 'APPROVED', 'NOTED', 'RETURNED', 'FINALIZED', 'ARCHIVED'] },
    remarks: String, 
    signatureImage: String,
    date: { type: Date, default: Date.now } 
});

// ==========================================
// 2. MAIN ATA FORM SCHEMA
// ==========================================
const ataFormSchema = new mongoose.Schema({
    userID: { type: String, required: true },
    
    // Personal Details
    facultyName: String,
    position: String,
    college: String,
    employmentStatus: String,
    employmentType: String,
    address: String,
    facultySignature: String,
    
    // Form Metadata
    term: { type: String, default: "2nd Term 2025-2026" },
    academicYear: { type: String, default: "2025-2026" },
    
    // 👇 FIXED: Strictly defined the allowed statuses, including 'PENDING_HR'
    status: { 
        type: String, 
        enum: ['DRAFT', 'PENDING_CHAIR', 'PENDING_PRACTICUM', 'PENDING_DEAN', 'PENDING_VPAA', 'PENDING_HR', 'FINALIZED', 'RETURNED', 'ARCHIVED'],
        default: 'DRAFT' 
    },
    
    // Math Engine Totals
    totalTeachingUnits: { type: Number, default: 0 },
    totalEffectiveUnits: { type: Number, default: 0 },
    totalRemedialUnits: { type: Number, default: 0 },

    // THE EXACT FORM SECTIONS
    sectionA_AdminUnits: { type: Number, default: 0 },
    sectionB_WithinCollege: [sectionB_Schema],
    sectionC_OtherCollege: [sectionC_Schema],
    sectionD_AdminWork: [sectionD_Schema],
    sectionE_Practicum: [sectionE_Schema],
    sectionF_OutsideEmployment: [sectionF_Schema],
    sectionG_Remedial: [sectionG_Schema],
    
    approvalHistory: [approvalHistorySchema]            

}, { timestamps: true });

const ATAForm = mainDB.model('ATAForm', ataFormSchema);
export default ATAForm;