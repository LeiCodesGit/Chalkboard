import ATAForm from '../models/ATA/ATAForm.js';
import { PDFDocument } from 'pdf-lib';
import { mainDB } from '../database/mongo-dbconnect.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 🧠 1. THE MATH ENGINE (Restored Mapúa Logic)
// ==========================================
const calculateUnits = (formData) => {
    let totalTeachingUnits = 0;
    
    const sumUnits = (array) => {
        if (!array || !array.length) return 0;
        return array.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
    };

    totalTeachingUnits += Number(formData.sectionA_AdminUnits) || 0; 
    totalTeachingUnits += sumUnits(formData.sectionB_WithinCollege);
    totalTeachingUnits += sumUnits(formData.sectionC_OtherCollege);
    totalTeachingUnits += sumUnits(formData.sectionD_AdminWork);

    let totalEffectiveUnits = totalTeachingUnits; 

    // 🚨 RESTORED: Mapúa Section G Remedial Formula (students/40)
    let totalRemedialUnits = 0;
    if (formData.sectionG_Remedial && formData.sectionG_Remedial.length > 0) {
        for (const course of formData.sectionG_Remedial) {
            const students = Number(course.numberOfStudents) || 0;
            const units = Number(course.units) || 0;
            const courseType = course.type; 

            if (courseType === 'lecture') {
                totalRemedialUnits += units * (students / 40);
            } else if (courseType === 'lab') {
                totalRemedialUnits += 2 * units * (students / 40);
            }
        }
    }
    
    return { totalTeachingUnits, totalEffectiveUnits, totalRemedialUnits };
};
// ==========================================
// 📄 RENDER NEW ATA FORM (With Coordinators)
// ==========================================
export const renderNewATA = async (req, res) => {
    try {
        // 1. QUERY THE DATABASE FOR ALL PRACTICUM COORDINATORS
        // This looks for anyone where you set isPracticumCoordinator to true in MongoDB!
        const coordinators = await User.find({ isPracticumCoordinator: true });
        
        // 2. EXTRACT THEIR FULL NAMES
        // Combines firstName and lastName into a clean array of strings
        const coordinatorNames = coordinators.map(c => `${c.firstName} ${c.lastName}`.trim());

        // 3. RENDER THE PAGE AND PASS THE DATA
        res.render('ATA/new-ata', { 
            user: req.user, 
            role: req.user.role, 
            employmentType: req.user.employmentType,
            isPracticumCoordinator: req.user.isPracticumCoordinator,
            coordinators: coordinatorNames // 👈 Passes the names to the EJS dropdown!
        });
    } catch (error) {
        console.error("Error loading new ATA page:", error);
        res.status(500).send("Server Error");
    }
};

// ==========================================
// 📝 2. CREATE / SUBMIT ATA 
// ==========================================
export const submitATA = async (req, res) => { 
    try {
        const formData = req.body; 
        
        // 👇 The Ultimate ID Catcher: It tries the MongoDB _id first, then id, then the employeeId!
        const userID = req.user._id || req.user.id || req.user.employeeId;

        if (!userID) {
            return res.status(400).json({ error: "Could not detect your User ID from the session." });
        }

        const totals = calculateUnits(formData);

        // 🚨 RESTORED: ENFORCE MAX 6 REMEDIAL UNITS RULE
        if (totals.totalRemedialUnits > 6) {
            return res.status(400).json({ 
                error: `Remedial limit exceeded. You have ${totals.totalRemedialUnits.toFixed(2)} effective units, max is 6.` 
            });
        }

        let newStatus = 'DRAFT';
        
        if (formData.action === 'SUBMIT') {
            const routingRole = req.user.role; 
            const hasPracticum = formData.sectionE_Practicum && formData.sectionE_Practicum.length > 0;
            // 🧠 HIERARCHY ROUTING LOGIC
            if (routingRole === 'Dean') {
                newStatus = 'PENDING_VPAA'; 
            } 
            else if (routingRole === 'Program-Chair') {
                newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_DEAN';
            } 
            else {
                newStatus = 'PENDING_CHAIR';
            }
        }

        const newForm = new ATAForm({
            userID: userID,
            facultyName: formData.facultyName, 
            position: formData.position,
            college: formData.college,
            employmentType: formData.employmentType,
            sectionA_AdminUnits: formData.sectionA_AdminUnits || 0,
            address: formData.address,
            term: formData.term,
            academicYear: formData.academicYear,
            
            sectionB_WithinCollege: formData.sectionB_WithinCollege,
            sectionC_OtherCollege: formData.sectionC_OtherCollege,
            sectionD_AdminWork: formData.sectionD_AdminWork,
            sectionE_Practicum: formData.sectionE_Practicum,
            sectionF_OutsideEmployment: formData.sectionF_OutsideEmployment,
            sectionG_Remedial: formData.sectionG_Remedial,

            totalTeachingUnits: totals.totalTeachingUnits,
            totalEffectiveUnits: totals.totalEffectiveUnits,
            totalRemedialUnits: totals.totalRemedialUnits,
            status: newStatus
        });

        await newForm.save(); 
        res.status(201).json({ message: "ATA Form saved successfully!", data: newForm });

    } catch (error) {
        console.error("Error submitting ATA:", error);
        res.status(500).json({ error: "Failed to submit ATA Form" });
    }
};

// ==========================================
// 🚦 3. ENDORSE / APPROVE / RETURN (Live DB Fetch Fix)
// ==========================================
export const approveATA = async (req, res) => {
    try {
        const { action, remarks } = req.body;
        const formId = req.params.id;
        
        // 👇 1. GRAB THE ID FROM THE SESSION
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        // 👇 2. FETCH THE LIVE USER DATA FROM MONGODB
        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        
        if (!liveUser) return res.status(404).json({ error: "User not found." });

        // Now we use the completely fresh MongoDB data!
        const primaryRole = liveUser.role; 
        const isPracticumCoord = liveUser.isPracticumCoordinator === true;
        const adminFullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();

        const form = await ATAForm.findById(formId);
        if (!form) return res.status(404).json({ error: "ATA Form not found." });

        let newStatus = form.status;
        let historyStatus = '';
        let appliedRole = primaryRole; 

        // ⏪ DRAFT RECOVERY & REMARKS LOGIC
        if (action === 'RETURN') {
            if (!remarks || remarks.trim() === '') {
                return res.status(400).json({ error: "Remarks are strictly required when returning a form." });
            }
            newStatus = 'DRAFT';
            historyStatus = 'RETURNED';
        } 
        // ⏩ FORWARD PROGRESSION
        else {
            switch (form.status) {
                case 'PENDING_CHAIR':
                    if (primaryRole === 'Program-Chair' && action === 'ENDORSE') {
                        const hasPracticum = form.sectionE_Practicum && form.sectionE_Practicum.length > 0;
                        newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_DEAN';
                        historyStatus = 'ENDORSED';
                    } else return res.status(403).json({ error: "Invalid action for Chair." });
                    break;

                case 'PENDING_PRACTICUM':
                    // 👇 Because we use liveUser, this boolean will perfectly read "true"!
                    if ((primaryRole === 'Practicum-Coordinator' || isPracticumCoord) && action === 'VALIDATE') {
                        newStatus = 'PENDING_DEAN';
                        historyStatus = 'VALIDATED';
                        appliedRole = 'Practicum-Coordinator'; // Force the history log to show she acted as Coordinator
                    } else return res.status(403).json({ error: "Invalid action for Practicum Coordinator." });
                    break;

                case 'PENDING_DEAN':
                    if (primaryRole === 'Dean' && action === 'APPROVE') {
                        newStatus = 'PENDING_VPAA';
                        historyStatus = 'APPROVED';
                    } else return res.status(403).json({ error: "Invalid action for Dean." });
                    break;

                case 'PENDING_VPAA':
                    if (primaryRole === 'VPAA' && action === 'NOTE') {
                        newStatus = 'PENDING_HR'; // 👈 Sends it to HR!
                        historyStatus = 'NOTED';
                    } else return res.status(403).json({ error: "Invalid action for VPAA." });
                    break;

                // 👇 NEW: HR receives it, notes it, and finalizes the whole process!
                case 'PENDING_HR':
                    if (['HR', 'HRMO'].includes(primaryRole) && action === 'NOTE') {
                        newStatus = 'FINALIZED'; 
                        historyStatus = 'FINALIZED';
                    } else return res.status(403).json({ error: "Invalid action for HR." });
                    break;

                default:
                    return res.status(400).json({ error: "Form cannot be moved from its current state." });
            }
        }

        form.status = newStatus;
        form.approvalHistory.push({
            approverRole: appliedRole, 
            approverName: adminFullName,
            approvalStatus: historyStatus,
            remarks: remarks || "",
            date: Date.now()
        });

        await form.save();
        res.status(200).json({ message: `Success! Form is now ${newStatus}` });

    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: error.message }); 
    }
};
// ==========================================
// 📥 4. GET PENDING APPROVALS (Live DB Fetch Fix)
// ==========================================
export const getPendingApprovals = async (req, res) => {
    try {
        // 1. GET THE USER ID FROM SESSION
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        // 👇 THE FIX: Grab the compiled database engine for Users!
        const User = mainDB.model('User');
        
        // Now it can search perfectly!
        const liveUser = await User.findById(sessionUserID);
        
        if (!liveUser) {
            return res.status(404).send("User not found in database.");
        }

        // Extract properties directly from the fresh MongoDB document
        const userRole = liveUser.role || "Professor"; 
        const userProgram = liveUser.program || liveUser.department || "CpE"; 
        
        // Build the exact name to perfectly match the dropdown (e.g., "Marites Tabanao")
        const fullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();
        
        // Grab the boolean directly from the live database document
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        let queryConditions = [];

        if (userRole === 'Program-Chair') {
            queryConditions.push({ status: 'PENDING_CHAIR', college: userProgram });
        } 
        if (isPracticumCoordinator) {
            queryConditions.push({ 
                status: 'PENDING_PRACTICUM',
                'sectionE_Practicum.coordinator': fullName 
            }); 
        } 
        if (userRole === 'Dean') {
            queryConditions.push({ status: 'PENDING_DEAN' });
        } 
        
        // 👇 STRICT RULE 1: VPAA Inbox ONLY shows Pending VPAA forms
        if (userRole === 'VPAA') {
            queryConditions.push({ status: 'PENDING_VPAA' }); 
        }

        // 👇 STRICT RULE 2: HR Inbox ONLY shows Pending HR forms
        if (userRole === 'HR' || userRole === 'HRMO') {
            queryConditions.push({ status: 'PENDING_HR' }); 
        }

        let query = {};
        
        if (queryConditions.length > 1) {
            query = { $or: queryConditions };
        } else if (queryConditions.length === 1) {
            query = queryConditions[0];
        } else {
            query = { _id: null }; 
        }

        const pendingForms = await ATAForm.find(query).sort({ createdAt: -1 });

        res.render('ATA/pending-approvals', {
            forms: pendingForms,
            role: userRole,
            college: userProgram,
            user: liveUser, 
            currentPageCategory: 'ata'
        });

    } catch (error) {
        console.error("Error fetching pending forms:", error);
        res.status(500).send("Failed to load pending forms.");
    }
};
// ==========================================
// 📚 5.1 GET ADMIN HISTORY (The Archive)
// ==========================================
export const getAdminHistory = async (req, res) => {
    try {
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        if (!liveUser) return res.status(404).send("User not found.");

        const userRole = liveUser.role || "Professor";
        const userProgram = liveUser.program || liveUser.department || "CpE";
        const fullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        let queryConditions = [];

        // 1. Chairs & Deans see forms they personally signed
        if (userRole === 'Program-Chair') {
            queryConditions.push({ college: userProgram, 'approvalHistory.approverRole': 'Program-Chair' });
        }
        if (isPracticumCoordinator) {
            queryConditions.push({ 
                'sectionE_Practicum.coordinator': fullName,
                'approvalHistory.approverRole': 'Practicum-Coordinator' 
            });
        }
        if (userRole === 'Dean') {
            queryConditions.push({ 'approvalHistory.approverRole': 'Dean' });
        }

        // 👇 2. THE FIX: VPAA sees anything they signed, OR anything that moved past them to HR!
        if (userRole === 'VPAA') {
            queryConditions.push({
                $or: [
                    { 'approvalHistory.approverRole': 'VPAA' },
                    { status: { $in: ['PENDING_HR', 'FINALIZED'] } }
                ]
            });
        }

        // 👇 3. THE FIX: HR sees anything they signed, OR anything that is fully Finalized!
        if (userRole === 'HR' || userRole === 'HRMO') {
            queryConditions.push({
                $or: [
                    { 'approvalHistory.approverRole': { $in: ['HR', 'HRMO'] } },
                    { status: 'FINALIZED' }
                ]
            });
        }

        let query = {};
        if (queryConditions.length > 1) {
            query = { $or: queryConditions };
        } else if (queryConditions.length === 1) {
            query = queryConditions[0];
        } else {
            query = { _id: null }; // Failsafe if user has no roles
        }

        // Sort so the most recently touched forms appear at the very top!
        const approvedForms = await ATAForm.find(query).sort({ updatedAt: -1 });

        res.render('ATA/pending-approvals', {
            forms: approvedForms,
            role: userRole,
            college: userProgram,
            user: liveUser,
            currentPageCategory: 'ata',
            isHistory: true 
        });

    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).send("Failed to load history.");
    }
};
// 📄 5.2 VIEW SPECIFIC FORM (Read-Only)
export const viewATAForm = async (req, res) => {
    try {
        const form = await ATAForm.findById(req.params.id);
        if (!form) return res.status(404).send("Form not found");
        
        // 👇 Check if Section E has data
        const hasPracticum = form.sectionE_Practicum && form.sectionE_Practicum.length > 0;
        
        res.render('ATA/review-ata', { 
            form: form, 
            role: req.user.role,
            user: req.user,              
            currentPageCategory: 'ata',
            hasPracticum: hasPracticum
        });
    } catch (error) {
        console.error("Error fetching form:", error);
        res.status(500).send("Failed to load form.");
    }
};
// ==========================================
// 🖨️ 6. GENERATE FILLED PDF (FINAL COMPLETE VERSION)
// ==========================================
export const viewAtaPdf = async (req, res) => {
    try {
        const form = await ATAForm.findById(req.params.id);
        if (!form) return res.status(404).send("Form not found");

        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();

        // Helper function to safely fill a text field AND set the font size
        const fillText = (fieldName, value) => {
            try { 
                if (value) {
                    const field = pdfForm.getTextField(fieldName);
                    field.setText(value.toString());
                    field.setFontSize(7); 
                } 
            } 
            catch (err) { /* Ignore if field doesn't exist */ }
        };

        // ==========================================
        // 1. TOP SECTION (Personal Details)
        // ==========================================
        fillText('text_1tvhi', form.facultyName);
        fillText('text_5jvwx', form.position);
        fillText('COLLEGE', form.college);
        fillText('text_2beim', form.employmentType);
        fillText('text_4wesx', form.address);
        fillText('text_36xvyn', form.sectionA_AdminUnits); 
        
        fillText('TERM', form.term.split(' ')[0]); 
        try { pdfForm.getDropdown('dropdown_87etxp').select(form.academicYear); } 
        catch (e) { fillText('AY', form.academicYear); } 

        try {
            if (form.employmentType === 'Full-Time') pdfForm.getCheckBox('checkbox_7vfdl').check();
            if (form.employmentType === 'Part-Time') pdfForm.getCheckBox('checkbox_8omuk').check();
        } catch (e) {}

        // ==========================================
        // 2. THE SCALABLE TABLE LOOPS
        // ==========================================
        
        // (B) COURSES WITHIN ASSIGNED COLLEGES
        const sectionB_Cols = {
            course:  ['text_10kmln', 'text_11ywye', 'text_12funt', 'text_13cbrv', 'text_14oddx', 'text_15vwye', 'text_16zhiz', 'text_17arqj', 'text_18yeyt', 'text_19usez'],
            section: ['text_60olqb', 'text_61lnlx', 'text_62qqva', 'text_63scfz', 'text_64yecq', 'text_65guog', 'text_66qocy', 'text_67vs', 'text_68hldf', 'text_69pugt'],
            units:   ['text_70cmcr', 'text_71yakp', 'text_72gwrs', 'text_73lgtb', 'text_74hsiw', 'text_75oeti', 'text_76gklh', 'text_88yf',  'text_89wumx', 'text_90gzrv'],
            date:    ['text_91nlsp', 'text_92akoo', 'text_93paai', 'text_95sxfz', 'text_96erde', 'text_97xhu',  'text_98nlys', 'text_99teyw', 'text_100vjjp','text_101dvuo']
        };
        form.sectionB_WithinCollege.forEach((row, i) => {
            if (i < 10) { 
                fillText(sectionB_Cols.course[i], row.courseCode);
                fillText(sectionB_Cols.section[i], row.section);
                fillText(sectionB_Cols.units[i], row.units);
                fillText(sectionB_Cols.date[i], row.effectiveDate);
            }
        });
        fillText('text_57cmig', form.totalTeachingUnits); 

        // (C) COURSES FROM OTHER COLLEGES
        const sectionC_Cols = {
            course:  ['text_47rebo', 'text_48qzlp', 'text_49jhlb', 'text_50tsch', 'text_51hunk', 'text_52yzee', 'text_53upjj', 'text_54prkk', 'text_55qvgs', 'text_56krii'],
            section: ['text_102lvno','text_103vhsh','text_104slei','text_105slnh','text_106ybso','text_107vcxk','text_108akar','text_109bggl','text_110qjji','text_111lbn'],
            units:   ['text_112udtm','text_113dznl','text_114ls',  'text_115lgxa','text_116faud','text_117jugg','text_118mlep','text_119nrkb','text_120kvok','text_121xhpk'],
            date:    ['text_122aymw','text_123wfov','text_124mqbu','text_125brsh','text_126soxx','text_127fsch','text_128nioh','text_129bo',  'text_130bcsd','text_131uwop']
        };
        form.sectionC_OtherCollege.forEach((row, i) => {
            if (i < 10) {
                fillText(sectionC_Cols.course[i], row.courseCode);
                fillText(sectionC_Cols.section[i], row.section);
                fillText(sectionC_Cols.units[i], row.units);
                fillText(sectionC_Cols.date[i], row.effectiveDate);
            }
        });
        fillText('text_58ltsz', form.totalEffectiveUnits); 

        // (D) ADMINISTRATIVE / RESEARCH WORK
        const sectionD_Cols = {
            work:  ['text_20guwb', 'text_21mcrd', 'text_22cvxd', 'text_23wmjb', 'text_24klgl', 'text_25qlo',  'text_26rjfo', 'text_27yhai', 'text_28zdmg', 'text_29pzoo'],
            units: ['text_145jwbs','text_146wauh','text_147ehza','text_148bmno','text_149doip','text_150vtzu','text_151bojp','text_152hqsk','text_153hzhi','text_154rarc'],
            date:  ['text_156wiqa','text_157mlzt','text_158huzn','text_159evta','text_160kjvt','text_161vlsi','text_162taez','text_163jzvw','text_164xnnl','text_165tghd']
        };
        form.sectionD_AdminWork.forEach((row, i) => {
            if (i < 10) {
                fillText(sectionD_Cols.work[i], row.workDescription);
                fillText(sectionD_Cols.units[i], row.units);
                fillText(sectionD_Cols.date[i], row.effectiveDate);
            }
        });

        // (E) PRACTICUM ADVISING
        const sectionE_Cols = {
            course:      ['text_33orrs', 'text_34wipa', 'text_35oa',   'text_40ebhe', 'text_41pvju', 'text_42sfft', 'text_43aaxp', 'text_44pkqs', 'text_45oyci', 'text_46sba'],
            students:    ['text_166lylu','text_167pzwu','text_168petn','text_169nzbj','text_170iphf','text_171zthi','text_172uhtp','text_173kvtu','text_174iafc','text_175wnlh'],
            coordinator: ['text_176plma','text_177kwyx','text_178bleo','text_179hjnh','text_180znjo','text_181jcgm','text_182hixs','text_183eow', 'text_184ccue','text_185nzmw']
        };
        form.sectionE_Practicum.forEach((row, i) => {
            if (i < 10) {
                fillText(sectionE_Cols.course[i], row.courseCode);
                fillText(sectionE_Cols.students[i], row.numberOfStudents);
                fillText(sectionE_Cols.coordinator[i], row.coordinator);
            }
        });

        // 👇 NEW: (F) EMPLOYMENT OUTSIDE MAPUA MCM
        const sectionF_Cols = {
            employer: ['text_204yxyb', 'text_205gtyr', 'text_206ssz'],
            position: ['text_207zztq', 'text_208zctd', 'text_209lcrw'],
            course:   ['text_210naxn', 'text_211hmtw', 'text_212xchm'],
            hours:    ['text_213qeyx', 'text_214cslh', 'text_215fzzw']
        };
        form.sectionF_OutsideEmployment.forEach((row, i) => {
            if (i < 3) { // Section F only has 3 rows in the PDF!
                fillText(sectionF_Cols.employer[i], row.employer);
                fillText(sectionF_Cols.position[i], row.position);
                fillText(sectionF_Cols.course[i], row.courseOrUnits);
                fillText(sectionF_Cols.hours[i], row.hoursPerWeek);
            }
        });

        // 👇 NEW: (G) REMEDIAL MODULES
        const sectionG_Cols = {
            courseId: ['text_216nuzb', 'text_217psw', 'text_218nwni', 'text_219qckh', 'text_220gohx'],
            module:   ['text_221qfye', 'text_222jghp', 'text_223yrcy', 'text_224bmbn', 'text_225xqqd'],
            section:  ['text_226zoxr', 'text_227kivx', 'text_228cnyy', 'text_229rwwc', 'text_230pntn'],
            units:    ['text_231hngj', 'text_232zzti', 'text_233rqqk', 'text_234tqso', 'text_235mbtu'],
            students: ['text_236szcx', 'text_237fvyk', 'text_238tcyf', 'text_239qjld', 'text_240lntt'],
            type:     ['dropdown_241pzwm', 'dropdown_242uavp', 'dropdown_243vcvz', 'dropdown_244cnyf', 'dropdown_245vvwk']
        };
        form.sectionG_Remedial.forEach((row, i) => {
            if (i < 5) { // Section G only has 5 rows in the PDF!
                fillText(sectionG_Cols.courseId[i], row.courseId);
                fillText(sectionG_Cols.module[i], row.moduleCode);
                fillText(sectionG_Cols.section[i], row.section);
                fillText(sectionG_Cols.units[i], row.units);
                fillText(sectionG_Cols.students[i], row.numberOfStudents);
                
                // Type is a dropdown on the PDF
                try {
                    const drop = pdfForm.getDropdown(sectionG_Cols.type[i]);
                    if(row.type === 'lecture') drop.select('Lecture');
                    if(row.type === 'lab') drop.select('Lab');
                } catch(e) { }
            }
        });

        // ==========================================
        // 3. SIGNATURES & AUDIT TRAIL DATA
        // ==========================================
        
        // A. The Faculty Member's Signature
        fillText('text_186puxz', form.facultyName); // Faculty prints name
        fillText('text_187swky', new Date(form.createdAt).toLocaleDateString()); // Faculty date

        // B. Recommending Approval (Chair & Dean)
        const getSignature = (role) => form.approvalHistory.find(log => log.approverRole === role);
        
        const chairLog = getSignature('Program-Chair');
        if (chairLog) {
            fillText('text_192pysd', chairLog.approverName); 
            fillText('text_193qylu', new Date(chairLog.date).toLocaleDateString());
            try { pdfForm.getCheckBox('checkbox_191hnhv').check(); } catch(e){} // Overload check
        }

        const deanLog = getSignature('Dean');
        if (deanLog) {
            fillText('text_197wtyh', deanLog.approverName);
            fillText('text_198bqqb', new Date(deanLog.date).toLocaleDateString());
        }

        // C. HRMO / VPAA Section
        const vpaaLog = getSignature('VPAA');
        if (vpaaLog) {
            fillText('text_201dcyf', vpaaLog.approverName);
            fillText('text_202xntg', new Date(vpaaLog.date).toLocaleDateString());
        }

        // Catch HR or HRMO
        const hrLog = form.approvalHistory.find(log => ['HR', 'HRMO'].includes(log.approverRole));
        if (hrLog) {
            fillText('text_199wzzc', hrLog.approverName);
            // HR doesn't have a specific date field on the standard Mapua form, but their name is stamped!
        }

        // ==========================================
        // 4. SECURE AND SEND PDF
        // ==========================================
        pdfForm.flatten(); // Lock it so it can't be edited!

        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=ATA_${form.facultyName.replace(/\s+/g, '_')}.pdf`); 
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).send("Failed to generate PDF.");
    }
};

// ==========================================
// 📊 7. DASHBOARD METRICS ENGINE (Live DB Fetch)
// ==========================================
export const renderDashboard = async (req, res) => {
    try {
        // 1. Get Session ID
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        // 👇 2. FETCH FRESH DATA DIRECTLY FROM DATABASE
        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        
        if (!liveUser) return res.status(404).send("User not found.");

        const liveRole = liveUser.role || "Professor";
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        // 3. Calculate Action Card Counts
        const myPendingCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: { $regex: 'PENDING' } 
        });

        const myApprovedCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: 'FINALIZED' 
        });

        // 4. Fetch the Most Recent Form
        const latestForm = await ATAForm.findOne({ userID: sessionUserID }).sort({ createdAt: -1 });

        let lastSubmissionDate = "None";
        let lastStatus = "None";
        let totalUnits = 0;
        let effectiveUnits = 0;

        if (latestForm) {
            lastSubmissionDate = new Date(latestForm.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            lastStatus = latestForm.status.replace('_', ' '); 
            totalUnits = latestForm.totalTeachingUnits || 0;
            effectiveUnits = (latestForm.totalEffectiveUnits || 0) + (latestForm.totalRemedialUnits || 0);
        }

        // 5. Send the FRESH data to the EJS file!
        res.render('ATA/dashboard_window', {
            user: liveUser,
            role: liveRole, // 👈 Guarantees the dashboard knows they are VPAA/HR!
            employmentType: liveUser.employmentType,
            isPracticumCoordinator: isPracticumCoordinator,
            myPendingCount,
            myApprovedCount,
            lastSubmissionDate,
            lastStatus,
            totalUnits,
            effectiveUnits
        });

    } catch (error) {
        console.error("Error loading dashboard metrics:", error);
        res.status(500).send("Failed to load dashboard.");
    }
};
// ==========================================
// 🖨️ 8. GENERATE LIVE PDF PREVIEW (NO DATABASE SAVE)
// ==========================================
export const previewAtaPdf = async (req, res) => {
    try {
        const formData = req.body;
        // Run the math engine to get live totals!
        const totals = calculateUnits(formData);

        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();

        const fillText = (fieldName, value) => {
            try { 
                if (value) {
                    const field = pdfForm.getTextField(fieldName);
                    field.setText(value.toString());
                    field.setFontSize(7); 
                } 
            } catch (err) {}
        };

        // 1. Personal Details
        fillText('text_1tvhi', formData.facultyName);
        fillText('text_5jvwx', formData.position);
        fillText('COLLEGE', formData.college);
        fillText('text_2beim', formData.employmentType);
        fillText('text_4wesx', formData.address);
        fillText('text_36xvyn', formData.sectionA_AdminUnits); 
        
        fillText('TERM', (formData.term || "2nd Term").split(' ')[0]); 
        try { pdfForm.getDropdown('dropdown_87etxp').select(formData.academicYear || "2025-2026"); } 
        catch (e) { fillText('AY', formData.academicYear); } 

        try {
            if (formData.employmentType === 'Full-Time') pdfForm.getCheckBox('checkbox_7vfdl').check();
            if (formData.employmentType === 'Part-Time') pdfForm.getCheckBox('checkbox_8omuk').check();
        } catch (e) {}

        // 2. Map Array Data Safely (B, C, D, E, F, G)
        const safeForEach = (array, mappingCols, limit) => {
            if (!array || !Array.isArray(array)) return;
            array.forEach((row, i) => {
                if (i < limit) {
                    Object.keys(mappingCols).forEach(key => {
                        fillText(mappingCols[key][i], row[key]);
                    });
                }
            });
        };

        safeForEach(formData.sectionB_WithinCollege, {
            courseCode: ['text_10kmln', 'text_11ywye', 'text_12funt', 'text_13cbrv', 'text_14oddx', 'text_15vwye', 'text_16zhiz', 'text_17arqj', 'text_18yeyt', 'text_19usez'],
            section: ['text_60olqb', 'text_61lnlx', 'text_62qqva', 'text_63scfz', 'text_64yecq', 'text_65guog', 'text_66qocy', 'text_67vs', 'text_68hldf', 'text_69pugt'],
            units:   ['text_70cmcr', 'text_71yakp', 'text_72gwrs', 'text_73lgtb', 'text_74hsiw', 'text_75oeti', 'text_76gklh', 'text_88yf',  'text_89wumx', 'text_90gzrv'],
            effectiveDate: ['text_91nlsp', 'text_92akoo', 'text_93paai', 'text_95sxfz', 'text_96erde', 'text_97xhu',  'text_98nlys', 'text_99teyw', 'text_100vjjp','text_101dvuo']
        }, 10);
        fillText('text_57cmig', totals.totalTeachingUnits); 

        safeForEach(formData.sectionC_OtherCollege, {
            courseCode: ['text_47rebo', 'text_48qzlp', 'text_49jhlb', 'text_50tsch', 'text_51hunk', 'text_52yzee', 'text_53upjj', 'text_54prkk', 'text_55qvgs', 'text_56krii'],
            section: ['text_102lvno','text_103vhsh','text_104slei','text_105slnh','text_106ybso','text_107vcxk','text_108akar','text_109bggl','text_110qjji','text_111lbn'],
            units:   ['text_112udtm','text_113dznl','text_114ls',  'text_115lgxa','text_116faud','text_117jugg','text_118mlep','text_119nrkb','text_120kvok','text_121xhpk'],
            effectiveDate: ['text_122aymw','text_123wfov','text_124mqbu','text_125brsh','text_126soxx','text_127fsch','text_128nioh','text_129bo',  'text_130bcsd','text_131uwop']
        }, 10);
        fillText('text_58ltsz', totals.totalEffectiveUnits); 

        safeForEach(formData.sectionD_AdminWork, {
            workDescription: ['text_20guwb', 'text_21mcrd', 'text_22cvxd', 'text_23wmjb', 'text_24klgl', 'text_25qlo',  'text_26rjfo', 'text_27yhai', 'text_28zdmg', 'text_29pzoo'],
            units: ['text_145jwbs','text_146wauh','text_147ehza','text_148bmno','text_149doip','text_150vtzu','text_151bojp','text_152hqsk','text_153hzhi','text_154rarc'],
            effectiveDate: ['text_156wiqa','text_157mlzt','text_158huzn','text_159evta','text_160kjvt','text_161vlsi','text_162taez','text_163jzvw','text_164xnnl','text_165tghd']
        }, 10);

        safeForEach(formData.sectionE_Practicum, {
            courseCode: ['text_33orrs', 'text_34wipa', 'text_35oa',   'text_40ebhe', 'text_41pvju', 'text_42sfft', 'text_43aaxp', 'text_44pkqs', 'text_45oyci', 'text_46sba'],
            numberOfStudents: ['text_166lylu','text_167pzwu','text_168petn','text_169nzbj','text_170iphf','text_171zthi','text_172uhtp','text_173kvtu','text_174iafc','text_175wnlh'],
            coordinator: ['text_176plma','text_177kwyx','text_178bleo','text_179hjnh','text_180znjo','text_181jcgm','text_182hixs','text_183eow', 'text_184ccue','text_185nzmw']
        }, 10);

        safeForEach(formData.sectionF_OutsideEmployment, {
            employer: ['text_204yxyb', 'text_205gtyr', 'text_206ssz'],
            position: ['text_207zztq', 'text_208zctd', 'text_209lcrw'],
            courseOrUnits: ['text_210naxn', 'text_211hmtw', 'text_212xchm'],
            hoursPerWeek: ['text_213qeyx', 'text_214cslh', 'text_215fzzw']
        }, 3);

        // Section G (Remedial) Requires dropdown logic, handled separately
        const sectionG = formData.sectionG_Remedial || [];
        const typeDrops = ['dropdown_241pzwm', 'dropdown_242uavp', 'dropdown_243vcvz', 'dropdown_244cnyf', 'dropdown_245vvwk'];
        safeForEach(sectionG, {
            courseId: ['text_216nuzb', 'text_217psw', 'text_218nwni', 'text_219qckh', 'text_220gohx'],
            moduleCode: ['text_221qfye', 'text_222jghp', 'text_223yrcy', 'text_224bmbn', 'text_225xqqd'],
            section: ['text_226zoxr', 'text_227kivx', 'text_228cnyy', 'text_229rwwc', 'text_230pntn'],
            units: ['text_231hngj', 'text_232zzti', 'text_233rqqk', 'text_234tqso', 'text_235mbtu'],
            numberOfStudents: ['text_236szcx', 'text_237fvyk', 'text_238tcyf', 'text_239qjld', 'text_240lntt']
        }, 5);
        sectionG.forEach((row, i) => {
            if (i < 5) {
                try {
                    const drop = pdfForm.getDropdown(typeDrops[i]);
                    if(row.type === 'lecture') drop.select('Lecture');
                    if(row.type === 'lab') drop.select('Lab');
                } catch(e) {}
            }
        });

        // 3. Faculty Signature
        fillText('text_186puxz', formData.facultyName); 
        fillText('text_187swky', new Date().toLocaleDateString()); 

        pdfForm.flatten(); 
        const pdfBytes = await pdfDoc.save();
        
        // Return raw PDF File to the Browser!
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("Preview PDF Error:", error);
        res.status(500).json({ error: "Failed to generate preview." });
    }
};