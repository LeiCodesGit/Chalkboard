import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const courseOutcomesSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  tlaID: { type: Schema.Types.ObjectId, ref: "TLA" },
  coNumber: String,
  description: [String],
  thinkingSkills: [String],
  assessmentTasks: String,
  minSatisfactoryPerf: Number
});

const CourseOutcomes = mainDB.models.CourseOutcomes || mainDB.model("CourseOutcomes", courseOutcomesSchema);
export default CourseOutcomes;