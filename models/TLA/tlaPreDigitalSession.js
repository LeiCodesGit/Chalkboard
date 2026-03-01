import { Schema, model } from "mongoose";

const preDigitalSessionSchema = new Schema({
  tlaID: { type: Schema.Types.ObjectId, ref: "TLA", required: true },
  moIloCode: String,
  teacherLearningActivity: String,
  lmsDigitalTool: String,
  assessment: String
},{ timestamps:true });

const PreDigitalSession = model("PreDigitalSession", preDigitalSessionSchema);
export { preDigitalSessionSchema };
export default PreDigitalSession;