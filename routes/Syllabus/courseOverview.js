import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';
import multer from 'multer';
import Syllabus from '../../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';
import ProgramEducationObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';
import CourseEvaluationPerCO from '../../models/Syllabus/courseEvaluationPerCO.js';

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
        const userRole = req.session.user ? req.session.user.role?.toLowerCase() : '';

        const filter = {};

        // If the user is a Professor, restrict search to only their assigned courses
        if (userRole === 'professor' && req.session.user) {
            filter.assignedInstructor = req.session.user.id || req.session.user._id;
        } 
        // Otherwise, filter by userID if user is NOT a dean and userId is valid
        else if (userRole !== 'dean' && userId && mongoose.Types.ObjectId.isValid(userId)) {
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
                status: draftRecord ? draftRecord.status : "No Syllabus Draft",
                remarks: draftRecord ? getLatestRemark(draftRecord) : ""
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
        const userRole = req.session.user ? req.session.user.role?.toLowerCase() : '';

        console.log(`📚 COURSE OVERVIEW - userId: ${userId}, role: "${userRole}", sessionUser:`, req.session.user);

        // Safety check: Avoid Mongoose CastError if userId is "undefined" or invalid ObjectID
        if (userId === "undefined" || !mongoose.Types.ObjectId.isValid(userId)) {
            console.warn(`Invalid userId received in Course Overview: ${userId}. Redirecting to login.`);
            return res.redirect("/login");
        }

        // Deans see ALL courses, faculty see only their own
        const courseFilter = userRole === 'dean' ? {} : { userID: userId };
        console.log(`🔍 Course filter:`, courseFilter);
        let userCourses = await Syllabus.find(courseFilter);
        console.log(`✅ Courses found: ${userCourses.length}`);

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
                remarks: draftRecord ? getLatestRemark(draftRecord) : ""
            };
        });

        res.render('Syllabus/courseOverview', {
            courses: formattedCourses,
            userId: userId,
            searchQuery: req.query.search || '',
            currentPageCategory: 'syllabus',
            user: req.session.user //
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.render('Syllabus/courseOverview', { courses: [], userId: req.params.userId, searchQuery: '', currentPageCategory: 'syllabus', user: req.session.user });
    }
});

/**
 * 2. CREATE logic with Duplicate Check
 */
coursesOverviewRouter.post('/:userId/add', upload.single('courseImage'), async (req, res) => {
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
coursesOverviewRouter.post('/:userId/delete-bulk', async (req, res) => {
    try {
        const { userId } = req.params;
        const { courseIds } = req.body;
        const user = req.session.user;
        const role = (user && user.role) ? user.role.toLowerCase() : '';

        console.log(`BULK DELETE: userId=${userId} role=${role} count=${courseIds ? courseIds.length : 0}`);

        if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
            return res.status(400).json({ error: 'No courses selected.' });
        }

        // Filter valid ObjectIds to avoid CastError with dummy data IDs
        const validCourseIds = courseIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        
        if (validCourseIds.length === 0) {
            // If all selected were dummy data, just return success
            return res.json({ success: true, redirect: `/syllabus/${userId}` });
        }

        const filter = { _id: { $in: validCourseIds } };
        
        // Authorization check: Only restrict if user is NOT dean, admin, hr, or program chair
        const isAuthorized = ['dean', 'admin', 'hr', 'program-chair', 'program chair'].includes(role);
        
        if (!isAuthorized) {
            if (mongoose.Types.ObjectId.isValid(userId)) {
                filter.userID = userId;
            } else {
                return res.status(400).json({ error: 'Invalid user ID for deletion filter.' });
            }
        }

        const result = await Syllabus.deleteMany(filter);
        await SyllabusApprovalStatus.deleteMany({ syllabusID: { $in: validCourseIds } });
        await ProgramEducationObjectives.deleteMany({ syllabusID: { $in: validCourseIds } });
        await StudentEducationObjectives.deleteMany({ syllabusID: { $in: validCourseIds } });
        await CourseOutcomes.deleteMany({ syllabusID: { $in: validCourseIds } });
        await CourseMapping.deleteMany({ syllabusID: { $in: validCourseIds } });
        await WeeklySchedule.deleteMany({ syllabusID: { $in: validCourseIds } });
        await CourseEvaluationPerCO.deleteMany({ syllabusID: { $in: validCourseIds } });
        
        console.log(`DELETED ${result.deletedCount} courses and all related modules`);
        res.json({ success: true, redirect: `/syllabus/${userId}` });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: 'Error deleting courses: ' + error.message });
    }
});

export default coursesOverviewRouter;