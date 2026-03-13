import mongoose from 'mongoose';

// 1. Define the "Sub-Schema" for individual courses
const singleCourseSchema = new mongoose.Schema({
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    units: { type: Number, required: true },
    isRemedial: { type: Boolean, default: false }
}, { _id: false }); // _id: false stops Mongoose from adding a unique ID for every single subject, keeping it clean.

// 2. Define the Main Schema (The Term/Program container)
const curriculumSchema = new mongoose.Schema({
    program: { type: String, required: true },     // e.g., "BS CpE"
    term: { type: String, required: true },        // e.g., "1st Year - 1st Sem"
    
    // THIS IS THE KEY CHANGE: An array of the sub-schema above
    courses: [singleCourseSchema]                  
});

// We'll still call the model 'Course' to keep your imports working, 
// but it now represents a whole Term Curriculum.
const Course = mongoose.model('Course', curriculumSchema, 'ata_courses');
export default Course;