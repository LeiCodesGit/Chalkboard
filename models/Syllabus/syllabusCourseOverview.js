import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const syllabusSchema = new Schema({
  userID: {
    type: Schema.Types.ObjectId,
    ref: "User", 
    required: true
  },
  courseCode: {
    type: String,
    required: true 
  },
  courseTitle: {
    type: String,
    required: true 
  },
  assignedInstructor: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  courseImage: {
    type: String,
    default: null 
  }
}, { timestamps: true });

const Syllabus = models.Syllabus || model("Syllabus", syllabusSchema);

export default Syllabus;