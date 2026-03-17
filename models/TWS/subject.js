import mongoose, { Schema, model } from "mongoose";

const subjectSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    units: {
      type: Number,
      required: true,
      min: 0,
    },
    department: {
      type: String,
      default: "",
      trim: true,
    },
    program: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

subjectSchema.index({ code: 1 }, { unique: true });

const Subject = mongoose.models.Subject || model("Subject", subjectSchema);
export default Subject;