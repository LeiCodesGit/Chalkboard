import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const adminOverviewRouter = express.Router();

/* -----------------------------------------------------------------------
   Dummy data for development / empty-DB fallback
   ----------------------------------------------------------------------- */
const DUMMY_ITEMS = [
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c01',
        courseCode: 'CPE101-4',
        courseTitle: 'Software Design',
        instructor: 'Juan dela Cruz',
        img: 'https://picsum.photos/seed/cpe101/400/200',
        status: 'Approved',
        approvalDate: 'Feb 27, 2026',
        approvedBy: 'Dean Robert Tan',
        archivedBy: null,
        archivedDate: null,
        submittedDate: 'Feb 25, 2026'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c02',
        courseCode: 'EE101-2',
        courseTitle: 'Fundamental of Electrical Circuits',
        instructor: 'Maria Santos',
        img: 'https://picsum.photos/seed/ee101/400/200',
        status: 'Approved',
        approvalDate: 'Feb 26, 2026',
        approvedBy: 'Dean Robert Tan',
        archivedBy: null,
        archivedDate: null,
        submittedDate: 'Feb 20, 2026'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c03',
        courseCode: 'ME201-1',
        courseTitle: 'Thermodynamics',
        instructor: 'Pedro Garcia',
        img: 'https://picsum.photos/seed/me201/400/200',
        status: 'Archived',
        approvalDate: 'Jan 15, 2026',
        approvedBy: 'Dean Robert Tan',
        archivedBy: 'HR Admin',
        archivedDate: 'Feb 01, 2026',
        submittedDate: 'Jan 10, 2026'
    }
];

/* -----------------------------------------------------------------------
   GET /syllabus/hr  →  HR Archive Queue
   ----------------------------------------------------------------------- */
adminOverviewRouter.get('/', async (req, res) => {
    const returnUrl = '/syllabus';
    let items = [];

    try {
        const approvals = await SyllabusApprovalStatus.find({
            status: { $in: ['Approved', 'Archived'] }
        });

        if (approvals.length > 0) {
            const syllabusIds = approvals.map(a => a.syllabusID);
            let courses = await Syllabus.find({ _id: { $in: syllabusIds } });

            if (mainDB.models.User) {
                await Syllabus.populate(courses, { path: 'assignedInstructor' });
            }

            items = approvals.map(approval => {
                const course = courses.find(c => c._id.toString() === approval.syllabusID.toString());
                if (!course) return null;

                return {
                    syllabusId: course._id.toString(),
                    courseCode: course.courseCode,
                    courseTitle: course.courseTitle,
                    instructor: course.assignedInstructor
                        ? `${course.assignedInstructor.firstName} ${course.assignedInstructor.lastName}`
                        : 'TBA',
                    img: (course.courseImage && course.courseImage.startsWith('data:'))
                        ? course.courseImage
                        : `https://picsum.photos/seed/${course._id}/400/200`,
                    status: approval.status,
                    approvalDate: approval.approvalDate
                        ? new Date(approval.approvalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    approvedBy: approval.approvedBy || null,
                    archivedBy: approval.archivedBy || null,
                    archivedDate: approval.archivedDate
                        ? new Date(approval.archivedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    submittedDate: approval.updatedAt
                        ? new Date(approval.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'
                };
            }).filter(Boolean);
        }

        if (items.length === 0) items = DUMMY_ITEMS;

        const approvedCount = items.filter(d => d.status === 'Approved').length;
        const archivedCount = items.filter(d => d.status === 'Archived').length;

        res.render('Syllabus/courseOverviewAdmin', {
            items, approvedCount, archivedCount, returnUrl,
            currentPageCategory: 'syllabus'
        });

    } catch (error) {
        console.error('HR archive queue error:', error);
        res.render('Syllabus/courseOverviewAdmin', {
            items: DUMMY_ITEMS,
            approvedCount: 2, archivedCount: 1, returnUrl,
            currentPageCategory: 'syllabus'
        });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/hr/review/:syllabusId  →  HR Final Review Detail Page
   ----------------------------------------------------------------------- */
adminOverviewRouter.get('/review/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        const isDummy = DUMMY_ITEMS.some(d => d.syllabusId === syllabusId);

        if (!approval && !isDummy) return res.status(404).send("Approval record not found");

        let course = null;
        if (mongoose.Types.ObjectId.isValid(syllabusId)) {
            course = await Syllabus.findById(syllabusId);
        }

        // Pass dummy data if actual record missing
        let viewData = {
            syllabusId: syllabusId,
            courseName: course ? course.courseTitle : "Introduction to Demo Course",
            courseCode: course ? course.courseCode : "DEMO101",
            courseSection: "A1",
            academicYear: "2025-2026",
            fileType: "Syllabus Form"
        };

        res.render('Syllabus/syllabusApprovalHR', viewData);
    } catch (err) {
        console.error("HR Review render error:", err);
        res.status(500).send("Server Error");
    }
});

/* -----------------------------------------------------------------------
   POST /syllabus/hr/archive/:syllabusId  →  Archive an approved syllabus
   ----------------------------------------------------------------------- */
adminOverviewRouter.post('/archive/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { archivedBy } = req.body;

    try {
        const record = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
        if (record.status !== 'Approved') return res.status(400).json({ success: false, message: 'Only approved syllabuses can be archived.' });

        record.status = 'Archived';
        record.archivedBy = archivedBy || 'HR Admin';
        record.archivedDate = new Date();
        await record.save();

        res.json({ success: true, message: 'Syllabus archived successfully.' });
    } catch (err) {
        console.error('Archive error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

/* -----------------------------------------------------------------------
   POST /syllabus/hr/unarchive/:syllabusId  →  Restore an archived syllabus
   ----------------------------------------------------------------------- */
adminOverviewRouter.post('/unarchive/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const record = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
        if (record.status !== 'Archived') return res.status(400).json({ success: false, message: 'Only archived syllabuses can be unarchived.' });

        record.status = 'Approved';
        record.archivedBy = null;
        record.archivedDate = null;
        await record.save();

        res.json({ success: true, message: 'Syllabus unarchived successfully.' });
    } catch (err) {
        console.error('Unarchive error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/hr/search  →  Live Search API
   ----------------------------------------------------------------------- */
adminOverviewRouter.get('/search', async (req, res) => {
    const query = (req.query.q || '').trim();
    try {
        const filter = query
            ? { $or: [{ courseTitle: { $regex: query, $options: 'i' } }, { courseCode: { $regex: query, $options: 'i' } }] }
            : {};

        let courses = await Syllabus.find(filter);
        if (mainDB.models.User) await Syllabus.populate(courses, { path: 'assignedInstructor' });

        const courseIds = courses.map(c => c._id.toString());
        const approvals = await SyllabusApprovalStatus.find({
            syllabusID: { $in: courseIds },
            status: { $in: ['Approved', 'Archived'] }
        });

        const formatted = courses
            .filter(c => approvals.some(a => a.syllabusID.toString() === c._id.toString()))
            .map(c => {
                const idStr = c._id.toString();
                const record = approvals.find(a => a.syllabusID.toString() === idStr);
                return {
                    id: idStr,
                    code: c.courseCode,
                    title: c.courseTitle,
                    instructor: c.assignedInstructor
                        ? `${c.assignedInstructor.firstName} ${c.assignedInstructor.lastName}`
                        : 'TBA',
                    img: (c.courseImage && c.courseImage.startsWith('data:'))
                        ? c.courseImage
                        : `https://picsum.photos/seed/${c._id}/400/200`,
                    status: record.status
                };
            });

        res.json(formatted);
    } catch (error) {
        console.error('HR Search error:', error);
        res.json([]);
    }
});

export default adminOverviewRouter;
