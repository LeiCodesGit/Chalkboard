import mongoose from 'mongoose';

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
    // 👇 Updated the enum list to match your actual User roles 👇
    approverRole: { 
        type: String, 
        enum: ['Program-Chair', 'Practicum-Coordinator', 'Dean', 'VPAA', 'HRMO'] 
    },
    approvalStatus: { type: String, enum: ['ENDORSED', 'VALIDATED', 'APPROVED', 'NOTED', 'RETURNED'] },
    remarks: String, 
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
    employmentType: String,
    address: String,
    
    // Form Metadata
    term: { type: String, default: "2nd Term 2025-2026" },
    academicYear: { type: String, default: "2025-2026" },
    status: { type: String, default: 'DRAFT' },
    
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

const ATAForm = mongoose.model('ATAForm', ataFormSchema);
export default ATAForm;