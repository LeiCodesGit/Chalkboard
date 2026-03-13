import express from 'express';
import Syllabus from '../../models/Syllabus/syllabus.js';

const deanApprovalRouter = express.Router();

/* -----------------------------------------------------------------------
   GET /syllabus/dean/approve/:syllabusId  →  Dean Approval Detail Page
   ----------------------------------------------------------------------- */
deanApprovalRouter.get('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');

        if (syl) {
            return res.render('Syllabus/syllabusApprovalDean', {
                courseName: syl.courseTitle || 'Course Name',
                courseCode: syl.courseCode || 'Course Code',
                courseSection: syl.section || 'Course Section',
                academicYear: syl.academicYear || 'Academic Year',
                fileType: 'Syllabus Draft',
                syllabusId,
                currentPageCategory: 'syllabus'
            });
        }
    } catch (err) {
        console.error('Dean approval detail error:', err);
    }

    // Fallback dummy data
    res.render('Syllabus/syllabusApprovalDean', {
        courseName: '[COURSE NAME]',
        courseCode: '[COURSE CODE]',
        courseSection: '[COURSE SECTION]',
        academicYear: '[ACADEMIC YEAR]',
        fileType: 'Syllabus Draft',
        syllabusId,
        currentPageCategory: 'syllabus'
    });
});

/* -----------------------------------------------------------------------
   POST /syllabus/dean/approve/:syllabusId  →  Save Draft or Submit Approval
   ----------------------------------------------------------------------- */
deanApprovalRouter.post('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action } = req.body;

    try {
        // TODO: Update SyllabusApprovalStatus in DB
        console.log(`Dean Approval [${action}] syllabusId=${syllabusId} status=${status} comment=${comment}`);
        res.json({ success: true, message: `Approval ${action} saved.` });
    } catch (err) {
        console.error('Dean approval action error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

export default deanApprovalRouter;
