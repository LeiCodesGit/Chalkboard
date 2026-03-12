import { Schema, model } from "mongoose";

const tlaApprovalStatusSchema = new Schema({
  tlaID: { type: Schema.Types.ObjectId, ref: "TLA", required: true },
  approvalDate: Date,
  remarks: String,
  approvedBy: String,
  status: { type: String, enum: ["Approved","Pending","Returned","Not Submitted"], default: "Not Submitted" }
},{ timestamps:true });

const TLAApprovalStatus = model("TLAApprovalStatus", tlaApprovalStatusSchema);
export { tlaApprovalStatusSchema };
export default TLAApprovalStatus;