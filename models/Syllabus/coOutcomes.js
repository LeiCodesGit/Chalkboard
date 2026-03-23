import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const coOutcomesSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  tlaID: { type: Schema.Types.ObjectId, ref: "TLA" },
  coNumber: String,
  mediatingOutcome: String,
  intendedLearningOutcomes: [String]
});

const COOutcomes = mainDB.models.COOutcomes || mainDB.model("COOutcomes", coOutcomesSchema);
export default COOutcomes;