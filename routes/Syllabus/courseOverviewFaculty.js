import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const coursesOverviewFacultyRouter = express.Router();

/**
 * READ logic for the main dashboard load
 */
coursesOverviewFacultyRouter.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

        // Fetch all courses for now to populate the faculty view
        let userCourses = await Syllabus.find({});

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
                status: draftRecord ? draftRecord.status : "No Syllabus Draft"
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
