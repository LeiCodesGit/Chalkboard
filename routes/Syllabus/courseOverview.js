import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import multer from 'multer';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

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

const coursesOverviewRouter = express.Router();

/**
 * API: Fetch Users for Instructor Dropdown
 */
coursesOverviewRouter.get('/users', async (req, res) => {
    try {
        const User = mainDB.models.User;
        if (!User) return res.json([]);
        const users = await User.find({}, 'firstName lastName email role');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.json([]);
    }
});

/**
 * API: SEARCH logic for Live Search results
 */
coursesOverviewRouter.get('/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const userId = req.query.userId || '';

        const filter = {};

        // Only filter by userID if userId is a valid ObjectId
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            filter.userID = new mongoose.Types.ObjectId(userId);
        }

        if (query) {
            const regex = new RegExp(query, 'i');
            filter.$or = [
                { courseTitle: { $regex: regex } },
                { courseCode: { $regex: regex } }
            ];
        }

        let courses = await Syllabus.find(filter);

        if (mainDB.models.User) {
            await Syllabus.populate(courses, { path: 'assignedInstructor' });
        }

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
                    : "TBA",
                img: (c.courseImage && c.courseImage.startsWith('data:'))
                    ? c.courseImage
                    : `https://picsum.photos/seed/${c._id}/400/200`,
                hasDraft: !!draftRecord,
                status: draftRecord ? draftRecord.status : "No Syllabus Draft"
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error searching courses:', error);
        res.json([]);
    }
});

/**
 * 1. READ logic for the main dashboard load
 */
coursesOverviewRouter.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

        let userCourses = await Syllabus.find({ userID: userId });

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

        res.render('Syllabus/courseOverview', {
            courses: formattedCourses,
            userId: userId,
            searchQuery: req.query.search || '',
            currentPageCategory: 'syllabus' //
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.render('Syllabus/courseOverview', { courses: [], userId: req.params.userId, searchQuery: '', currentPageCategory: 'syllabus' });
    }
});

/**
 * 2. CREATE logic with Duplicate Check
 */
coursesOverviewRouter.post('/:userId/add', upload.single('courseImage'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { courseCode, courseTitle, assignedInstructor } = req.body;

        const existingCode = await Syllabus.findOne({ userID: userId, courseCode: { $regex: new RegExp(`^${courseCode}$`, 'i') } });
        if (existingCode) return res.status(409).json({ error: 'duplicate', field: 'courseCode', message: `Code "${courseCode}" already exists.` });

        const syllabusData = { userID: userId, courseCode, courseTitle };
        if (assignedInstructor) syllabusData.assignedInstructor = assignedInstructor;
        if (req.file) {
            const base64 = req.file.buffer.toString('base64');
            syllabusData.courseImage = `data:${req.file.mimetype};base64,${base64}`;
        }

        const newSyllabus = new Syllabus(syllabusData);
        await newSyllabus.save();
        res.json({ success: true, redirect: `/syllabus/${userId}` });
    } catch (error) {
        console.error('Add course error:', error);
        res.status(500).json({ error: 'server', message: 'Error adding course.' });
    }
});

/**
 * 3. BULK DELETE
 */
coursesOverviewRouter.post('/:userId/delete-bulk', express.json(), async (req, res) => {
    try {
        const { userId } = req.params;
        const { courseIds } = req.body;
        if (!courseIds || courseIds.length === 0) return res.status(400).json({ error: 'No courses selected.' });
        await Syllabus.deleteMany({ _id: { $in: courseIds }, userID: userId });
        await SyllabusApprovalStatus.deleteMany({ syllabusID: { $in: courseIds } });
        res.json({ success: true, redirect: `/syllabus/${userId}` });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: 'Error deleting courses.' });
    }
});

export default coursesOverviewRouter;