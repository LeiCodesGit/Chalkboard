import mongoose, { Schema, model } from "mongoose";

const twsApprovalStatusSchema = new Schema(
  {
    twsID: { type: Schema.Types.ObjectId, ref: "TWS", required: true },
    approvalDate: { type: Date, default: null },
    remarks: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Approved", "Pending", "Rejected", "Returned", "Not Submitted"],
      default: "Not Submitted",
    },
  },
  { timestamps: true }
);

twsApprovalStatusSchema.index({ twsID: 1 }, { unique: true });

const TWSApprovalStatus =
  mongoose.models.TWSApprovalStatus || model("TWSApprovalStatus", twsApprovalStatusSchema);

export default TWSApprovalStatus;