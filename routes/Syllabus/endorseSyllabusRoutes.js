import express from 'express';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const endorseSyllabusRouter = express.Router();

/* -----------------------------------------------------------------------
   DUMMY DATA — used as fallback when DB has no records
   ----------------------------------------------------------------------- */
const DUMMY_COURSES = [
    {
        id: 'pc-demo-001',
        code: 'CPE107L-1',
        title: 'Software Design',
        instructor: 'Juan dela Cruz',
        img: 'https://picsum.photos/seed/cpe107/400/200',
        hasDraft: false,
        status: 'No Syllabus Draft'
    },
    {
        id: 'pc-demo-002',
        code: 'EE101-2',
        title: 'Fundamental of Electrical Circuits',
        instructor: 'Maria Santos',
        img: 'https://picsum.photos/seed/ee101/400/200',
        hasDraft: true,
        status: 'Pending'
    }
];

const DUMMY_DRAFTS = [
    {
        syllabusId: 'endorse-demo-001',
        courseCode: 'CPE101-4',
        courseTitle: 'Software Design',
        instructor: 'Juan dela Cruz',
        img: 'https://picsum.photos/seed/cpe101/400/200',
        status: 'Pending',
        endorsedDate: null,
        endorsedBy: null,
        remarks: 'Awaiting Program Chair endorsement.',
        submittedDate: 'Feb 25, 2026'
    },
    {
        syllabusId: 'endorse-demo-002',
        courseCode: 'EE101-2',
        courseTitle: 'Fundamental of Electrical Circuits',
        instructor: 'Maria Santos',
        img: 'https://picsum.photos/seed/ee101/400/200',
        status: 'Endorsed',
        endorsedDate: 'Feb 28, 2026',
        endorsedBy: 'Prof. Dela Vega',
        remarks: 'Endorsed with minor formatting notes.',
        submittedDate: 'Feb 22, 2026'
    },
    {
        syllabusId: 'endorse-demo-003',
        courseCode: 'CPE101L-4',
        courseTitle: 'Digital Electronics: Logic Circuits and Design',
        instructor: 'Jose Reyes',
        img: 'https://picsum.photos/seed/cpe101l/400/200',
        status: 'Pending',
        endorsedDate: null,
        endorsedBy: null,
        remarks: null,
        submittedDate: 'Feb 26, 2026'
    }
];

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair  →  Course Overview (Program Chair)
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/', async (req, res) => {
    try {
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
                    : 'TBA',
                img: (c.courseImage && c.courseImage.startsWith('data:'))
                    ? c.courseImage
                    : `https://picsum.photos/seed/${c._id}/400/200`,
                hasDraft: !!draftRecord,
                status: draftRecord ? draftRecord.status : 'No Syllabus Draft'
            };
        });

        let courses = formattedCourses.length > 0 ? formattedCourses : DUMMY_COURSES;

        // Always show at least dummy data so the page isn't blank
        if (courses.length === 0) courses = DUMMY_COURSES;

        res.render('Syllabus/courseOverviewProgChair', {
            courses,
            currentPageCategory: 'syllabus',
            userId: 'prog-chair-demo'
        });
    } catch (error) {
        console.error('PC Course Overview error:', error);
        res.render('Syllabus/courseOverviewProgChair', {
            courses: DUMMY_COURSES,
            currentPageCategory: 'syllabus',
            userId: 'prog-chair-demo'
        });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/endorse  →  Endorsement Queue
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/endorse', async (req, res) => {
    try {
        const approvals = await SyllabusApprovalStatus.find({});
        let drafts = [];

        if (approvals.length > 0) {
            const syllabusIds = approvals.map(a => a.syllabusID);
            let syllabuses = await Syllabus.find({ _id: { $in: syllabusIds } });

            if (mainDB.models.User) {
                await Syllabus.populate(syllabuses, { path: 'assignedInstructor' });
            }

            drafts = approvals.map(approval => {
                const syl = syllabuses.find(s => s._id.toString() === approval.syllabusID.toString());
                if (!syl) return null;
                return {
                    syllabusId: syl._id.toString(),
                    courseCode: syl.courseCode || 'N/A',
                    courseTitle: syl.courseTitle || 'Untitled',
                    instructor: syl.assignedInstructor
                        ? `${syl.assignedInstructor.firstName} ${syl.assignedInstructor.lastName}`
                        : 'TBA',
                    img: (syl.courseImage && syl.courseImage.startsWith('data:'))
                        ? syl.courseImage
                        : `https://picsum.photos/seed/${syl._id}/400/200`,
                    status: approval.status || 'Pending',
                    endorsedDate: approval.approvalDate
                        ? new Date(approval.approvalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    endorsedBy: approval.approvedBy || null,
                    remarks: approval.remarks || '',
                    submittedDate: approval.updatedAt
                        ? new Date(approval.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'
                };
            }).filter(Boolean);
        }

        if (drafts.length === 0) drafts = DUMMY_DRAFTS;

        const pendingCount = drafts.filter(d => d.status === 'Pending').length;
        const endorsedCount = drafts.filter(d => d.status === 'Endorsed').length;

        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts,
            pendingCount,
            endorsedCount,
            currentPageCategory: 'syllabus'
        });
    } catch (error) {
        console.error('Endorsement Queue error:', error);
        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts: DUMMY_DRAFTS,
            pendingCount: 2,
            endorsedCount: 1,
            currentPageCategory: 'syllabus'
        });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/endorse/:syllabusId  →  Endorsement Detail
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/endorse/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;

    try {
        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');

        if (syl) {
            return res.render('Syllabus/syllabusProgChairEndorsement', {
                courseName: syl.courseTitle || 'Course Name',
                courseCode: syl.courseCode || 'Course Code',
                courseSection: syl.section || 'Section',
                academicYear: syl.academicYear || 'Academic Year',
                fileType: 'Syllabus Draft',
                syllabusId,
                currentPageCategory: 'syllabus'
            });
        }
    } catch (err) {
        console.error('Endorsement detail error:', err);
    }

    // Fallback with dummy data
    res.render('Syllabus/syllabusProgChairEndorsement', {
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
   POST /syllabus/prog-chair/endorse/:syllabusId  →  Save Draft or Submit Endorsement
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.post('/endorse/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action } = req.body;

    try {
        // TODO: Update SyllabusApprovalStatus in DB
        console.log(`PC Endorsement [${action}] syllabusId=${syllabusId} status=${status} comment=${comment}`);
        res.json({ success: true, message: `Endorsement ${action} saved.` });
    } catch (err) {
        console.error('PC endorsement action error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/search  →  Live Search API
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/search', async (req, res) => {
    const query = (req.query.q || '').trim();
    try {
        const filter = query
            ? { $or: [{ courseTitle: { $regex: query, $options: 'i' } }, { courseCode: { $regex: query, $options: 'i' } }] }
            : {};

        let courses = await Syllabus.find(filter);
        if (mainDB.models.User) await Syllabus.populate(courses, { path: 'assignedInstructor' });

        const courseIds = courses.map(c => c._id.toString());
        const approvals = await SyllabusApprovalStatus.find({ syllabusID: { $in: courseIds } });

        const formatted = courses.map(c => {
            const idStr = c._id.toString();
            const draftRecord = approvals.find(a => a.syllabusID.toString() === idStr);
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
                hasDraft: !!draftRecord,
                status: draftRecord ? draftRecord.status : 'No Syllabus Draft'
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('PC Search error:', error);
        res.json([]);
    }
});

export default endorseSyllabusRouter;
