import mongoose from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const { Schema } = mongoose;

const syllabusSchema = new Schema({
  userID: { type: Schema.Types.ObjectId, ref: "User", required: true },
  courseCode: String,
  courseTitle: String,
  assignedInstructor: { type: Schema.Types.ObjectId, ref: "User" },
  preRequisite: String,
  coRequisite: String,
  units: Number,
  classSchedule: Number,
  courseDesign: String,
  courseDescription: String,
  term: String,
  schoolYear: String,
  programPreparedFor: String,
  textbook: String,
  references: String,
  pdf: Buffer,
  courseImage: String
}, { timestamps: true });

const Syllabus = mainDB.models.Syllabus || mainDB.model("Syllabus", syllabusSchema);

export default Syllabus;
