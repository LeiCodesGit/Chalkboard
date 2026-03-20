import {
    TLA_Main,   TLA_B1,   TLA_B2,
    Status_Main,Status_B1,Status_B2,
    Pre_Main,   Pre_B1,   Pre_B2,
    Post_Main,  Post_B1,  Post_B2
} from '../models/TLA/tlaModels.js';
import Syllabus from '../models/Syllabus/syllabus.js';
import SyllabusApprovalStatus from '../models/Syllabus/syllabusApprovalStatus.js';
import WeeklySchedule from '../models/Syllabus/weeklySchedule.js';
import userSchema from '../models/user.js';
import { mainDB } from '../database/mongo-dbconnect.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import multer from 'multer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_TEMPLATE = join(__dirname, '../templates/TLA_TEMPLATE_BLANK.pdf');
const User = mainDB.model("User", userSchema);

// ── Signature file upload (PNG only, memory storage — saved as base64 in MongoDB) ──
export const signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },  // 2 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only PNG files are allowed for signatures.'));
        }
    }
});

// ===============================================================================
//  ROLE DEFINITIONS
// ===============================================================================

// Approval chain:  Professor → Program-Chair → Dean → HR/HRMO → VPAA (final)
// Technical & Practicum-Coordinator get view access only.
const APPROVAL_ROLES = [
    'Program-Chair', 'Dean', 'HR', 'HRMO', 'VPAA',
    'Technical', 'Practicum-Coordinator',
    'Admin', 'Super-Admin'
];

// ===============================================================================
//  MIDDLEWARE GUARDS
// ===============================================================================

export function requireLogin(req, res, next) {
    if (!req.session?.user) return res.redirect('/login');
    next();
}

export function requireApprovalRole(req, res, next) {
    const role = req.session?.user?.role;
    if (!role || !APPROVAL_ROLES.includes(role)) {
        return res.status(403).send('Forbidden - you do not have permission to access this page.');
    }
    next();
}

export function requireHRRole(req, res, next) {
    const role = req.session?.user?.role;
    if (!['HR', 'HRMO', 'Admin', 'Super-Admin'].includes(role)) {
        return res.status(403).send('Forbidden - HR role required.');
    }
    next();
}

// ===============================================================================
//  HELPERS
// ===============================================================================

function stripId(doc) {
    const d = doc.toObject ? doc.toObject() : { ...doc };
    delete d._id;
    return d;
}

function actorName(user) {
    if (!user) return 'Unknown';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown';
}

async function resolveOwnedSyllabusId(userId, syllabusId, courseCode) {
    if (syllabusId) {
        const byId = await Syllabus.findOne({
            _id: syllabusId,
            $or: [{ assignedInstructor: userId }, { userID: userId }]
        });
        if (byId) return byId._id.toString();
    }

    if (courseCode) {
        const byCourse = await Syllabus.findOne({
            courseCode,
            $or: [{ assignedInstructor: userId }, { userID: userId }]
        });
        if (byCourse) return byCourse._id.toString();
    }

    return '';
}

function hasNonEmptyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPostDigitalComplete(postLike) {
    if (!postLike) return false;
    return (
        hasNonEmptyText(postLike.moIloCode) &&
        hasNonEmptyText(postLike.participantTurnout) &&
        hasNonEmptyText(postLike.assessmentResults)
    );
}

// ===============================================================================
//  APPROVAL CHAIN LOGIC
//  Chain: Professor → Program-Chair → Dean → HR/HRMO → VPAA (final)
//  Statuses: Not Submitted → Pending → Chair-Approved → Dean-Approved →
//            Post-Pending → Post-Chair-Approved → Post-Dean-Approved →
//            HR-Approved → Approved | Returned
// ===============================================================================

// --- Determine step status labels for the UI tracker --------------------------
function buildApprovalSteps(tlaDoc, statusDoc, hasPostDigital = true) {
    const macroStatus = statusDoc?.status || 'Not Submitted';
    const stepDocs    = statusDoc || {};

    const dot = (stepStatus) => {
        if (!stepStatus) return 'pending';
        if (stepStatus === 'Approved') return 'approved';
        if (stepStatus === 'Returned') return 'rejected';
        if (stepStatus === 'Pending')  return 'ongoing';
        return 'pending';
    };

    // Faculty step
    const facultyDone = tlaDoc?.status && tlaDoc.status !== 'Draft';
    let facultyStep = facultyDone
        ? (macroStatus === 'Returned' ? 'rejected' : 'approved')
        : 'pending';

    // After Dean approval, faculty must complete post-digital before HR can proceed.
    if (macroStatus === 'Dean-Approved' && !hasPostDigital) {
        facultyStep = 'ongoing';
    }

    // Program Chair step
    let chairStep = 'pending';
    if (facultyDone) {
        if (macroStatus === 'Not Submitted') chairStep = 'pending';
        else if (macroStatus === 'Pending') chairStep = 'ongoing';
        else if (macroStatus === 'Post-Pending') chairStep = 'ongoing';
        else if (macroStatus === 'Returned' && !stepDocs.programChair?.approvalDate) chairStep = 'pending';
        else if (macroStatus === 'Post-Chair-Approved' || macroStatus === 'Post-Dean-Approved' || macroStatus === 'HR-Approved' || macroStatus === 'Approved') {
            chairStep = dot(stepDocs.programChairPost?.status);
        } else {
            chairStep = dot(stepDocs.programChair?.status);
        }
    }

    // Dean step
    let deanStep = 'pending';
    if (['Chair-Approved', 'Dean-Approved', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Approved'].includes(macroStatus)) {
        if (['Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Approved'].includes(macroStatus)) {
            deanStep = dot(stepDocs.deanPost?.status);
        } else {
            deanStep = dot(stepDocs.dean?.status);
        }
        if (macroStatus === 'Chair-Approved' && !stepDocs.dean?.status) deanStep = 'ongoing';
        if (macroStatus === 'Post-Chair-Approved' && !stepDocs.deanPost?.status) deanStep = 'ongoing';
    }

    // HR/HRMO step
    let hrStep = 'pending';
    if (['Post-Dean-Approved', 'HR-Approved', 'Approved'].includes(macroStatus)) {
        hrStep = dot(stepDocs.hr?.status);
        if (macroStatus === 'Post-Dean-Approved' && !stepDocs.hr?.status) hrStep = 'ongoing';
    }

    // VPAA step (final)
    let vpaaStep = 'pending';
    if (['HR-Approved', 'Approved'].includes(macroStatus)) {
        vpaaStep = dot(stepDocs.vpaa?.status);
        if (macroStatus === 'HR-Approved' && !stepDocs.vpaa?.status) vpaaStep = 'ongoing';
    }

    return {
        faculty:      facultyStep,
        programChair: chairStep,
        dean:         deanStep,
        hr:           hrStep,
        vpaa:         vpaaStep
    };
}

// --- Determine what action the current user can take --------------------------
function activeStep(role, macroStatus, hasPostDigital = true) {
    if (role === 'Program-Chair' && macroStatus === 'Pending')        return 'programChair';
    if (role === 'Dean'          && macroStatus === 'Chair-Approved') return 'dean';
    if (role === 'Program-Chair' && macroStatus === 'Post-Pending')        return 'programChairPost';
    if (role === 'Dean'          && macroStatus === 'Post-Chair-Approved') return 'deanPost';
    if (role === 'HR'            && macroStatus === 'Post-Dean-Approved')  return 'hr';
    if (role === 'HRMO'          && macroStatus === 'Post-Dean-Approved')  return 'hr';
    if (role === 'VPAA'          && macroStatus === 'HR-Approved')    return 'vpaa';

    // Admin/Super-Admin can act at whatever the current active step is
    if (['Admin', 'Super-Admin'].includes(role)) {
        if (macroStatus === 'Pending')        return 'programChair';
        if (macroStatus === 'Chair-Approved') return 'dean';
        if (macroStatus === 'Post-Pending')        return 'programChairPost';
        if (macroStatus === 'Post-Chair-Approved') return 'deanPost';
        if (macroStatus === 'Post-Dean-Approved')  return 'hr';
        if (macroStatus === 'HR-Approved')    return 'vpaa';
    }
    return null;
}

// --- Shared data-fetching helpers for admin pages -----------------------------

const ROLE_STATUS_FILTER = {
    'Program-Chair':          ['Pending', 'Post-Pending'],
    'Dean':                   ['Chair-Approved', 'Post-Chair-Approved'],
    'HR':                     ['Post-Dean-Approved'],
    'HRMO':                   ['Post-Dean-Approved'],
    'VPAA':                   ['HR-Approved'],
    'Technical':              ['Pending', 'Chair-Approved', 'Dean-Approved', 'Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Returned'],
    'Practicum-Coordinator':  ['Pending', 'Chair-Approved', 'Dean-Approved', 'Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Returned'],
    'Admin':                  ['Pending', 'Chair-Approved', 'Dean-Approved', 'Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Returned'],
    'Super-Admin':            ['Pending', 'Chair-Approved', 'Dean-Approved', 'Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Returned']
};

async function buildSubmissionList(role) {
    const allowedStatuses = ROLE_STATUS_FILTER[role] || [];
    const statusDocs = await Status_Main.find({
        status: { $in: allowedStatuses }
    }).sort({ updatedAt: -1 });

    let filteredStatusDocs = statusDocs;
    const tlaIDs = statusDocs.map(s => s.tlaID);

    // Backward compatibility: if old records still at Dean-Approved, require completed post-digital.
    if (['HR', 'HRMO'].includes(role) && tlaIDs.length) {
        const postDocs = await Post_Main.find({ tlaID: { $in: tlaIDs } });
        const postMap = {};
        for (const pd of postDocs) postMap[pd.tlaID.toString()] = pd;

        filteredStatusDocs = statusDocs.filter((sd) => {
            if (sd.status !== 'Dean-Approved') return true;
            return isPostDigitalComplete(postMap[sd.tlaID.toString()]);
        });
    }

    const filteredTlaIDs = filteredStatusDocs.map(s => s.tlaID);
    const tlas   = await TLA_Main.find({ _id: { $in: filteredTlaIDs } });

    const userIDs = [...new Set(tlas.map(t => t.userID?.toString()))];
    const users   = await User.find({ _id: { $in: userIDs } }, 'firstName lastName email department');
    const userMap = {};
    for (const u of users) userMap[u._id.toString()] = u;

    const tlaMap = {};
    for (const t of tlas) tlaMap[t._id.toString()] = t;

    // Keep the same order as filteredStatusDocs (already sorted updatedAt desc)
    return filteredStatusDocs
        .map((sd) => {
            const t = tlaMap[sd.tlaID.toString()];
            if (!t) return null;
            const faculty = userMap[t.userID?.toString()];
            return {
                _id:         t._id,
                courseCode:  t.courseCode,
                section:     t.section,
                weekNumber:  t.weekNumber,
                dateofDigitalDay: t.dateofDigitalDay,
                facultyName: faculty ? `${faculty.firstName} ${faculty.lastName}` : '—',
                department:  faculty?.department || '—',
                macroStatus: sd?.status || '—',
                updatedAt:   sd?.updatedAt || t.updatedAt
            };
        })
        .filter(Boolean);
}

async function buildArchiveData() {
    const statusDocs = await Status_Main.find({
        status: { $in: ['Approved'] }
    }).sort({ updatedAt: -1 });

    const tlaIDs = statusDocs.map(s => s.tlaID);
    const tlas   = await TLA_Main.find({ _id: { $in: tlaIDs } });

    const userIDs = [...new Set(tlas.map(t => t.userID?.toString()))];
    const users   = await User.find({ _id: { $in: userIDs } }, 'firstName lastName email department');
    const userMap = {};
    for (const u of users) userMap[u._id.toString()] = u;

    const toArchive = [];
    const archived  = [];
    const tlaMap = {};
    for (const t of tlas) tlaMap[t._id.toString()] = t;

    // Keep latest-first order from statusDocs
    for (const sd of statusDocs) {
        const t = tlaMap[sd.tlaID.toString()];
        if (!t) continue;
        const faculty = userMap[t.userID?.toString()];
        const entry   = {
            _id:         t._id,
            courseCode:  t.courseCode,
            section:     t.section,
            weekNumber:  t.weekNumber,
            facultyName: faculty ? `${faculty.firstName} ${faculty.lastName}` : '—',
            department:  faculty?.department || '—',
            deanApprovedAt:  sd?.dean?.approvalDate || null,
            hrApprovedAt:    sd?.hr?.approvalDate   || null,
            vpaaApprovedAt:  sd?.vpaa?.approvalDate || null,
            macroStatus: sd?.status || '—'
        };
        // "Approved" = VPAA has given final approval; treat as archived
        archived.push(entry);
    }
    return { toArchive, archived };
}

// ===============================================================================
//  COURSES PAGE (pulls from Syllabus database)
// ===============================================================================

export async function getCourses(req, res) {
    try {
        const user = req.session.user;

        if (APPROVAL_ROLES.includes(user?.role)) {
            return res.redirect('/admin/tla');
        }

        const userId = user?.id;

        // Only show courses assigned to the logged-in faculty (or created by them)
        const syllabi = await Syllabus.find({
            $or: [
                { assignedInstructor: userId },
                { userID: userId }
            ]
        });
        const syllabusIds = syllabi.map(s => s._id.toString());
        
        // Get approval status for each syllabus
        const approvals = await SyllabusApprovalStatus.find({ syllabusID: { $in: syllabusIds } });
        const statusMap = {};
        approvals.forEach(a => {
            statusMap[a.syllabusID.toString()] = a.status;
        });

        // Format courses with lock status and images
        const courses = syllabi.map(s => {
            const idStr = s._id.toString();
            const status = statusMap[idStr] || 'Not Submitted';
            // Lock if status is NOT Approved or Archived
            const isLocked = !['Approved', 'Archived'].includes(status);
            
            // Determine image: Base64 if exists, otherwise picsum fallback
            let courseImage;
            let hasRealImage = false;
            if (s.courseImage && s.courseImage.startsWith('data:')) {
                courseImage = s.courseImage;
                hasRealImage = true;
            } else {
                courseImage = `https://picsum.photos/seed/${s._id}/400/200`;
                hasRealImage = false;
            }
            
            return {
                syllabusId: idStr,
                courseCode: s.courseCode || 'N/A',
                courseTitle: s.courseTitle || 'Untitled Course',
                section: s.assignedInstructor ? `Section` : 'TBA',
                term: s.term || 'N/A',
                schoolYear: s.schoolYear || 'N/A',
                status,
                isLocked,
                courseImage,
                hasBanner: true,  // Always true since we have image (Base64 or fallback)
                hasRealImage      // True only if Base64 from Syllabus
            };
        });

        res.render('TLA/tlaCourses', {
            currentPageCategory: 'tla',
            user,
            courses
        });
    } catch (error) {
        console.error('getCourses error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  DASHBOARD  (Faculty's own TLA weeks)
// ===============================================================================

export async function getDashboard(req, res) {
    try {
        const userID = req.session.user.id;
        const tlas   = await TLA_Main.find({ userID }).sort({ weekNumber: 1 });
        const tlaIDs = tlas.map(t => t._id);
        const statuses = await Status_Main.find({ tlaID: { $in: tlaIDs } });

        const statusMap = {};
        for (const s of statuses) statusMap[s.tlaID.toString()] = s.status;

        const weeks = tlas.map(t => ({
            _id:             t._id,
            weekNumber:      t.weekNumber,
            courseCode:      t.courseCode,
            section:         t.section,
            dateofDigitalDay:t.dateofDigitalDay,
            status:          statusMap[t._id.toString()] || 'Not Submitted'
        }));

        res.render('TLA/tlaDashboard', {
            currentPageCategory: 'tla',
            user: req.session.user,
            weeks
        });
    } catch (error) {
        console.error('getDashboard error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  TLA FORM (GET new / GET existing)
// ===============================================================================

export async function getNewForm(req, res) {
    try {
        const userId = req.session.user.id;
        const syllabusId = req.query.syllabusId || '';
        const parsedWeek = Number(req.query.week);
        const prefillWeekNumber = Number.isInteger(parsedWeek) && parsedWeek >= 1 && parsedWeek <= 18
            ? parsedWeek
            : '';
        let prefillCourseCode = '';

        if (syllabusId) {
            const syllabus = await Syllabus.findById(syllabusId);
            if (syllabus) {
                const belongsToUser =
                    String(syllabus.assignedInstructor || '') === String(userId) ||
                    String(syllabus.userID || '') === String(userId);

                if (belongsToUser) {
                    prefillCourseCode = syllabus.courseCode || '';
                }
            }
        }

        res.render('TLA/tlaForm', {
            currentPageCategory: 'tla',
            user: req.session.user,
            tla: null,
            preDigital: null,
            postDigital: null,
            status: null,
            syllabusId,
            prefillCourseCode,
            prefillWeekNumber
        });
    } catch (error) {
        console.error('getNewForm error:', error);
        res.status(500).send('Server error');
    }
}

export async function getFormById(req, res) {
    try {
        const tla = await TLA_Main.findById(req.params.id);
        if (!tla) return res.status(404).send('TLA not found');

        // Owner or any approval role may view the form (read-only for approvers)
        if (tla.userID.toString() !== req.session.user.id && !APPROVAL_ROLES.includes(req.session.user.role)) {
            return res.status(403).send('Forbidden');
        }

        const [preDigital, postDigital, status] = await Promise.all([
            Pre_Main.findOne({ tlaID: tla._id }),
            Post_Main.findOne({ tlaID: tla._id }).lean(),   // .lean() so 'accessible' field is preserved
            Status_Main.findOne({ tlaID: tla._id })
        ]);

        let syllabusId = req.query.syllabusId || (tla.syllabusID ? tla.syllabusID.toString() : '');
        if (!syllabusId) {
            syllabusId = await resolveOwnedSyllabusId(req.session.user.id, '', tla.courseCode);
        }

        // Backfill legacy records once we resolve the owning syllabus.
        if (syllabusId && !tla.syllabusID) {
            await Promise.all([
                TLA_Main.findByIdAndUpdate(tla._id, { syllabusID: syllabusId }),
                TLA_B1.findByIdAndUpdate(tla._id, { syllabusID: syllabusId }),
                TLA_B2.findByIdAndUpdate(tla._id, { syllabusID: syllabusId })
            ]);
        }

        res.render('TLA/tlaForm', {
            currentPageCategory: 'tla',
            user: req.session.user,
            tla,
            preDigital:  preDigital  || null,
            postDigital: postDigital || null,
            status:      status      || null,
            syllabusId,
            prefillCourseCode: ''
        });
    } catch (error) {
        console.error('getFormById error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  TLA FORM (POST create)
// ===============================================================================

export async function createTLA(req, res) {
    try {
        const {
            courseCode, section, dateofDigitalDay, facultyFacilitating,
            courseOutcomes, mediatingOutcomes, weekNumber,
            pre_moIloCode, pre_teacherLearningActivity, pre_lmsDigitalTool, pre_assessment,
            action, syllabusId, professorSignature, professorPreSignature, professorPostSignature
        } = req.body;

        const userID    = req.session.user.id;
        const resolvedSyllabusId = await resolveOwnedSyllabusId(userID, syllabusId, courseCode);
        const tlaStatus = action === 'submit' ? 'Pending' : 'Draft';

        const newTLA = await TLA_Main.create({
            courseCode, section, dateofDigitalDay, facultyFacilitating,
            courseOutcomes, mediatingOutcomes,
            weekNumber: weekNumber || null,
            professorPreSignature: professorPreSignature || professorSignature || '',
            professorPostSignature: professorPostSignature || '',
            professorSignature: professorPreSignature || professorSignature || '',
            syllabusID: resolvedSyllabusId || undefined,
            userID, status: tlaStatus
        });
        const tlaBackup = stripId(newTLA);
        await Promise.all([ TLA_B1.create(tlaBackup), TLA_B2.create(tlaBackup) ]);

        const preDoc = await Pre_Main.create({
            tlaID: newTLA._id,
            moIloCode:               pre_moIloCode,
            teacherLearningActivity: pre_teacherLearningActivity,
            lmsDigitalTool:          pre_lmsDigitalTool,
            assessment:              pre_assessment
        });
        await Promise.all([ Pre_B1.create(stripId(preDoc)), Pre_B2.create(stripId(preDoc)) ]);

        const macroStatus = action === 'submit' ? 'Pending' : 'Not Submitted';
        const statusDoc = await Status_Main.create({
            tlaID:  newTLA._id,
            status: macroStatus
        });
        await Promise.all([ Status_B1.create(stripId(statusDoc)), Status_B2.create(stripId(statusDoc)) ]);

        if (resolvedSyllabusId) {
            return res.redirect('/tla/overview/' + resolvedSyllabusId);
        }
        res.redirect('/tla/overview');
    } catch (error) {
        console.error('createTLA error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  TLA FORM (POST update)
// ===============================================================================

export async function updateTLA(req, res) {
    try {
        const { id } = req.params;
        const {
            courseCode, section, dateofDigitalDay, facultyFacilitating,
            courseOutcomes, mediatingOutcomes, weekNumber,
            pre_moIloCode, pre_teacherLearningActivity, pre_lmsDigitalTool, pre_assessment,
            post_moIloCode, post_participantTurnout, post_assessmentResults, post_remarks,
            action, syllabusId, professorSignature, professorPreSignature, professorPostSignature
        } = req.body;

        const tla = await TLA_Main.findById(id);
        if (!tla) return res.status(404).send('TLA not found');

        if (tla.userID.toString() !== req.session.user.id) {
            return res.status(403).send('Forbidden');
        }

        if (tla.status === 'Approved' || tla.status === 'Archived') {
            return res.status(403).send('Cannot edit a finalized TLA');
        }

        const resolvedSyllabusId = await resolveOwnedSyllabusId(
            req.session.user.id,
            syllabusId || (tla.syllabusID ? tla.syllabusID.toString() : ''),
            courseCode || tla.courseCode
        );

        const isPostSubmit = action === 'submit-post';
        const isSubmit     = action === 'submit';
        const isDraft      = action === 'draft';
        const isInChain    = ['Pending', 'Chair-Approved', 'Dean-Approved', 'Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved'].includes(tla.status);

        if (isPostSubmit) {
            const approvalStatus = await Status_Main.findOne({ tlaID: id });
            const preDigitalApproved = approvalStatus?.programChair?.status === 'Approved';
            if (!preDigitalApproved) {
                return res.status(403).send('Post-digital submission is only allowed after Pre-Digital Session is approved by Program Chair.');
            }

            const postDraft = {
                moIloCode: post_moIloCode,
                participantTurnout: post_participantTurnout,
                assessmentResults: post_assessmentResults
            };
            if (!isPostDigitalComplete(postDraft)) {
                return res.status(400).send('Please complete MO/ILO Code, Participant Turnout, and Assessment Results before submitting post-digital.');
            }

            const postCycleReset = {
                status: 'Post-Pending',
                programChairPost: { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '', signatureImage: '' },
                deanPost: { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '', signatureImage: '' }
            };

            await Promise.all([
                Status_Main.findOneAndUpdate({ tlaID: id }, { $set: postCycleReset }, { upsert: true }),
                Status_B1.findOneAndUpdate({ tlaID: id }, { $set: postCycleReset }, { upsert: true }),
                Status_B2.findOneAndUpdate({ tlaID: id }, { $set: postCycleReset }, { upsert: true })
            ]);

            await Promise.all([
                TLA_Main.findByIdAndUpdate(id, { status: 'Post-Pending' }),
                TLA_B1.findByIdAndUpdate(id,   { status: 'Post-Pending' }),
                TLA_B2.findByIdAndUpdate(id,   { status: 'Post-Pending' })
            ]);

            // Persist post professor signature from form payload as a safety net.
            // This prevents losing the post signature in PDF after redirect/reload.
            if (professorPostSignature && typeof professorPostSignature === 'string' && professorPostSignature.startsWith('data:image/')) {
                const postSigUpdate = { professorPostSignature };
                await Promise.all([
                    TLA_Main.findByIdAndUpdate(id, postSigUpdate),
                    TLA_B1.findByIdAndUpdate(id,   postSigUpdate),
                    TLA_B2.findByIdAndUpdate(id,   postSigUpdate)
                ]);
            }

            // Lock post-digital section so professor cannot edit while awaiting post approvals.
            const lockPost = { $set: { accessible: false } };
            await Promise.all([
                Post_Main.findOneAndUpdate({ tlaID: id }, lockPost, { upsert: true }),
                Post_B1.findOneAndUpdate({ tlaID: id },  lockPost, { upsert: true }),
                Post_B2.findOneAndUpdate({ tlaID: id },  lockPost, { upsert: true })
            ]);
        }

        let tlaStatus = tla.status;
        if (isDraft && !isInChain)  tlaStatus = 'Draft';
        if (isSubmit && !isInChain) tlaStatus = 'Pending';

        if (!isPostSubmit) {
            const tlaUpdate = {
                courseCode, section, dateofDigitalDay, facultyFacilitating,
                courseOutcomes, mediatingOutcomes,
                weekNumber: weekNumber || null,
                professorPreSignature: professorPreSignature || professorSignature || tla.professorPreSignature || tla.professorSignature || '',
                professorPostSignature: professorPostSignature || tla.professorPostSignature || '',
                professorSignature: professorPreSignature || professorSignature || tla.professorPreSignature || tla.professorSignature || '',
                syllabusID: resolvedSyllabusId || tla.syllabusID || undefined,
                status: tlaStatus
            };
            await Promise.all([
                TLA_Main.findByIdAndUpdate(id, tlaUpdate),
                TLA_B1.findByIdAndUpdate(id, tlaUpdate),
                TLA_B2.findByIdAndUpdate(id, tlaUpdate)
            ]);

            const preUpdate = {
                tlaID: id,
                moIloCode:               pre_moIloCode,
                teacherLearningActivity: pre_teacherLearningActivity,
                lmsDigitalTool:          pre_lmsDigitalTool,
                assessment:              pre_assessment
            };
            await Promise.all([
                Pre_Main.findOneAndUpdate({ tlaID: id }, preUpdate, { upsert: true }),
                Pre_B1.findOneAndUpdate({ tlaID: id }, preUpdate, { upsert: true }),
                Pre_B2.findOneAndUpdate({ tlaID: id }, preUpdate, { upsert: true })
            ]);
        }


        if (isSubmit || isPostSubmit || isInChain) {
            const postUpdate = {
                tlaID: id,
                moIloCode:         post_moIloCode,
                participantTurnout:post_participantTurnout,
                assessmentResults: post_assessmentResults,
                remarks:           post_remarks
            };
            // Ensure we don't accidentally overwrite the accessible: false flag set during submit-post
            if (isPostSubmit) postUpdate.accessible = false;

            const finalUpdate = { $set: postUpdate };

            await Promise.all([
                Post_Main.findOneAndUpdate({ tlaID: id }, finalUpdate, { upsert: true }),
                Post_B1.findOneAndUpdate({ tlaID: id }, finalUpdate, { upsert: true }),
                Post_B2.findOneAndUpdate({ tlaID: id }, finalUpdate, { upsert: true })
            ]);
        }

        // If faculty re-submits after a Returned verdict, reset to Pending
        if (isSubmit && tlaStatus === 'Pending') {
            const statusReset = {
                status:       'Pending',
                programChair: { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '' },
                dean:         { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '' },
                programChairPost: { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '', signatureImage: '' },
                deanPost:         { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '', signatureImage: '' },
                hr:           { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '' },
                vpaa:         { status: 'Pending', approvedBy: '', approvalDate: null, remarks: '' }
            };
            await Promise.all([
                Status_Main.findOneAndUpdate({ tlaID: id }, statusReset, { upsert: true }),
                Status_B1.findOneAndUpdate({ tlaID: id }, statusReset, { upsert: true }),
                Status_B2.findOneAndUpdate({ tlaID: id }, statusReset, { upsert: true })
            ]);
        } else if (isDraft && !isInChain) {
            const statusUpdate = { status: 'Not Submitted' };
            await Promise.all([
                Status_Main.findOneAndUpdate({ tlaID: id }, statusUpdate, { upsert: true }),
                Status_B1.findOneAndUpdate({ tlaID: id }, statusUpdate, { upsert: true }),
                Status_B2.findOneAndUpdate({ tlaID: id }, statusUpdate, { upsert: true })
            ]);
        }

        if (resolvedSyllabusId && !tla.syllabusID) {
            await Promise.all([
                TLA_Main.findByIdAndUpdate(id, { syllabusID: resolvedSyllabusId }),
                TLA_B1.findByIdAndUpdate(id,   { syllabusID: resolvedSyllabusId }),
                TLA_B2.findByIdAndUpdate(id,   { syllabusID: resolvedSyllabusId })
            ]);
        }

        if (resolvedSyllabusId) {
            return res.redirect('/tla/overview/' + resolvedSyllabusId);
        }
        res.redirect('/tla/overview');
    } catch (error) {
        console.error('updateTLA error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  OVERVIEW — Faculty's own weekly cards
// ===============================================================================

export async function getOverview(req, res) {
    try {
        const userID   = req.session.user.id;
        const userRole = req.session.user.role;

        if (APPROVAL_ROLES.includes(userRole)) {
            return res.redirect('/admin/tla');
        }

        const sid = req.params.syllabusId;
        let courseInfo = {
            syllabusId: null,
            courseCode: 'N/A',
            courseTitle: 'Untitled Course',
            section: 'TBA',
            schoolYear: 'N/A',
            term: 'N/A',
            courseImage: null,
            status: 'Not Submitted',
            isLocked: true
        };

        // If syllabusId provided, fetch from database
        if (sid) {
            const syllabus = await Syllabus.findById(sid);
            if (syllabus) {
                const belongsToUser =
                    String(syllabus.assignedInstructor || '') === String(userID) ||
                    String(syllabus.userID || '') === String(userID);

                if (!belongsToUser) {
                    return res.status(403).send('Forbidden - you are not assigned to this course.');
                }

                const approval = await SyllabusApprovalStatus.findOne({ syllabusID: sid });
                const status = approval?.status || 'Not Submitted';
                const isLocked = !['Approved', 'Archived'].includes(status);

                courseInfo = {
                    syllabusId: sid,
                    courseCode: syllabus.courseCode || 'N/A',
                    courseTitle: syllabus.courseTitle || 'Untitled Course',
                    section: 'Section',
                    schoolYear: syllabus.schoolYear || 'N/A',
                    term: syllabus.term || 'N/A',
                    courseImage: (syllabus.courseImage && syllabus.courseImage.startsWith('data:'))
                        ? syllabus.courseImage
                        : `https://picsum.photos/seed/${sid}/400/200`,
                    status,
                    isLocked
                };
            }
        }

        const tlaQuery = { userID };
        if (courseInfo.syllabusId) {
            tlaQuery.$or = [
                { syllabusID: courseInfo.syllabusId },
                { courseCode: courseInfo.courseCode }
            ];
        }

        const tlas = await TLA_Main.find(tlaQuery).sort({ weekNumber: 1 });
        const tlaIDs = tlas.map(t => t._id);
        const statuses = await Status_Main.find({ tlaID: { $in: tlaIDs } });

        const statusMap = {};
        for (const s of statuses) statusMap[s.tlaID.toString()] = s.status;

        const weekMap = {};
        for (const t of tlas) {
            if (t.weekNumber) {
                weekMap[t.weekNumber] = {
                    _id:    t._id,
                    status: statusMap[t._id.toString()] || 'Not Submitted'
                };
            }
        }

        let syllabusWeeks = [];
        if (courseInfo.syllabusId) {
            syllabusWeeks = await WeeklySchedule.find({ syllabusID: courseInfo.syllabusId });
        }
        const activeSyllabusWeekMap = {};
        for (const sw of syllabusWeeks) {
            if (sw.week) activeSyllabusWeekMap[sw.week] = sw.dateCovered || '';
        }

        const weeks = [];
        for (let w = 1; w <= 14; w++) {
            const dCov = activeSyllabusWeekMap[w] || '';
            if (weekMap[w]) {
                weeks.push({ weekNumber: w, _id: weekMap[w]._id, status: weekMap[w].status, dateCovered: dCov });
            } else {
                weeks.push({ weekNumber: w, _id: null, status: 'Not Submitted', dateCovered: dCov });
            }
        }

        const isApprover = APPROVAL_ROLES.includes(userRole);

        res.render('TLA/tlaOverview', {
            currentPageCategory: 'tla',
            user: req.session.user,
            weeks,
            courseInfo,
            isApprover,
            role: userRole
        });
    } catch (error) {
        console.error('getOverview error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  APPROVAL PAGE  (GET)
//  GET /tla/approval/:id
// ===============================================================================

export async function getApprovalPage(req, res) {
    try {
        const tlaID   = req.params.id;
        const role    = req.session.user.role;

        // -- No ID -> static placeholder preview ---------------------------
        if (!tlaID) {
            return res.render('TLA/tlaApproval', {
                currentPageCategory: 'tla',
                user:             req.session.user,
                courseName:       '[COURSE NAME]',
                courseCode:       '[COURSE CODE]',
                section:          '[COURSE SECTION]',
                academicYear:     '[ACADEMIC YEAR]',
                fileType:         '[FILE TYPE]',
                tla:              null,
                preDigital:       null,
                postDigital:      null,
                facultyName:      '—',
                approvalSteps:    null,
                approvalStatusId: null,
                approvalHistory:  [],
                currentStatus:    'Pending',
                macroStatus:      'Pending',
                existingComment:  '',
                signatureUrl:     null,
                activeStep:       null,
                stepData:         null
            });
        }

        const tla = await TLA_Main.findById(tlaID);
        if (!tla) return res.status(404).send('TLA not found');

        const [preDigital, postDigital, approvalStatus] = await Promise.all([
            Pre_Main.findOne({ tlaID: tla._id }),
            Post_Main.findOne({ tlaID: tla._id }),
            Status_Main.findOne({ tlaID: tla._id })
        ]);

        const hasPostDigital = isPostDigitalComplete(postDigital);
        const approvalSteps  = buildApprovalSteps(tla, approvalStatus, hasPostDigital);
        const macroStatus    = approvalStatus?.status || 'Not Submitted';
        const userActiveStep = activeStep(role, macroStatus, hasPostDigital);
        const isPostCycle = ['Post-Pending', 'Post-Chair-Approved', 'Post-Dean-Approved', 'HR-Approved', 'Approved'].includes(macroStatus);

        // Build approval history for audit trail
        const approvalHistory = [];
        const stepNames = { programChair: 'Program Chair', dean: 'Dean', hr: 'HR/HRMO', vpaa: 'VPAA' };
        for (const [key, label] of Object.entries(stepNames)) {
            const sd = approvalStatus?.[key];
            if (sd?.approvalDate) {
                approvalHistory.push({
                    approverRole:    label,
                    approverName:    sd.approvedBy || label,
                    approvalStatus:  sd.status,
                    date:            sd.approvalDate,
                    remarks:         sd.remarks || ''
                });
            }
        }
        approvalHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Pull this role's current step data for prefilling
        let stepData = null;
        if (userActiveStep && approvalStatus?.[userActiveStep]) {
            stepData = approvalStatus[userActiveStep];
        }

        res.render('TLA/tlaApproval', {
            currentPageCategory: 'tla',
            user:             req.session.user,
            courseName:       tla.courseCode || '[COURSE NAME]',
            courseCode:       tla.courseCode || '[COURSE CODE]',
            section:          tla.section    || '[COURSE SECTION]',
            academicYear:     '2025-2026',
            fileType:         'TLA',
            tla,
            preDigital:       preDigital  || null,
            postDigital:      postDigital || null,
            facultyName:      tla.facultyFacilitating || '—',
            approvalSteps,
            approvalStatusId: approvalStatus ? approvalStatus._id : null,
            approvalHistory,
            currentStatus:    approvalStatus ? approvalStatus.status : 'Not Submitted',
            macroStatus,
            existingComment:  stepData?.remarks || '',
            signatureUrl:     stepData?.signatureImage || null,
            activeStep:       userActiveStep,
            stepData,
            chairStep:        isPostCycle ? (approvalStatus?.programChairPost || null) : (approvalStatus?.programChair || null),
            deanStep:         isPostCycle ? (approvalStatus?.deanPost || null) : (approvalStatus?.dean || null)
        });
    } catch (error) {
        console.error('getApprovalPage error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  APPROVAL ACTION  (POST)
//  POST /tla/approval/:id
//  Body: { comment, verdict ("Approved"|"Returned"), action ("submit"|"draft") }
// ===============================================================================

export async function postApprovalAction(req, res) {
    try {
        const tlaID = req.params.id;
        const { comment, verdict, action, signatureImage } = req.body;
        const role   = req.session.user.role;
        const actor  = actorName(req.session.user);
        const safeSignature = (typeof signatureImage === 'string' && signatureImage.startsWith('data:image'))
            ? signatureImage
            : '';

        const tla = await TLA_Main.findById(tlaID);
        if (!tla) return res.status(404).json({ error: 'TLA not found' });

        const [statusDoc, postDigital] = await Promise.all([
            Status_Main.findOne({ tlaID }),
            Post_Main.findOne({ tlaID })
        ]);
        const ensuredStatusDoc = statusDoc ||
                          await Status_Main.create({ tlaID, status: 'Not Submitted' });

        const macroNow  = ensuredStatusDoc.status;
        const hasPostDigital = isPostDigitalComplete(postDigital);
        const step      = activeStep(role, macroNow, hasPostDigital);

        // -- Draft save: just store the comment without advancing the chain --
        if (action === 'draft' && step) {
            const draftUpdate = {
                [`${step}.remarks`]: comment || '',
                ...(safeSignature ? { [`${step}.signatureImage`]: safeSignature } : {})
            };
            await Promise.all([
                Status_Main.findOneAndUpdate({ tlaID }, { $set: draftUpdate }),
                Status_B1.findOneAndUpdate({ tlaID },  { $set: draftUpdate }),
                Status_B2.findOneAndUpdate({ tlaID },  { $set: draftUpdate })
            ]);

            if (req.headers['content-type']?.includes('application/json')) {
                return res.json({ success: true, message: 'Draft saved.' });
            }
            return res.redirect('/tla/approval/' + tlaID);
        }

        // -- Actual verdict submission -------------------------------------
        if (action === 'submit' && step) {
            if (!verdict || !['Approved', 'Returned'].includes(verdict)) {
                const msg = 'Invalid verdict. Must be "Approved" or "Returned".';
                if (req.headers['content-type']?.includes('application/json')) {
                    return res.status(400).json({ error: msg });
                }
                return res.status(400).send(msg);
            }

            // Compute next macro status
            let nextMacro = macroNow;
            let nextTlaStatus = tla.status;

            if (verdict === 'Returned') {
                nextMacro     = 'Returned';
                nextTlaStatus = 'Returned';
            } else {
                // Approved — advance the chain:
                // Program-Chair → Dean → HR/HRMO → VPAA (final)
                const advanceMap = {
                    programChair: 'Chair-Approved',
                    dean:         'Dean-Approved',
                    programChairPost: 'Post-Chair-Approved',
                    deanPost:         'Post-Dean-Approved',
                    hr:           'HR-Approved',
                    vpaa:         'Approved'
                };
                nextMacro = advanceMap[step] || macroNow;

                if (step === 'vpaa') {
                    nextTlaStatus = 'Approved';
                } else if (step === 'hr') {
                    nextTlaStatus = 'HR-Approved';
                } else if (step === 'deanPost') {
                    nextTlaStatus = 'Post-Dean-Approved';
                } else if (step === 'programChairPost') {
                    nextTlaStatus = 'Post-Chair-Approved';
                } else if (step === 'dean') {
                    nextTlaStatus = 'Dean-Approved';
                } else if (step === 'programChair') {
                    nextTlaStatus = 'Chair-Approved';
                }
            }

            const now         = new Date();
            const stepUpdate  = {
                [`${step}.status`]:      verdict,
                [`${step}.approvedBy`]:  actor,
                [`${step}.approvalDate`]:now,
                [`${step}.remarks`]:     comment || '',
                [`${step}.signatureImage`]: safeSignature,
                status: nextMacro,
                approvedBy:   actor,
                approvalDate: now,
                remarks:      comment || ''
            };

            await Promise.all([
                Status_Main.findOneAndUpdate({ tlaID }, { $set: stepUpdate }, { upsert: true }),
                Status_B1.findOneAndUpdate({ tlaID },  { $set: stepUpdate }, { upsert: true }),
                Status_B2.findOneAndUpdate({ tlaID },  { $set: stepUpdate }, { upsert: true }),
                TLA_Main.findByIdAndUpdate(tlaID, { status: nextTlaStatus }),
                TLA_B1.findByIdAndUpdate(tlaID,   { status: nextTlaStatus }),
                TLA_B2.findByIdAndUpdate(tlaID,   { status: nextTlaStatus })
            ]);

            // When Program-Chair approves Pre-Digital, unlock Post-Digital Session
            if (step === 'programChair' && verdict === 'Approved') {
                const accessFlag = { $set: { accessible: true } };
                const upsertOpts = { upsert: true, strict: false };
                await Promise.all([
                    Post_Main.findOneAndUpdate({ tlaID }, accessFlag, upsertOpts),
                    Post_B1.findOneAndUpdate({ tlaID },  accessFlag, upsertOpts),
                    Post_B2.findOneAndUpdate({ tlaID },  accessFlag, upsertOpts)
                ]);
            }

            // When a POST-chain approver (Chair or Dean) returns the TLA,
            // re-unlock the post-digital section so the professor can edit and resubmit.
            if (['programChairPost', 'deanPost'].includes(step) && verdict === 'Returned') {
                const reopenFlag = { $set: { accessible: true } };
                const upsertOpts = { upsert: true, strict: false };
                await Promise.all([
                    Post_Main.findOneAndUpdate({ tlaID }, reopenFlag, upsertOpts),
                    Post_B1.findOneAndUpdate({ tlaID },  reopenFlag, upsertOpts),
                    Post_B2.findOneAndUpdate({ tlaID },  reopenFlag, upsertOpts)
                ]);
            }

            if (req.headers['content-type']?.includes('application/json')) {
                return res.json({ success: true, status: nextMacro, verdict });
            }
            return res.redirect('/tla/approval/' + tlaID);
        }

        // -- Fallback: no matching action ----------------------------------
        if (req.headers['content-type']?.includes('application/json')) {
            return res.status(400).json({ error: 'Invalid action or role not authorised for current step.' });
        }
        res.redirect('/tla/approval/' + tlaID);

    } catch (error) {
        console.error('postApprovalAction error:', error);
        if (req.headers['content-type']?.includes('application/json')) {
            return res.status(500).json({ error: 'Server error' });
        }
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  HR ARCHIVE ACTION  (POST)
//  POST /admin/tla/archive/:id  — Admin manually archives a fully-approved TLA
// ===============================================================================

export async function postHRArchive(req, res) {
    try {
        const tlaID  = req.params.id;
        const actor  = actorName(req.session.user);
        const { comment } = req.body;
        const now    = new Date();

        const stepUpdate = {
            status:           'Approved',
            approvedBy:       actor,
            approvalDate:     now,
            remarks:          comment || ''
        };

        await Promise.all([
            Status_Main.findOneAndUpdate({ tlaID }, { $set: stepUpdate }, { upsert: true }),
            Status_B1.findOneAndUpdate({ tlaID },  { $set: stepUpdate }, { upsert: true }),
            Status_B2.findOneAndUpdate({ tlaID },  { $set: stepUpdate }, { upsert: true }),
            TLA_Main.findByIdAndUpdate(tlaID, { status: 'Approved' }),
            TLA_B1.findByIdAndUpdate(tlaID,   { status: 'Approved' }),
            TLA_B2.findByIdAndUpdate(tlaID,   { status: 'Approved' })
        ]);

        res.redirect('/admin/tla');
    } catch (error) {
        console.error('postHRArchive error:', error);
        res.status(500).send('Server error');
    }
}

// ===============================================================================
//  PROFESSOR SIGNATURE UPLOAD  (POST)
//  POST /tla/form/:id/signature
//  Body (JSON): { signatureImage: "data:image/png;base64,...", signatureType }
//  PNG only.
// ===============================================================================

export async function uploadSignature(req, res) {
    try {
        const { id } = req.params;
        const { signatureImage, signatureType } = req.body;

        const tla = await TLA_Main.findById(id);
        if (!tla) return res.status(404).json({ error: 'TLA not found' });

        if (tla.userID.toString() !== req.session.user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Validate PNG data URL only
        if (!signatureImage || typeof signatureImage !== 'string' || !signatureImage.startsWith('data:image/png')) {
            return res.status(400).json({ error: 'Only PNG images are accepted for signatures.' });
        }

        // Size guard: ~2 MB base64 limit
        if (signatureImage.length > 2_800_000) {
            return res.status(400).json({ error: 'Signature image is too large. Maximum 2 MB.' });
        }

        const normalizedType = signatureType === 'post' ? 'post' : 'pre';
        const updateFields = normalizedType === 'post'
            ? { professorPostSignature: signatureImage }
            : { professorPreSignature: signatureImage, professorSignature: signatureImage };

        await Promise.all([
            TLA_Main.findByIdAndUpdate(id, updateFields),
            TLA_B1.findByIdAndUpdate(id,   updateFields),
            TLA_B2.findByIdAndUpdate(id,   updateFields)
        ]);

        return res.json({ success: true, message: 'Signature uploaded successfully.' });
    } catch (error) {
        console.error('uploadSignature error:', error);
        res.status(500).json({ error: 'Server error' });
    }
}

// ===============================================================================
//  PROFESSOR SIGNATURE FILE UPLOAD  (POST)
//  POST /tla/form/:id/signature-file
//  Multipart form: file field "signatureFile" (PNG only), field "signatureType"
//  Stores the file on disk and saves a data:image/png;base64 data URL to the TLA
//  so the existing PDF rendering pipeline picks it up with zero changes.
// ===============================================================================

export async function uploadSignatureFile(req, res) {
    try {
        const { id } = req.params;

        const tla = await TLA_Main.findById(id);
        if (!tla) return res.status(404).json({ error: 'TLA not found' });

        if (tla.userID.toString() !== req.session.user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Please upload a PNG signature.' });
        }

        // Convert in-memory buffer to base64 data URL — no disk write needed.
        const dataUrl = `data:image/png;base64,${req.file.buffer.toString('base64')}`;

        const normalizedType = req.body.signatureType === 'post' ? 'post' : 'pre';
        const updateFields = normalizedType === 'post'
            ? { professorPostSignature: dataUrl }
            : { professorPreSignature: dataUrl, professorSignature: dataUrl };

        await Promise.all([
            TLA_Main.findByIdAndUpdate(id, updateFields),
            TLA_B1.findByIdAndUpdate(id,   updateFields),
            TLA_B2.findByIdAndUpdate(id,   updateFields)
        ]);

        return res.json({ success: true, message: 'Signature uploaded successfully.' });
    } catch (error) {
        console.error('uploadSignatureFile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
}

// ===============================================================================
//  PDF GENERATION
//  POST /tla/form/generate-docx
// ===============================================================================

function buildTlaPayload(body, user) {
    const b = body || {};
    const fallbackName =
        b.facultyFacilitating ||
        (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '');
    return {
        courseCode: b.courseCode || '',
        section: b.section || '',
        dateofDigitalDay: b.dateofDigitalDay || '',
        facultyFacilitating: fallbackName,
        preparedByNamePre: b.preparedByNamePre || fallbackName,
        preparedByNamePost: b.preparedByNamePost || fallbackName,
        courseOutcomes: b.courseOutcomes || '',
        mediatingOutcomes: b.mediatingOutcomes || '',
        preparedSignaturePre: b.professorPreSignature || b.professorSignature || '',
        preparedSignaturePost: b.professorPostSignature || '',
        pre_moIloCode: b.pre_moIloCode || '',
        pre_teacherLearningActivity: b.pre_teacherLearningActivity || '',
        pre_lmsDigitalTool: b.pre_lmsDigitalTool || '',
        pre_assessment: b.pre_assessment || '',
        post_moIloCode: b.post_moIloCode || '',
        post_participantTurnout: b.post_participantTurnout || '',
        post_assessmentResults: b.post_assessmentResults || '',
        post_remarks: b.post_remarks || ''
    };
}

function formatApprovalLine(name, dateValue) {
    if (!name) return '';
    if (!dateValue) return name;
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return name;
    return `${name} / ${d.toLocaleDateString('en-US')}`;
}

async function renderTlaPdf(payload) {
    const templateBytes = readFileSync(PDF_TEMPLATE);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);

    const draw = (txt, x, y, { size = 9, f = font, color = black, maxWidth } = {}) => {
        if (!txt) return;
        let text = String(txt);
        if (maxWidth) {
            while (f.widthOfTextAtSize(text, size) > maxWidth && text.length > 1) {
                text = text.slice(0, -1);
            }
        }
        page.drawText(text, { x, y, size, font: f, color });
    };

    const drawWrapped = (txt, x, y, cellW, { size = 8, lineH = 10, f = font } = {}) => {
        if (!txt) return;
        const words = String(txt).split(/\s+/);
        let line = '';
        let curY = y;
        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (f.widthOfTextAtSize(test, size) > cellW - 6) {
                if (line) {
                    page.drawText(line, { x, y: curY, size, font: f, color: black });
                    curY -= lineH;
                }
                line = word;
            } else {
                line = test;
            }
        }
        if (line) page.drawText(line, { x, y: curY, size, font: f, color: black });
    };

    const drawSignatureImage = async (dataUrl, x, y, maxW, maxH) => {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return;
        try {
            // Extract base64 string from data URL
            const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            const buffer = Buffer.from(base64Part, 'base64');
            
            let img;
            if (dataUrl.startsWith('data:image/png')) {
                img = await pdfDoc.embedPng(buffer);
            } else if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
                img = await pdfDoc.embedJpg(buffer);
            } else {
                return; // Unsupported image format
            }

            const scale = Math.min(maxW / img.width, maxH / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            page.drawImage(img, { x: x + (maxW - w) / 2, y: y + (maxH - h) / 2, width: w, height: h });
        } catch (e) {
            console.error('Error drawing signature:', e.message);
            // Skip invalid images so PDF generation still succeeds.
        }
    };

    draw(payload.courseCode, 113, 737, { size: 9, maxWidth: 105 });
    draw(payload.section, 290, 737, { size: 9, maxWidth: 110 });
    draw(payload.dateofDigitalDay, 410, 732, { size: 9, maxWidth: 145 });
    draw(payload.facultyFacilitating, 250, 718, { size: 9, maxWidth: 305 });
    drawWrapped(payload.courseOutcomes, 148, 705, 407, { size: 8, lineH: 9 });
    drawWrapped(payload.mediatingOutcomes, 56, 671, 498, { size: 8, lineH: 9 });

    const preY = 585;
    drawWrapped(payload.pre_moIloCode, 55, preY, 65, { size: 8 });
    drawWrapped(payload.pre_teacherLearningActivity, 128, preY, 195, { size: 8 });
    drawWrapped(payload.pre_lmsDigitalTool, 331, preY, 103, { size: 8 });
    drawWrapped(payload.pre_assessment, 441, preY, 113, { size: 8 });

    const postY = 305;
    drawWrapped(payload.post_moIloCode, 55, postY, 65, { size: 8 });
    drawWrapped(payload.post_participantTurnout, 128, postY, 195, { size: 8 });
    drawWrapped(payload.post_assessmentResults, 331, postY, 103, { size: 8 });
    drawWrapped(payload.post_remarks, 441, postY, 113, { size: 8 });

    // PRE-DIGITAL signature row
    await drawSignatureImage(payload.preparedSignaturePre, 45, 345, 160, 110);
    await drawSignatureImage(payload.programChairSignaturePre, 215, 350, 160, 110);
    await drawSignatureImage(payload.deanSignaturePre, 385, 350, 160, 110);

    draw(payload.preparedByNamePre, 85, 388, { size: 9, maxWidth: 142 });
    draw(payload.programChairLinePre, 260, 395, { size: 8, maxWidth: 160 });
    draw(payload.deanLinePre, 435, 395, { size: 8, maxWidth: 100 });

    // POST-DIGITAL signature row
    await drawSignatureImage(payload.preparedSignaturePost, 45, 112, 160, 110);
    await drawSignatureImage(payload.programChairSignaturePost, 215, 120, 160, 110);
    await drawSignatureImage(payload.deanSignaturePost, 387, 120, 160, 110);

    draw(payload.preparedByNamePost, 85, 158, { size: 9, maxWidth: 142 });
    draw(payload.programChairLinePost, 260, 165, { size: 9, maxWidth: 142 });
    draw(payload.deanLinePost, 435, 165, { size: 9, maxWidth: 142 });

    return pdfDoc.save();
}

async function appendTlaSignaturePayload(basePayload, tlaId, fallbackUserId) {
    const payload = { ...basePayload };

    let tlaDoc = null;
    if (tlaId) {
        tlaDoc = await TLA_Main.findById(tlaId);
    }

    let facultyUser = null;
    if (fallbackUserId) {
        facultyUser = await User.findById(fallbackUserId);
    }

    let statusDoc = null;
    if (tlaId) {
        statusDoc = await Status_Main.findOne({ tlaID: tlaId });
    }

    const resolvedPreparedByName = payload.facultyFacilitating ||
        (facultyUser ? `${facultyUser.firstName || ''} ${facultyUser.lastName || ''}`.trim() : 'Faculty Member');
    payload.preparedByNamePre = payload.preparedByNamePre || resolvedPreparedByName;
    payload.preparedByNamePost = payload.preparedByNamePost || resolvedPreparedByName;
    payload.programChairLinePre = formatApprovalLine(statusDoc?.programChair?.approvedBy, statusDoc?.programChair?.approvalDate);
    payload.deanLinePre = formatApprovalLine(statusDoc?.dean?.approvedBy, statusDoc?.dean?.approvalDate);
    payload.programChairLinePost = formatApprovalLine(statusDoc?.programChairPost?.approvedBy, statusDoc?.programChairPost?.approvalDate);
    payload.deanLinePost = formatApprovalLine(statusDoc?.deanPost?.approvedBy, statusDoc?.deanPost?.approvalDate);

    // Faculty signature source: TLA form upload (per-document), not user profile.
    payload.preparedSignaturePre = tlaDoc?.professorPreSignature || tlaDoc?.professorSignature || payload.preparedSignaturePre || '';
    payload.preparedSignaturePost = tlaDoc?.professorPostSignature || payload.preparedSignaturePost || '';
    if (!payload.preparedByNamePost && payload.preparedSignaturePost) {
        payload.preparedByNamePost = resolvedPreparedByName;
    }
    payload.programChairSignaturePre = statusDoc?.programChair?.signatureImage || '';
    payload.deanSignaturePre = statusDoc?.dean?.signatureImage || '';
    payload.programChairSignaturePost = statusDoc?.programChairPost?.signatureImage || '';
    payload.deanSignaturePost = statusDoc?.deanPost?.signatureImage || '';

    return payload;
}

export async function generateDocx(req, res) {
    try {
        const basePayload = buildTlaPayload(req.body, req.session.user);
        const tlaId = req.body._tlaId || null;
        const payload = await appendTlaSignaturePayload(basePayload, tlaId, req.session.user?.id);
        const pdfBytes = await renderTlaPdf(payload);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="TLA_Report.pdf"'
        });
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('generateDocx error:', err);
        res.status(500).send('Failed to generate PDF');
    }
}

// ===============================================================================
//  PDF PREVIEW FROM CURRENT FORM INPUTS (ATA-like preview endpoint)
//  POST /tla/form/preview-pdf
// ===============================================================================

export async function previewTlaPdf(req, res) {
    try {
        const basePayload = buildTlaPayload(req.body, req.session.user);
        const tlaId = req.body._tlaId || null;
        const payload = await appendTlaSignaturePayload(basePayload, tlaId, req.session.user?.id);
        const pdfBytes = await renderTlaPdf(payload);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="TLA_Preview.pdf"'
        });
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('previewTlaPdf error:', err);
        res.status(500).send('Failed to preview PDF');
    }
}

// ===============================================================================
//  VIEW SAVED TLA AS PDF (ATA-like view-by-id endpoint)
//  GET /tla/form/pdf/:id
// ===============================================================================

export async function viewTlaPdf(req, res) {
    try {
        const tla = await TLA_Main.findById(req.params.id);
        if (!tla) return res.status(404).send('TLA not found');

        if (tla.userID.toString() !== req.session.user.id) {
            return res.status(403).send('Forbidden');
        }

        const [preDigital, postDigital] = await Promise.all([
            Pre_Main.findOne({ tlaID: tla._id }),
            Post_Main.findOne({ tlaID: tla._id })
        ]);

        const basePayload = buildTlaPayload({
            courseCode: tla.courseCode,
            section: tla.section,
            dateofDigitalDay: tla.dateofDigitalDay,
            facultyFacilitating: tla.facultyFacilitating,
            courseOutcomes: tla.courseOutcomes,
            mediatingOutcomes: tla.mediatingOutcomes,
            pre_moIloCode: preDigital?.moIloCode,
            pre_teacherLearningActivity: preDigital?.teacherLearningActivity,
            pre_lmsDigitalTool: preDigital?.lmsDigitalTool,
            pre_assessment: preDigital?.assessment,
            post_moIloCode: postDigital?.moIloCode,
            post_participantTurnout: postDigital?.participantTurnout,
            post_assessmentResults: postDigital?.assessmentResults,
            post_remarks: postDigital?.remarks
        }, req.session.user);

        const payload = await appendTlaSignaturePayload(basePayload, tla._id, tla.userID);

        const pdfBytes = await renderTlaPdf(payload);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="TLA_Report.pdf"'
        });
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('viewTlaPdf error:', err);
        res.status(500).send('Failed to view PDF');
    }
}

// ===============================================================================
//  VIEW TLA AS PDF FOR APPROVALS (GET /tla/form/pdf-approval/:id)
//  Used by approval roles (Chair, Dean, HR, VPAA) to view saved TLA with signatures
//  No faculty-only restriction; shows pre-filled faculty data + approval signatures
// ===============================================================================

export async function viewTlaPdfApproval(req, res) {
    try {
        const tla = await TLA_Main.findById(req.params.id);
        if (!tla) return res.status(404).send('TLA not found');

        const [preDigital, postDigital] = await Promise.all([
            Pre_Main.findOne({ tlaID: tla._id }),
            Post_Main.findOne({ tlaID: tla._id })
        ]);

        const basePayload = buildTlaPayload({
            courseCode: tla.courseCode,
            section: tla.section,
            dateofDigitalDay: tla.dateofDigitalDay,
            facultyFacilitating: tla.facultyFacilitating || '',
            courseOutcomes: tla.courseOutcomes,
            mediatingOutcomes: tla.mediatingOutcomes,
            pre_moIloCode: preDigital?.moIloCode,
            pre_teacherLearningActivity: preDigital?.teacherLearningActivity,
            pre_lmsDigitalTool: preDigital?.lmsDigitalTool,
            pre_assessment: preDigital?.assessment,
            post_moIloCode: postDigital?.moIloCode,
            post_participantTurnout: postDigital?.participantTurnout,
            post_assessmentResults: postDigital?.assessmentResults,
            post_remarks: postDigital?.remarks
        }, req.session.user);

        const payload = await appendTlaSignaturePayload(basePayload, tla._id, tla.userID);

        const pdfBytes = await renderTlaPdf(payload);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="TLA_Report.pdf"'
        });
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('viewTlaPdfApproval error:', err);
        res.status(500).send('Failed to view PDF');
    }
}

// ===============================================================================
//  PREVIEW TLA AS PDF FOR APPROVALS (POST /tla/approval/:id/preview-pdf)
//  Includes current in-page uploaded signature even before draft/submit.
// ===============================================================================

export async function previewApprovalTlaPdf(req, res) {
    try {
        const tlaID = req.params.id;
        const { signatureImage, activeStep } = req.body || {};
        const safeSignature = (typeof signatureImage === 'string' && signatureImage.startsWith('data:image'))
            ? signatureImage
            : '';

        const tla = await TLA_Main.findById(tlaID);
        if (!tla) return res.status(404).send('TLA not found');

        const [preDigital, postDigital] = await Promise.all([
            Pre_Main.findOne({ tlaID: tla._id }),
            Post_Main.findOne({ tlaID: tla._id })
        ]);

        const basePayload = buildTlaPayload({
            courseCode: tla.courseCode,
            section: tla.section,
            dateofDigitalDay: tla.dateofDigitalDay,
            facultyFacilitating: tla.facultyFacilitating || '',
            courseOutcomes: tla.courseOutcomes,
            mediatingOutcomes: tla.mediatingOutcomes,
            pre_moIloCode: preDigital?.moIloCode,
            pre_teacherLearningActivity: preDigital?.teacherLearningActivity,
            pre_lmsDigitalTool: preDigital?.lmsDigitalTool,
            pre_assessment: preDigital?.assessment,
            post_moIloCode: postDigital?.moIloCode,
            post_participantTurnout: postDigital?.participantTurnout,
            post_assessmentResults: postDigital?.assessmentResults,
            post_remarks: postDigital?.remarks
        }, req.session.user);

        const payload = await appendTlaSignaturePayload(basePayload, tla._id, tla.userID);

        // Overlay the currently uploaded signature in approval page preview,
        // so approvers can verify placement before saving/submitting.
        if (safeSignature) {
            const actor = actorName(req.session.user);
            if (activeStep === 'programChair') {
                payload.programChairSignaturePre = safeSignature;
                payload.programChairLinePre = actor;
            } else if (activeStep === 'dean') {
                payload.deanSignaturePre = safeSignature;
                payload.deanLinePre = actor;
            } else if (activeStep === 'programChairPost') {
                payload.programChairSignaturePost = safeSignature;
                payload.programChairLinePost = actor;
            } else if (activeStep === 'deanPost') {
                payload.deanSignaturePost = safeSignature;
                payload.deanLinePost = actor;
            }
        }

        const pdfBytes = await renderTlaPdf(payload);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="TLA_Preview.pdf"'
        });
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('previewApprovalTlaPdf error:', err);
        res.status(500).send('Failed to preview PDF');
    }
}

// ===============================================================================
//  TLA PDF X-RAY (visualize field names from fillable template)
//  GET /tla/form/pdf-xray
// ===============================================================================

export async function discoverTlaPdfFields(req, res) {
    try {
        const existingPdfBytes = readFileSync(PDF_TEMPLATE);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();
        const fields = pdfForm.getFields();

        fields.forEach((field) => {
            const type = field.constructor.name;
            const name = field.getName();

            try {
                if (type === 'PDFTextField') {
                    const textField = pdfForm.getTextField(name);
                    textField.setText(name);
                    textField.setFontSize(7);
                } else if (type === 'PDFDropdown') {
                    const dropField = pdfForm.getDropdown(name);
                    dropField.addOptions([name]);
                    dropField.select(name);
                } else if (type === 'PDFCheckBox') {
                    pdfForm.getCheckBox(name).check();
                }
            } catch (err) {
                // Skip unsupported or malformed fields without failing the whole preview.
            }
        });

        pdfForm.flatten();
        const pdfBytes = await pdfDoc.save();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=TLA_Visual_PDF_Map.pdf');
        res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error('discoverTlaPdfFields error:', error);
        res.status(500).send('Failed to generate TLA visual PDF map.');
    }
}

// ===============================================================================
//  ADMIN CONSOLIDATED TLA PAGE
//  GET /admin/tla — review queue + archive in one page, with admin sidebar
// ===============================================================================

export async function getAdminTLA(req, res) {
    try {
        const role = req.session.user.role;
        const isAdmin = role === 'Admin' || role === 'Super-Admin';

        const [submissions, archiveData] = await Promise.all([
            buildSubmissionList(role),
            isAdmin ? buildArchiveData() : Promise.resolve({ toArchive: [], archived: [] })
        ]);

        res.render('TLA/tlaAdminConsolidated', {
            currentPageCategory: 'tla',
            user: req.session.user,
            submissions,
            toArchive: archiveData.toArchive,
            archived:  archiveData.archived,
            role
        });
    } catch (error) {
        console.error('getAdminTLA error:', error);
        res.status(500).send('Server error');
    }
}
