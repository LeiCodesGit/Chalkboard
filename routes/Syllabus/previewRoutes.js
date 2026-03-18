import express from 'express';
import Syllabus from '../../models/Syllabus/syllabus.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';
import ProgramEducationalObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationalObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseEvaluationPerCO from '../../models/Syllabus/courseEvaluationPerCO.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

import { generateSyllabusPdf } from '../../controllers/Syllabus/syllabusPdfController.js';

const previewRoutes = express.Router();

previewRoutes.get('/generate-pdf/:syllabusId', generateSyllabusPdf);


previewRoutes.get('/:syllabusId', async (req, res) => {
    try {
        const syllabusId = req.params.syllabusId;
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        
        // Fetch all related data
        const outcomesList = await CourseOutcomes.find({ syllabusID: syllabusId });
        const mappingsList = await CourseMapping.find({ syllabusID: syllabusId });
        const approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        const peosDoc = await ProgramEducationalObjectives.findOne({ syllabusID: syllabusId });
        const sosDoc = await StudentEducationalObjectives.findOne({ syllabusID: syllabusId });
        const schedulesList = await WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 });
        const evaluationsList = await CourseEvaluationPerCO.find({ syllabusID: syllabusId });

        // Convert to plain objects for EJS compatibility
        const mappedOutcomes = outcomesList.map(co => {
            const obj = co.toObject();
            return {
                ...obj,
                statement: (obj.description && obj.description.length > 0) ? obj.description[0] : '',
                thinkingSkills: (obj.thinkingSkills && obj.thinkingSkills.length > 0) ? obj.thinkingSkills[0] : ''
            };
        });

        const mapping = mappingsList.map(m => {
            const obj = m.toObject();
            if (Array.isArray(obj.fromAtoL)) {
                const letters = ['a','b','c','d','e','f','g','h','i','j','k','l'];
                const mapped = {};
                letters.forEach((l, idx) => {
                    mapped[l] = obj.fromAtoL[idx] || '';
                });
                obj.fromAtoL = mapped;
            }
            return obj;
        });
        const schedules = schedulesList.map(s => s.toObject());
        const evaluation = evaluationsList.map(e => e.toObject());
        const peos = peosDoc ? peosDoc.toObject() : { description: [], rating: [] };
        const sos = sosDoc ? sosDoc.toObject() : { description: [], rating: [] };

        res.render('Syllabus/previewSyllabus', { 
            currentPageCategory: "syllabus",
            syllabusId: syllabusId,
            courseCode: syl ? syl.courseCode : '',
            courseTitle: syl ? syl.courseTitle : '',
            syl: syl ? syl.toObject() : {},
            outcomes: mappedOutcomes,
            mapping: mapping,
            peos: peos,
            sos: sos,
            schedules: schedules,
            evaluation: evaluation,
            status: approval ? approval.status : 'Not Submitted'
        });
    } catch (err) {
        console.error("Error fetching syllabus for preview page:", err);
        res.status(500).send("Error loading preview.");
    }
});

export default previewRoutes;
