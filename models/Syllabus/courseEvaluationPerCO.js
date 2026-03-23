import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const courseEvaluationPerCOSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  coNumber: String,
  moduleCode: String,
  onlineTaskWeight: Number,
  longExaminationWeight: Number,
  finalProjectWeight: Number,
  moduleWeight: Number,
  finalWeight: Number
});

const CourseEvaluationPerCO = mainDB.models.CourseEvaluationPerCO || mainDB.model("CourseEvaluationPerCO", courseEvaluationPerCOSchema);
export default CourseEvaluationPerCO;