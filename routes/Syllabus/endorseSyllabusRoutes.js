import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';
import ProgramEducationObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';
import CourseEvaluationPerCO from '../../models/Syllabus/courseEvaluationPerCO.js';

const endorseSyllabusRouter = express.Router();


// Multer config — store in memory for conversion to base64 for MongoDB
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const mimeOk = allowed.test(file.mimetype);
        if (mimeOk) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
        }
    }
});

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
        status: 'PendingApproval', // Explicit for Approval Queue Pending
        endorsedDate: null,
        endorsedBy: null,
        remarks: 'Waiting for Program Chair review.',
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
        status: 'PendingEndorsement', // Explicit for Endorsement Queue Pending
        endorsedDate: 'Mar 15, 2026',
        endorsedBy: 'PC_Approved',
        remarks: 'Awaiting final endorsement to Dean.',
        submittedDate: 'Feb 26, 2026'
    },
    {
        syllabusId: 'endorse-demo-004',
        courseCode: 'CPE107L-1',
        courseTitle: 'Software Design II',
        instructor: 'Juan dela Cruz',
        img: 'https://picsum.photos/seed/cpe107/400/200',
        status: 'PC_Approved', // Already approved in Approval Queue
        endorsedDate: 'Mar 10, 2026',
        endorsedBy: 'PC_Approved',
        remarks: 'Ready for endorsement.',
        submittedDate: 'Mar 01, 2026'
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

        let courses = formattedCourses;

        res.render('Syllabus/courseOverviewProgChair', {
            courses,
            currentPageCategory: 'syllabus',
            userId: req.session.user ? req.session.user.id : 'prog-chair-demo',
            user: req.session.user
        });
    } catch (error) {
        console.error('PC Course Overview error:', error);
        res.render('Syllabus/courseOverviewProgChair', {
            courses: [],
            currentPageCategory: 'syllabus',
            userId: req.session.user ? req.session.user.id : 'prog-chair-demo',
            user: req.session.user
        });
    }
});

/* -----------------------------------------------------------------------
   POST /syllabus/prog-chair/:userId/add  →  Create New Course
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.post('/:userId/add', upload.single('courseImage'), async (req, res) => {
    try {
        let userId = req.params.userId;
        const { courseCode, courseTitle, assignedInstructor } = req.body;

        // Use session user ID as fallback when URL param is not a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId) && req.session.user) {
            userId = req.session.user.id || req.session.user._id;
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'server', message: 'Invalid user ID. Please log in again.' });
        }

        // Duplicate Check (Case-insensitive)
        const existing = await Syllabus.findOne({ 
            courseCode: { $regex: new RegExp(`^${courseCode}$`, 'i') } 
        });
        
        if (existing) {
            return res.status(409).json({ 
                error: 'duplicate', 
                field: 'courseCode', 
                message: `Course code "${courseCode}" already exists in the system.` 
            });
        }

        const syllabusData = { 
            userID: userId, 
            courseCode, 
            courseTitle 
        };

        if (assignedInstructor) syllabusData.assignedInstructor = assignedInstructor;
        
        if (req.file) {
            const base64 = req.file.buffer.toString('base64');
            syllabusData.courseImage = `data:${req.file.mimetype};base64,${base64}`;
        }

        const newSyllabus = new Syllabus(syllabusData);
        await newSyllabus.save();

        console.log(`PC ADD COURSE: ${courseCode} by ${userId}`);
        res.json({ success: true, redirect: '/syllabus/prog-chair' });
    } catch (error) {
        console.error('PC Add course error:', error);
        res.status(500).json({ error: 'server', message: 'Internal server error while adding course.' });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/approve  →  Approval Queue
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/approve', async (req, res) => {
    try {
        const approvals = await SyllabusApprovalStatus.find({
            $or: [
                { status: 'Pending' },
                { status: 'Approved', approvedBy: 'PC_Approved' },
                { status: 'Approved', approvedBy: 'Program Chair' },
                { status: 'Endorsed' },
                { status: 'Returned to PC' },
                { approvedBy: 'Rejected' }
            ]
        });
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
                
                // Map status for frontend filter (Pending, PC_Approved, or Rejected)
                let displayStatus = 'Pending';
                let statusDateLabel = 'Submitted';

                if (approval.approvedBy === 'Rejected') {
                    displayStatus = 'Rejected';
                    statusDateLabel = 'Rejected';
                } else if (approval.status === 'Endorsed') {
                    displayStatus = 'PC_Approved';
                    statusDateLabel = 'Endorsed';
                } else if (approval.approvedBy === 'PC_Approved' || approval.approvedBy === 'Program Chair') {
                    displayStatus = 'PC_Approved';
                    statusDateLabel = 'Endorsed';
                }

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
                    status: displayStatus,
                    statusDateLabel: statusDateLabel,
                    endorsedDate: approval.approvalDate
                        ? new Date(approval.approvalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    submittedDate: approval.updatedAt
                        ? new Date(approval.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'
                };
            }).filter(Boolean);
        }



        const pendingCount = drafts.filter(d => d.status === 'Pending').length;
        const approvedHistoryCount = drafts.filter(d => d.status === 'PC_Approved').length;
        const rejectedCount = drafts.filter(d => d.status === 'Rejected').length;

        const statusOrder = { 'Pending': 1, 'PC_Approved': 2, 'Endorsed': 2, 'Rejected': 3 };
        drafts.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts,
            pendingCount,
            endorsedCount: approvedHistoryCount,
            rejectedCount: rejectedCount,
            currentPageCategory: 'syllabus',
            actionUrlPrefix: '/syllabus/prog-chair/approve',
            actionLabel: 'Review',
            approvedLabel: 'Endorsed',
            approvedFilter: 'PC_Approved',
            rejectedFilter: 'Rejected',
            rejectedLabel: 'Rejected',
            queueTitle: 'Syllabus Endorsement Queue',
            queueSubtitle: 'Review and endorse syllabuses submitted by faculty to the Dean.',
            user: req.session.user
        });
    } catch (error) {
        console.error('Approval Queue error:', error);
        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts: [], pendingCount: 0, endorsedCount: 0, currentPageCategory: 'syllabus',
            actionUrlPrefix: '/syllabus/prog-chair/approve', actionLabel: 'Review',
            queueTitle: 'Program Chair Approval Queue', queueSubtitle: '',
            user: req.session.user
        });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/approve/:syllabusId  →  Approval Detail
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/approve/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    try {
        // Handle Dummy Data ID
        if (syllabusId.startsWith('endorse-demo-') || syllabusId.startsWith('pc-demo-')) {
            const dummy = DUMMY_DRAFTS.find(d => d.syllabusId === syllabusId);
            if (dummy) {
                return res.render('Syllabus/syllabusProgChairEndorsement', {
                    courseName: dummy.courseTitle,
                    courseCode: dummy.courseCode,
                    courseSection: 'N/A',
                    academicYear: '2025-2026',
                    fileType: 'Syllabus Draft (DEMO)',
                    syllabusId: syllabusId,
                    currentStatus: 'Pending',
                    approvalState: dummy.status === 'PC_Approved' ? 'PC_Approved' : null,
                    existingComment: dummy.remarks || '',
                    currentPageCategory: 'syllabus',
                    actionUrlPrefix: '/syllabus/prog-chair/approve',
                    optionApproveValue: 'PC_Approved',
                    actionTitle: 'Syllabus Endorsement',
                    workflowStep: 'endorsement',
                    actionLabel: 'Endorse Syllabus'
                });
            }
        }

        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        const approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });

        if (syl) {
            const peos = await ProgramEducationObjectives.find({ syllabusID: syllabusId });
            const seos = await StudentEducationObjectives.find({ syllabusID: syllabusId });
            const cos = await CourseOutcomes.find({ syllabusID: syllabusId });
            const mappings = await CourseMapping.find({ syllabusID: syllabusId });
            const schedules = await WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 });
            const evaluations = await CourseEvaluationPerCO.find({ syllabusID: syllabusId });

            return res.render('Syllabus/syllabusProgChairEndorsement', {
                syl,
                peos,
                seos,
                cos,
                mappings,
                schedules,
                evaluations,
                courseName: syl.courseTitle || 'Course Name',
                courseCode: syl.courseCode || 'Course Code',
                courseSection: syl.section || 'Section',
                academicYear: syl.academicYear || 'Academic Year',
                fileType: 'Syllabus Draft',
                syllabusId: syllabusId, // Consistent naming
                currentStatus: approval ? approval.status : 'Pending',
                approvalState: approval ? approval.approvedBy : null,
                existingComment: approval ? (approval.PC_Remarks || approval.remarks || '') : '',
                currentPageCategory: 'syllabus',
                actionUrlPrefix: '/syllabus/prog-chair/approve',
                optionApproveValue: 'PC_Approved', // Value submitted when approved
                actionTitle: 'Syllabus Endorsement',
                workflowStep: 'endorsement',
                actionLabel: 'Endorse Syllabus',
                user: req.session.user
            });
        }
    } catch (err) { console.error('Approval detail error:', err); }
    res.redirect('/syllabus/prog-chair/approve');
});

/* -----------------------------------------------------------------------
   POST /syllabus/prog-chair/approve/:syllabusId  →  Save Draft or Submit Decision
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.post('/approve/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action } = req.body;

    try {
        // Handle dummy approval (no DB record exists)
        if (syllabusId.startsWith('endorse-demo-') || syllabusId.startsWith('pc-demo-')) {
            const dummy = DUMMY_DRAFTS.find(d => d.syllabusId === syllabusId);
            if (dummy) {
                dummy.remarks = comment || '';
                if (action !== 'draft') {
                    if (status === 'Reject' || status === 'Returned') {
                        dummy.status = 'Rejected';
                        dummy.endorsedBy = 'Rejected';
                    } else if (status === 'PC_Approved' || status === 'Approved') {
                        dummy.status = 'Approved';
                        dummy.endorsedBy = 'Program Chair';
                        dummy.endorsedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    } else if (status === 'Reject' || status === 'Rejected') {
                        dummy.status = 'Rejected';
                        dummy.endorsedBy = 'Rejected';
                    }
                }
            }
            return res.json({ success: true, message: `Demo syllabus decision saved.` });
        }

        let approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        if (!approval) return res.status(404).json({ success: false, message: 'Approval record not found.' });

        approval.PC_Remarks = comment || '';

        if (action === 'draft') {
            await approval.save();
            return res.json({ success: true, message: 'Draft remarks saved successfully.' });
        }

        if (status === 'Reject' || status === 'Returned') {
            approval.status = 'Rejected';
            approval.approvedBy = 'Rejected';
        } else if (status === 'PC_Approved' || status === 'Approve Syllabus') {
            approval.status = 'Endorsed'; 
            approval.approvedBy = 'Program Chair';
            approval.approvalDate = new Date();
            
            // Save signature if provided
            if (req.body.signature) approval.PC_Signature = req.body.signature;
            if (req.body.signatoryName) approval.PC_SignatoryName = req.body.signatoryName;

        } else if (status === 'Reject Syllabus' || status === 'Rejected') {
            approval.status = 'Rejected';
            approval.approvedBy = 'Rejected';
        }

        await approval.save();
        res.json({ success: true, message: `Syllabus decision saved.` });
    } catch (err) {
        console.error('PC Approval action error:', err);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/endorse  →  Endorsement Queue
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/endorse', async (req, res) => {
    try {
        // Fetch PC Approved (Pending Endorsement) and Program Chair Endorsed
        const approvals = await SyllabusApprovalStatus.find({
            $or: [
                { status: 'Approved', approvedBy: 'PC_Approved' }, // Ready to endorse (from approval queue)
                { status: 'Endorsed' } // Already endorsed by Program Chair
            ]
        });
        console.log(`📋 ENDORSE QUEUE - Found ${approvals.length} approvals matching criteria`);
        approvals.forEach(a => console.log(`   - syllabusID: ${a.syllabusID}, status: ${a.status}, approvedBy: ${a.approvedBy}`));
        
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

                // Map status for frontend filter (Pending or Endorsed)
                const isEndorsed = (approval.status === 'Endorsed');
                const displayStatus = isEndorsed ? 'Endorsed' : 'Pending';

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
                    status: displayStatus,
                    statusDateLabel: isEndorsed ? 'Endorsed' : 'Approved',
                    endorsedDate: approval.approvalDate
                        ? new Date(approval.approvalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    endorsedBy: approval.approvedBy || null,
                    remarks: approval.PC_Remarks || approval.remarks || '',
                    submittedDate: approval.updatedAt
                        ? new Date(approval.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'
                };
            }).filter(Boolean);
        }



        const pendingCount = drafts.filter(d => d.status === 'Pending').length;
        const endorsedHistoryCount = drafts.filter(d => d.status === 'Endorsed').length;

        console.log(`✅ ENDORSE QUEUE RENDER - drafts: ${drafts.length}, pending: ${pendingCount}, endorsed: ${endorsedHistoryCount}`);

        const statusOrder = { 'Pending': 1, 'Endorsed': 2, 'PC_Approved': 2, 'Rejected': 3 };
        drafts.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts,
            pendingCount,
            endorsedCount: endorsedHistoryCount,
            currentPageCategory: 'syllabus',
            actionUrlPrefix: '/syllabus/prog-chair/endorse',
            actionLabel: 'Endorse',
            approvedLabel: 'Endorsed',
            approvedFilter: 'Endorsed',
            queueTitle: 'Program Chair Endorsement Queue',
            queueSubtitle: 'Finalize and endorse approved syllabuses to the Dean.',
            user: req.session.user
        });
    } catch (error) {
        console.error('Endorsement Queue error:', error);
        res.render('Syllabus/syllabusEndorsementQueue', {
            drafts: [], pendingCount: 0, endorsedCount: 0, currentPageCategory: 'syllabus',
            actionUrlPrefix: '/syllabus/prog-chair/endorse', actionLabel: 'Endorse', queueTitle: 'Program Chair Endorsement Queue', queueSubtitle: '',
            user: req.session.user
        });
    }
});

/* -----------------------------------------------------------------------
   GET /syllabus/prog-chair/endorse/:syllabusId  →  Endorsement Detail
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.get('/endorse/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    try {
        // Handle Dummy Data ID
        if (syllabusId.startsWith('endorse-demo-') || syllabusId.startsWith('pc-demo-')) {
            const dummy = DUMMY_DRAFTS.find(d => d.syllabusId === syllabusId);
            if (dummy) {
                return res.render('Syllabus/syllabusProgChairEndorsement', {
                    courseName: dummy.courseTitle,
                    courseCode: dummy.courseCode,
                    courseSection: 'N/A',
                    academicYear: '2025-2026',
                    fileType: 'Syllabus Draft (DEMO)',
                    syllabusId,
                    currentStatus: dummy.status === 'Endorsed' ? 'Approved' : 'Pending',
                    approvalState: dummy.status === 'Endorsed' ? 'Program Chair' : 'PC_Approved',
                    existingComment: dummy.remarks || '',
                    currentPageCategory: 'syllabus',
                    actionUrlPrefix: '/syllabus/prog-chair/endorse',
                    optionApproveValue: 'Approved',
                    actionTitle: 'Program Chair Endorsement',
                    workflowStep: 'endorsement'
                });
            }
        }

        const syl = await Syllabus.findById(syllabusId).populate('assignedInstructor');
        const approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });

        if (syl) {
            const peos = await ProgramEducationObjectives.find({ syllabusID: syllabusId });
            const seos = await StudentEducationObjectives.find({ syllabusID: syllabusId });
            const cos = await CourseOutcomes.find({ syllabusID: syllabusId });
            const mappings = await CourseMapping.find({ syllabusID: syllabusId });
            const schedules = await WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 });
            const evaluations = await CourseEvaluationPerCO.find({ syllabusID: syllabusId });

            return res.render('Syllabus/syllabusProgChairEndorsement', {
                syl,
                peos,
                seos,
                cos,
                mappings,
                schedules,
                evaluations,
                courseName: syl.courseTitle || 'Course Name',
                courseCode: syl.courseCode || 'Course Code',
                courseSection: syl.section || 'Section',
                academicYear: syl.academicYear || 'Academic Year',
                fileType: 'Syllabus Draft',
                syllabusId: syllabusId, // Consistent naming
                currentStatus: approval ? approval.status : 'Pending',
                approvalState: approval ? approval.approvedBy : null,
                existingComment: approval ? (approval.PC_Remarks || approval.remarks || '') : '',
                currentPageCategory: 'syllabus',
                actionUrlPrefix: '/syllabus/prog-chair/endorse',
                optionApproveValue: 'Approved', // Value submitted when endorsed
                actionTitle: 'Program Chair Endorsement',
                workflowStep: 'endorsement',
                user: req.session.user
            });
        }
    } catch (err) { console.error('Endorsement detail error:', err); }
    res.redirect('/syllabus/prog-chair/endorse');
});

/* -----------------------------------------------------------------------
   POST /syllabus/prog-chair/endorse/:syllabusId  →  Save Draft or Submit Endorsement
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.post('/endorse/:syllabusId', async (req, res) => {
    const { syllabusId } = req.params;
    const { comment, status, action } = req.body;

    try {
        // Handle dummy endorsement
        if (syllabusId.startsWith('endorse-demo-') || syllabusId.startsWith('pc-demo-')) {
            const dummy = DUMMY_DRAFTS.find(d => d.syllabusId === syllabusId);
            if (dummy) {
                dummy.remarks = comment || '';
                if (action !== 'draft') {
                    if (status === 'Approved') {
                        dummy.status = 'Endorsed';
                        dummy.endorsedBy = 'Program Chair';
                        dummy.endorsedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }
                }
            }
            return res.json({ success: true, message: `Demo endorsement submitted.` });
        }

        let approval = await SyllabusApprovalStatus.findOne({ syllabusID: syllabusId });
        if (!approval) return res.status(404).json({ success: false, message: 'Approval record not found.' });

        if (approval.approvedBy !== 'PC_Approved' && approval.status !== 'Approved' && approval.status !== 'Endorsed') {
            return res.status(400).json({ success: false, message: 'Syllabus must be Approved in the Approval Queue first.' });
        }

        approval.PC_Remarks = comment || '';

        if (action === 'draft') {
            await approval.save();
            return res.json({ success: true, message: 'Endorsement draft saved.' });
        }

        if (status === 'Approved' || status === 'PC_Approved') {
            approval.status = 'Endorsed';
            approval.approvedBy = 'Program Chair';
            approval.approvalDate = new Date();
            
            // Save signature if provided
            if (req.body.signature) approval.PC_Signature = req.body.signature;
            if (req.body.signatoryName) approval.PC_SignatoryName = req.body.signatoryName;

        } else if (status === 'Reject' || status === 'Rejected' || status === 'Returned') {
            approval.status = 'Rejected';
            approval.approvedBy = 'Program Chair (Returned)';
            approval.approvalDate = new Date();
        }

        await approval.save();
        res.json({ success: true, message: status === 'Rejected' ? 'Syllabus returned to faculty.' : 'Endorsement submitted.' });
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
                status: draftRecord ? draftRecord.status : 'No Syllabus Draft',
                remarks: draftRecord ? draftRecord.remarks : "",
                pcRemarks: draftRecord ? (draftRecord.PC_Remarks || "") : "",
                deanRemarks: draftRecord ? (draftRecord.Dean_Remarks || "") : "",
                hrRemarks: draftRecord ? (draftRecord.HR_Remarks || "") : ""
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('PC Search error:', error);
        res.json([]);
    }
});

/* -----------------------------------------------------------------------
   POST /:userId/delete-bulk  →  Bulk Delete Courses (Program Chair)
   ----------------------------------------------------------------------- */
endorseSyllabusRouter.post('/:userId/delete-bulk', async (req, res) => {
    try {
        const { userId } = req.params;
        const { courseIds } = req.body;
        
        console.log(`PC BULK DELETE: userId=${userId} count=${courseIds ? courseIds.length : 0}`);
        
        if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
            return res.status(400).json({ error: 'No courses selected.' });
        }

        // Filter valid ObjectIds to avoid CastError with dummy data IDs
        const validCourseIds = courseIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        
        if (validCourseIds.length > 0) {
            // Comprehensive cleanup of all related syllabus data
            await Syllabus.deleteMany({ _id: { $in: validCourseIds } });
            await SyllabusApprovalStatus.deleteMany({ syllabusID: { $in: validCourseIds } });
            await ProgramEducationObjectives.deleteMany({ syllabusID: { $in: validCourseIds } });
            await StudentEducationObjectives.deleteMany({ syllabusID: { $in: validCourseIds } });
            await CourseOutcomes.deleteMany({ syllabusID: { $in: validCourseIds } });
            await CourseMapping.deleteMany({ syllabusID: { $in: validCourseIds } });
            await WeeklySchedule.deleteMany({ syllabusID: { $in: validCourseIds } });
            await CourseEvaluationPerCO.deleteMany({ syllabusID: { $in: validCourseIds } });
            
            console.log(`PC DELETED ${validCourseIds.length} database courses and all related modules.`);
        } else {
            console.log(`PC BULK DELETE: No database courses selected (only dummy data).`);
        }
        
        res.json({ success: true, redirect: `/syllabus/prog-chair` });
    } catch (error) {
        console.error('Program Chair bulk delete error:', error);
        res.status(500).json({ error: 'Error deleting courses: ' + error.message });
    }
});

export default endorseSyllabusRouter;
