import { Schema } from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js";

const weeklyScheduleSchema = new Schema({
  syllabusID: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
  week: Number,
  outcomeCo: Number,
  outcomeMo: String,
  outcomeIlo: String,
  coverageDay: Number,
  coverageTopic: String,
  tlaMode: String,
  tlaActivities: String,
  assessmentTaskMode: String,
  assessmentTaskTask: String,
  referenceNum: String,
  dateCovered: String,
  assessmentDates: String
});

const WeeklySchedule = mainDB.models.WeeklySchedule || mainDB.model("WeeklySchedule", weeklyScheduleSchema);
export default WeeklySchedule;