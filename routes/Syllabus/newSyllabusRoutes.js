import express from 'express';
import multer from 'multer';
import Syllabus from '../../models/Syllabus/syllabus.js';
import ProgramEducationalObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationalObjectives from '../../models/Syllabus/studentEducationalObjectives.js';

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
newSyllabusRoutes.get('/:syllabusId', async (req, res) => {
    try {
        const syllabusId = req.params.syllabusId;
        console.log(`DEBUG: Reached newSyllabusRoutes GET /:syllabusId with ID: ${syllabusId}`);
        
        const peos = await ProgramEducationalObjectives.findOne({ syllabusID: syllabusId });
        const sos = await StudentEducationalObjectives.findOne({ syllabusID: syllabusId });

        res.render('Syllabus/newSyllabus', {
            currentPageCategory: "syllabus",
            syllabusId: syllabusId,
            peos: peos || null,
            sos: sos || null
        });
    } catch (err) {
        console.error("Error fetching PEOs/SOs:", err);
        res.render('Syllabus/newSyllabus', {
            currentPageCategory: "syllabus",
            syllabusId: req.params.syllabusId,
            peos: null,
            sos: null
        });
    }
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