// ==========================================
// 📦 MODEL: ArchivedATA.js
// Stores finalized ATA forms as PDF bytes in MongoDB
// ==========================================
import mongoose from 'mongoose';

const ArchivedATASchema = new mongoose.Schema({
    // Reference back to the original ATAForm
    originalFormId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ATAForm',
        required: true,
        unique: true // One archive entry per form
    },

    // Faculty info (denormalized for fast HR queries without populate)
    facultyName:    { type: String, required: true },
    facultyId:      { type: String, required: true }, // userID from ATAForm
    college:        { type: String, default: '' },
    program:        { type: String, default: '' },
    position:       { type: String, default: '' },
    employmentType: { type: String, default: 'Full-Time' },

    // Term info
    term:           { type: String, default: '' },
    academicYear:   { type: String, default: '' },

    // The PDF stored as raw binary (Buffer) — retrieved as bytes
    pdfData: {
        type: Buffer,
        required: true
    },

    // MIME type for serving — always application/pdf
    contentType: {
        type: String,
        default: 'application/pdf'
    },

    // Audit
    archivedBy:     { type: String, default: 'HR' }, // name of HR who archived it
    archivedById:   { type: String, default: '' },   // userID of the HR officer
    archivedAt:     { type: Date, default: Date.now }

}, { timestamps: true });

// Index for fast HR queries
ArchivedATASchema.index({ facultyName: 1 });
ArchivedATASchema.index({ academicYear: 1 });
ArchivedATASchema.index({ archivedAt: -1 });

const ArchivedATA = mongoose.model('ArchivedATA', ArchivedATASchema);
export default ArchivedATA;