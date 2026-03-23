import express from 'express';

const infoSyllabusRoutes = express.Router();

import Syllabus from '../../models/Syllabus/syllabus.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';

infoSyllabusRoutes.get('/:syllabusId', async (req, res) => {
    try {
        const syllabusId = req.params.syllabusId;
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        const outcomes = await CourseOutcomes.find({ syllabusID: syllabusId });
        const mapping = await CourseMapping.find({ syllabusID: syllabusId });
        
        res.render('Syllabus/infoSyllabus', { 
            currentPageCategory: "syllabus",
            syllabusId: syllabusId,
            courseCode: syl ? syl.courseCode : '',
            courseTitle: syl ? syl.courseTitle : '',
            syl: syl || {},
            outcomes: outcomes || [],
            mapping: mapping || null
        });
    } catch (err) {
        console.error("Error fetching syllabus for info page:", err);
        res.render('Syllabus/infoSyllabus', { 
            currentPageCategory: "syllabus",
            syllabusId: req.params.syllabusId,
            courseCode: '',
            courseTitle: ''
        });
    }
});

export default infoSyllabusRoutes;