import mongoose from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const { Schema } = mongoose;

const syllabusApprovalStatusSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  status: { type: String, enum: ["Approved", "Pending", "Not Submitted", "Archived"], default: "Not Submitted" },
  approvalDate: Date,
  remarks: String,
  approvedBy: String,
  archivedBy: String,
  archivedDate: Date
}, { timestamps: true });

const SyllabusApprovalStatus = mainDB.models.SyllabusApprovalStatus || mainDB.model("SyllabusApprovalStatus", syllabusApprovalStatusSchema);
export default SyllabusApprovalStatus;