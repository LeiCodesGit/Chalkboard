import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const programEducationalObjectivesSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  description: [String],
  rating: [String]
});

const ProgramEducationalObjectives = mainDB.models.ProgramEducationalObjectives || mainDB.model("ProgramEducationalObjectives", programEducationalObjectivesSchema);
export default ProgramEducationalObjectives;