import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const studentEducationalObjectivesSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  description: [String],
  rating: [String]
});

const StudentEducationalObjectives = mainDB.models.StudentEducationalObjectives || mainDB.model("StudentEducationalObjectives", studentEducationalObjectivesSchema);
export default StudentEducationalObjectives;