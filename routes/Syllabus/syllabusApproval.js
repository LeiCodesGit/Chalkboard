import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const syllabusApprovalRouter = express.Router();

const DUMMY_DRAFTS = [
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c01',
        courseCode: 'CPE101-4',
        courseTitle: 'Software Design',
        instructor: 'Juan dela Cruz',
        img: 'https://picsum.photos/seed/cpe101/400/200',
        status: 'Pending',
        approvalDate: null,
        approvedBy: null,
        remarks: 'Awaiting dean review.',
        submittedDate: 'Feb 25, 2026'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c02',
        courseCode: 'EE101-2',
        courseTitle: 'Fundamental of Electrical Circuits',
        instructor: 'Maria Santos',
        img: 'https://picsum.photos/seed/ee101/400/200',
        status: 'Approved',
        approvalDate: 'Feb 27, 2026',
        approvedBy: 'Dean Robert Tan',
        remarks: 'Approved with minor corrections noted.',
        submittedDate: 'Feb 22, 2026'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c03',
        courseCode: 'CPE101L-4',
        courseTitle: 'Digital Electronics: Logic Circuits and Design',
        instructor: 'Jose Reyes',
        img: 'https://picsum.photos/seed/cpe101l/400/200',
        status: 'Pending',
        approvalDate: null,
        approvedBy: null,
        remarks: 'Please add course outcomes table.',
        submittedDate: 'Feb 26, 2026'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c04',
        courseCode: 'ECE130',
        courseTitle: 'Feedback and Control Systems',
        instructor: 'Ana Lim',
        img: 'https://picsum.photos/seed/ece130/400/200',
        status: 'Not Submitted',
        approvalDate: null,
        approvedBy: null,
        remarks: '',
        submittedDate: '—'
    },
    {
        syllabusId: '665f1a2b3c4d5e6f7a8b9c05',
        courseCode: 'ECEIOL-3',
        courseTitle: 'Fundamental of Electrical Circuits Laboratory',
        instructor: 'Luis Garcia',
        img: 'https://picsum.photos/seed/eceiol/400/200',
        status: 'Not Submitted',
        approvalDate: null,
        approvedBy: null,
        remarks: '',
        submittedDate: '—'
    }
];

syllabusApprovalRouter.get('/', async (req, res) => {
    // Ignore referers from approval detail pages to prevent back-button loops
    const referer = req.headers.referer || '';
    const isDetailPage = /\/(dean\/approve|tech-assistant\/review|prog-chair\/endorse)\//.test(referer);
    const returnUrl = (!referer || isDetailPage) ? '/syllabus' : referer;

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
                    status: approval.status || 'Not Submitted',
                    approvalDate: approval.approvalDate
                        ? new Date(approval.approvalDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : null,
                    approvedBy: approval.approvedBy || null,
                    remarks: approval.remarks || '',
                    submittedDate: approval.updatedAt
                        ? new Date(approval.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'N/A'
                };
            }).filter(Boolean);
        }

        if (drafts.length === 0) drafts = DUMMY_DRAFTS;

        const pendingCount = drafts.filter(d => d.status === 'Pending').length;
        const approvedCount = drafts.filter(d => d.status === 'Approved').length;

        res.render('Syllabus/syllabusApproval', { drafts, pendingCount, approvedCount, returnUrl, currentPageCategory: 'syllabus' });

    } catch (error) {
        console.error('Approval queue error:', error);
        res.render('Syllabus/syllabusApproval', { drafts: DUMMY_DRAFTS, pendingCount: 2, approvedCount: 1, returnUrl, currentPageCategory: 'syllabus' });
    }
});

export default syllabusApprovalRouter;
