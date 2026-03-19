import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const coursesOverviewFacultyRouter = express.Router();

function getLatestRemark(a) {
    if (!a) return "";
    if (a.status === 'Archived') return a.HR_Remarks || a.Dean_Remarks || a.PC_Remarks || a.remarks || "";
    if (a.status === 'Approved' || a.status === 'Returned to PC') return a.Dean_Remarks || a.PC_Remarks || a.remarks || "";
    if (a.status === 'Endorsed' || a.status === 'PC_Approved') return a.PC_Remarks || a.remarks || "";
    if (a.status === 'Rejected') {
        if (a.approvedBy && a.approvedBy.includes('Dean')) return a.Dean_Remarks || a.PC_Remarks || a.remarks || "";
        return a.PC_Remarks || a.remarks || "";
    }
    // Fallback
    return a.remarks || "";
}

/**
 * READ logic for the main dashboard load
 */
coursesOverviewFacultyRouter.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

        // Filter courses to only show those assigned to the logged-in faculty
        const loggedInUserId = req.session && req.session.user ? (req.session.user.id || req.session.user._id) : null;
        const filter = loggedInUserId ? { assignedInstructor: loggedInUserId } : {};
        let userCourses = await Syllabus.find(filter);

        if (mainDB.models.User) {
            await Syllabus.populate(userCourses, { path: 'assignedInstructor' });
        }

        const courseIds = userCourses.map(c => c._id.toString());
        const approvals = await SyllabusApprovalStatus.find({ syllabusID: { $in: courseIds } });

        const formattedCourses = userCourses.map(c => {
            const idStr = c._id.toString();
            const draftRecord = approvals.find(a => a.syllabusID.toString() === idStr);

            return {
                id: idStr,
                code: c.courseCode,
                title: c.courseTitle,
                instructor: c.assignedInstructor
                    ? `${c.assignedInstructor.firstName} ${c.assignedInstructor.lastName}`
                    : "TBA",
                img: (c.courseImage && c.courseImage.startsWith('data:'))
                    ? c.courseImage
                    : `https://picsum.photos/seed/${c._id}/400/200`,
                hasDraft: !!draftRecord,
                status: draftRecord ? draftRecord.status : "No Syllabus Draft",
                remarks: draftRecord ? getLatestRemark(draftRecord) : "",
                pcRemarks: draftRecord ? (draftRecord.PC_Remarks || "") : "",
                deanRemarks: draftRecord ? (draftRecord.Dean_Remarks || "") : "",
                hrRemarks: draftRecord ? (draftRecord.HR_Remarks || "") : ""
            };
        });

        res.render('Syllabus/courseOverviewFaculty', {
            courses: formattedCourses,
            userId: 'faculty',
            searchQuery: req.query.search || '',
            currentPageCategory: 'syllabus'
        });
    } catch (error) {
        console.error("Faculty Dashboard error:", error);
        res.render('Syllabus/courseOverviewFaculty', {
            courses: [],
            userId: 'faculty',
            searchQuery: '',
            currentPageCategory: 'syllabus'
        });
    }
});

export default coursesOverviewFacultyRouter;
