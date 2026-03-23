import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const courseMappingSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  numberOfCO: Number,
  program: String,
  conceptMap: Buffer,
  fromAtoL: [String]
});

const CourseMapping = mainDB.models.CourseMapping || mainDB.model("CourseMapping", courseMappingSchema);
export default CourseMapping;