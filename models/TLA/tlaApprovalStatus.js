import { Schema, model } from "mongoose";

// ─── Sub-schema for a single approval step ───────────────────────────────────
const stepSchema = new Schema({
    status:       { type: String, enum: ["Pending", "Approved", "Returned", "Archived"], default: "Pending" },
    approvedBy:   { type: String, default: "" },
    approvalDate: { type: Date },
    remarks:      { type: String, default: "" },
    signatureImage:{ type: String, default: "" }
}, { _id: false });

// ─── Main approval status document ───────────────────────────────────────────
// Tracks the full organizational approval chain for one TLA:
//   Professor → Program-Chair → Dean → HR/HRMO → VPAA (final)
const tlaApprovalStatusSchema = new Schema({
    tlaID: { type: Schema.Types.ObjectId, ref: "TLA", required: true },

    // ── Macro status (for fast querying / badge display) ─────────────────────
    // Progresses forward as each step is approved.
    // Returning at any step resets to "Returned".
    status: {
        type: String,
        enum: [
            "Not Submitted",        // Faculty has not yet submitted
            "Pending",              // Submitted by faculty, awaiting Program-Chair
            "Chair-Approved",       // Program Chair endorsed, awaiting Dean
            "Dean-Approved",        // Dean approved, awaiting HR/HRMO
            "Post-Pending",         // Post-digital submitted by faculty, awaiting Program-Chair (post)
            "Post-Chair-Approved",  // Post Program-Chair endorsed, awaiting Dean (post)
            "Post-Dean-Approved",   // Post Dean approved, awaiting HR/HRMO
            "HR-Approved",          // HR/HRMO approved, awaiting VPAA
            "Approved",             // VPAA final approval — fully complete
            "Returned"              // Returned to faculty at any step
        ],
        default: "Not Submitted"
    },

    // ── Per-step tracking ─────────────────────────────────────────────────────
    programChair:         { type: stepSchema, default: () => ({}) },
    dean:                 { type: stepSchema, default: () => ({}) },
    programChairPost:     { type: stepSchema, default: () => ({}) },
    deanPost:             { type: stepSchema, default: () => ({}) },
    hr:                   { type: stepSchema, default: () => ({}) },
    vpaa:                 { type: stepSchema, default: () => ({}) },

    // ── Legacy flat fields (kept for backward-compatibility) ─────────────────
    approvalDate: Date,
    remarks:      String,
    approvedBy:   String
}, { timestamps: true });

const TLAApprovalStatus = model("TLAApprovalStatus", tlaApprovalStatusSchema);
export { tlaApprovalStatusSchema };
export default TLAApprovalStatus;