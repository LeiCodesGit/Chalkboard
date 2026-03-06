import mongoose, { Schema, model } from "mongoose";

const courseSchema = new Schema(
  {
    twsID: { type: Schema.Types.ObjectId, ref: "TWS", required: true },

    courseCode: { type: String, default: "" },
    courseTitle: { type: String, default: "" },

    section: { type: String, default: "" },
    isLecture: { type: Boolean, default: true },

    lectureHours: { type: String, default: "" },
    labHours: { type: String, default: "" },
    units: { type: Number, default: 0 },

    designatedRoom: { type: String, default: "" },
    time: { type: String, default: "" },
    day: { type: String, default: "" },

    timeSlot: { type: String, default: "" },
    sectionRoom: { type: String, default: "" },

    department: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

const Course = mongoose.models.Course || model("Course", courseSchema);
export default Course;