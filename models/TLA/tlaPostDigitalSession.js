import { Schema, model } from "mongoose";

const postDigitalSessionSchema = new Schema({
  tlaID: { type: Schema.Types.ObjectId, ref: "TLA", required: true },
  moIloCode: String,
  participantTurnout: String,
  assessmentResults: String,
  remarks: String
},{ timestamps:true });

const PostDigitalSession = model("PostDigitalSession", postDigitalSessionSchema);
export { postDigitalSessionSchema };
export default PostDigitalSession;