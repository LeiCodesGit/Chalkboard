import express from 'express';
import Syllabus from '../../models/Syllabus/syllabus.js';

const reviewSyllabusRouter = express.Router();

// GET /syllabus/tech-assistant/review/:syllabusId — render review detail page
reviewSyllabusRouter.get('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');

        if (syl) {
            return res.render('Syllabus/reviewSyllabus', {
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
        console.error('TA review detail error:', err);
    }

    // Fallback dummy data
    res.render('Syllabus/reviewSyllabus', {
        courseName: '[COURSE NAME]',
        courseCode: '[COURSE CODE]',
        courseSection: '[COURSE SECTION]',
        academicYear: '[ACADEMIC YEAR]',
        fileType: 'Syllabus Draft',
        syllabusId,
        currentPageCategory: 'syllabus'
    });
});

// POST /syllabus/tech-assistant/review/:syllabusId — save draft or submit verdict
reviewSyllabusRouter.post('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action } = req.body;

    try {
        // TODO: Update SyllabusApprovalStatus in DB
        console.log(`TA Review [${action}] syllabusId=${syllabusId} status=${status} comment=${comment}`);
        res.json({ success: true, message: `Review ${action} saved.` });
    } catch (err) {
        console.error('TA review action error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

export default reviewSyllabusRouter;
