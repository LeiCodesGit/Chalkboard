import express from 'express';
import Syllabus from '../../models/Syllabus/syllabus.js';

import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';
import ProgramEducationObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';

const deanApprovalRouter = express.Router();

/* -----------------------------------------------------------------------
   GET /syllabus/dean/approve/:syllabusId  →  Dean Approval Detail Page
   ----------------------------------------------------------------------- */
deanApprovalRouter.get('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        const approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });

        if (syl) {
            const peos = await ProgramEducationObjectives.find({ syllabusID: syllabusId });
            const seos = await StudentEducationObjectives.find({ syllabusID: syllabusId });
            const cos = await CourseOutcomes.find({ syllabusID: syllabusId });
            const mappings = await CourseMapping.find({ syllabusID: syllabusId });
            const schedules = await WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 });

            return res.render('Syllabus/syllabusApprovalDean', {
                courseName: syl.courseTitle || 'Course Name',
                courseCode: syl.courseCode || 'Course Code',
                courseSection: syl.section || 'Course Section',
                academicYear: syl.academicYear || 'Academic Year',
                fileType: 'Syllabus Draft',
                syllabusId,
                currentPageCategory: 'syllabus',
                approvalStatus: approval ? approval.status : 'Pending',
                existingComment: approval ? (approval.Dean_Remarks || '') : '',
                pcRemarks: approval ? (approval.PC_Remarks || approval.remarks || '') : '',
                workflowStep: 'approval',
                optionApproveValue: 'Approved',
                peos,
                seos,
                cos,
                mappings,
                schedules,
                syl,
                pcSignature: approval ? (approval.PC_Signature || null) : null,
                pcSignatoryName: approval ? (approval.PC_SignatoryName || '') : '',
                user: req.session.user
            });
        }
    } catch (err) {
        console.error('Dean approval detail error:', err);
    }
    res.redirect('/syllabus/approve');
});

/* -----------------------------------------------------------------------
   POST /syllabus/dean/approve/:syllabusId  →  Save Draft or Submit Approval
   ----------------------------------------------------------------------- */
deanApprovalRouter.post('/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action, signature, signatoryName } = req.body;

    try {
        let approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        if (!approval) {
            approval = new SyllabusApprovalStatus({ syllabusID: syllabusId });
        }

        approval.Dean_Remarks = comment || '';

        if (action === 'draft') {
            await approval.save();
            return res.json({ success: true, message: 'Approval draft saved.' });
        }

        if (status === 'Approved') {
            approval.status = 'Approved';
            approval.approvedBy = 'Dean';
            approval.approvalDate = new Date();
            
            if (signature) approval.Dean_Signature = signature;
            if (signatoryName) approval.Dean_SignatoryName = signatoryName;

        } else if (status === 'Returned' || status === 'Returned to PC') {
            approval.status = 'Rejected';
            approval.approvedBy = 'Dean';
            approval.approvalDate = new Date();
        }

        await approval.save();
        res.json({ success: true, message: status === 'Returned' || status === 'Returned to PC' ? 'Returned to Faculty.' : 'Approval submitted.' });
    } catch (err) {
        console.error('Dean approval action error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

export default deanApprovalRouter;
