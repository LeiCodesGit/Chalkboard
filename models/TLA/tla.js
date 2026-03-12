import { Schema, model } from "mongoose";

const tlaSchema = new Schema({
  courseCode: String,
  userID: { type: Schema.Types.ObjectId, ref: "User", required: true },
  section: String,
  dateofDigitalDay: String,
  facultyFacilitating: String,
  courseOutcomes: String,
  mediatingOutcomes: String,
  status: { type: String, enum: ["Draft", "Pending", "Approved", "Returned", "Archived"], default: "Draft" },
  weekNumber: Number,
  pdf: Buffer
},{ timestamps:true });

const TLA = model("TLA", tlaSchema);
export { tlaSchema };
export default TLA;