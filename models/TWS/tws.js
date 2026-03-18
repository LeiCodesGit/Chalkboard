import mongoose, { Schema, model } from "mongoose";

const facultySchema = new Schema(
  {
    name: { type: String, default: "" },
    empId: { type: String, default: "" },
    email: { type: String, default: "" },
    dept: { type: String, default: "" },
    program: { type: String, default: "" },
    acadYear: { type: String, default: "" },
    term: { type: String, default: "" },
    empStatus: { type: String, default: "" },
  },
  { _id: false }
);

const loadRowSchema = new Schema(
  {
    courseCode: { type: String, default: "" },
    courseTitle: { type: String, default: "" },
    units: { type: Number, default: 0 },
    lec: { type: Number, default: 0 },
    lab: { type: Number, default: 0 },
    sections: { type: Number, default: 1 },
  },
  { _id: false }
);

const totalsSchema = new Schema(
  {
    totalUnits: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },
    equivLoad: { type: Number, default: 0 },
  },
  { _id: false }
);

const twsSchema = new Schema(
  {
    userID: { type: Schema.Types.ObjectId, ref: "User", required: true },

    createdByRole: {
      type: String,
      enum: ["Program-Chair", "Dean"],
      required: true,
    },

    faculty: {
      type: facultySchema,
      default: () => ({}),
    },

    assignedFacultyId: { type: String, default: "" },
    assignedFacultyEmail: { type: String, default: "" },
    assignedFacultyName: { type: String, default: "" },

    facultySigned: { type: Boolean, default: false },
    facultySignedAt: { type: Date, default: null },
    facultySignatureImage: { type: String, default: "" },
    facultySignerName: { type: String, default: "" },
    facultySignerEmpId: { type: String, default: "" },
    facultySignerEmail: { type: String, default: "" },

    programChairSigned: { type: Boolean, default: false },
    programChairSignedAt: { type: Date, default: null },
    programChairSignatureImage: { type: String, default: "" },
    programChairSignerName: { type: String, default: "" },
    programChairSignerEmpId: { type: String, default: "" },
    programChairSignerEmail: { type: String, default: "" },

    deanSigned: { type: Boolean, default: false },
    deanSignedAt: { type: Date, default: null },
    deanSignatureImage: { type: String, default: "" },
    deanSignerName: { type: String, default: "" },
    deanSignerEmpId: { type: String, default: "" },
    deanSignerEmail: { type: String, default: "" },

    status: {
      type: String,
      enum: [
        "Draft",
        "Sent to Faculty",
        "Sent to Dean",
        "Approved",
        "Rejected",
        "Returned to Program Chair",
        "Archived",
      ],
      default: "Draft",
    },

    archived: {
      type: Boolean,
      default: false,
    },

    sentToFacultyAt: { type: Date, default: null },
    sentToDeanAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    loads: {
      type: [loadRowSchema],
      default: [],
    },

    totals: {
      type: totalsSchema,
      default: () => ({ totalUnits: 0, totalHours: 0, equivLoad: 0 }),
    },

    term: { type: String, default: "" },
    schoolYear: { type: String, default: "" },

    teachingHours: { type: Number, default: 0 },
    advisingHours: { type: Number, default: 0 },
    consultationHours: { type: Number, default: 0 },
    committeeWorks: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },

    academicUnits: { type: Number, default: 0 },
    peUnits: { type: Number, default: 0 },
    nstpUnits: { type: Number, default: 0 },
    deloadingUnits: { type: Number, default: 0 },
    totalUnits: { type: Number, default: 0 },

    immediateHead: { type: String, default: "" },
    pdf: { type: Buffer },
  },
  { timestamps: true }
);

const TWS = mongoose.models.TWS || model("TWS", twsSchema);
export default TWS;
