import express from 'express';
import multer from 'multer';
import Syllabus from '../../models/Syllabus/syllabus.js';

const newSyllabusRoutes = express.Router();

// Multer configuration for image handling
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * GET: Render the "Add New Syllabus" page
 */
newSyllabusRoutes.get('/', (req, res) => {
    // Passes the category so the sidebar highlights "Syllabus"
    res.render('Syllabus/newSyllabus', {
        currentPageCategory: "syllabus",
        userId: req.query.userId || "507f1f77bcf86cd799439011" // Temporary ID for testing
    });
});

/**
 * POST: Save the new syllabus to MongoDB
 */
newSyllabusRoutes.post('/add', upload.single('courseImage'), async (req, res) => {
    try {
        const { courseCode, courseTitle, userId } = req.body;

        const syllabusData = {
            userID: userId,
            courseCode,
            courseTitle
        };

        // If an image was uploaded, convert it to base64 for MongoDB
        if (req.file) {
            const base64 = req.file.buffer.toString('base64');
            syllabusData.courseImage = `data:${req.file.mimetype};base64,${base64}`;
        }

        const newSyllabus = new Syllabus(syllabusData);
        await newSyllabus.save();

        // Redirect back to the dashboard after saving
        res.redirect(`/syllabus/${userId}`);
    } catch (error) {
        console.error("Error saving syllabus:", error);
        res.status(500).send("Server Error: Could not save course.");
    }
});

export default newSyllabusRoutes;