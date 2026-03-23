import mongoose from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const { Schema } = mongoose;

const syllabusApprovalStatusSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  status: { 
    type: String, 
    enum: ["Approved", "Pending", "Not Submitted", "Archived", "Endorsed", "Returned to PC", "Rejected", "Returned to Dean"], 
    default: "Not Submitted" 
  },
  approvalDate: Date,
  remarks: String,        // legacy – kept for backwards compatibility
  PC_Remarks: String,     // comment left by Program Chair on endorsement
  Dean_Remarks: String,   // comment left by Dean on approval
  HR_Remarks: String,     // comment left by HR on verification
  approvedBy: String,
  
  // Signature Fields
  PC_Signature: String, // Base64 or URL
  PC_SignatoryName: String,
  Dean_Signature: String, // Base64 or URL
  Dean_SignatoryName: String,

  archivedBy: String,
  archivedDate: Date,

  // HR Signature Fields
  HR_Signature: String,
  HR_SignatoryName: String,

  // Faculty / Course Coordinator Signature Fields
  Faculty_Signature: String,
  Faculty_SignatoryName: String
}, { timestamps: true });

const SyllabusApprovalStatus = mainDB.models.SyllabusApprovalStatus || mainDB.model("SyllabusApprovalStatus", syllabusApprovalStatusSchema);
export default SyllabusApprovalStatus;