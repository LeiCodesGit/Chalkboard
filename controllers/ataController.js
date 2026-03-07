import ATAForm from '../models/ATA/ATAForm.js';
import { PDFDocument } from 'pdf-lib';
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
            newStatus = 'PENDING_CHAIR';
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
// 🚦 3. ENDORSE / APPROVE / RETURN (The State Machine)
// ==========================================
export const approveATA = async (req, res) => {
    try {
        const { action, remarks } = req.body;
        const formId = req.params.id;
        const approverRole = req.user.role; 

        const form = await ATAForm.findById(formId);
        if (!form) return res.status(404).json({ error: "ATA Form not found." });

        let newStatus = form.status;
        let historyStatus = '';

        // ⏪ DRAFT RECOVERY & REMARKS LOGIC (Tasks 1 & 2 Fixed)
        if (action === 'RETURN') {
            if (!remarks || remarks.trim() === '') {
                return res.status(400).json({ error: "Remarks are strictly required when returning a form." });
            }
            newStatus = 'DRAFT';
            historyStatus = 'RETURNED';
        } 
        // ⏩ FORWARD PROGRESSION (Strict checking so UI can't cheat)
        else {
            switch (form.status) {
                case 'PENDING_CHAIR':
                    if (approverRole === 'Program-Chair' && action === 'ENDORSE') {
                        // Task 4 Fixed: Practicum Routing
                        const hasPracticum = form.sectionE_Practicum && form.sectionE_Practicum.length > 0;
                        newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_DEAN';
                        historyStatus = 'ENDORSED';
                    } else return res.status(403).json({ error: "Invalid action for Chair." });
                    break;

                case 'PENDING_PRACTICUM':
                    if (approverRole === 'Practicum-Coordinator' && action === 'VALIDATE') {
                        newStatus = 'PENDING_DEAN';
                        historyStatus = 'VALIDATED'; // Schema update used here!
                    } else return res.status(403).json({ error: "Invalid action for Practicum Coordinator." });
                    break;

                case 'PENDING_DEAN':
                    if (approverRole === 'Dean' && action === 'APPROVE') {
                        newStatus = 'PENDING_VPAA';
                        historyStatus = 'APPROVED';
                    } else return res.status(403).json({ error: "Invalid action for Dean." });
                    break;

                case 'PENDING_VPAA':
                    // Task 3 Fixed: VPAA Final Approval
                    if (approverRole === 'VPAA' && action === 'NOTE') {
                        newStatus = 'FINALIZED';
                        historyStatus = 'NOTED'; // Schema update used here!
                    } else return res.status(403).json({ error: "Invalid action for VPAA." });
                    break;

                default:
                    return res.status(400).json({ error: "Form cannot be moved from its current state." });
            }
        }

        form.status = newStatus;
        form.approvalHistory.push({
            approverRole,
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
// 📥 4. GET PENDING APPROVALS (The Inbox)
// ==========================================
export const getPendingApprovals = async (req, res) => {
    try {
        const userRole = req.user.role || "Professor"; 
        
        // 👇 The Fix: Look for "program" first, then "department", with a fail-safe fallback!
        const userProgram = req.user.program || req.user.department || req.user.college || "CpE"; 

        let query = {};

        if (userRole === 'Program-Chair') {
            // Now it will correctly search for college: "CpE"
            query = { status: 'PENDING_CHAIR', college: userProgram }; 
        } else if (userRole === 'Practicum-Coordinator') {
            query = { status: 'PENDING_PRACTICUM' }; 
        } else if (userRole === 'Dean') {
            query = { status: 'PENDING_DEAN' }; 
        } else if (userRole === 'VPAA') {
            query = { status: 'PENDING_VPAA' }; 
        }

        const pendingForms = await ATAForm.find(query).sort({ createdAt: -1 });

        res.render('ATA/pending-approvals', {
            forms: pendingForms,
            role: userRole,
            college: userProgram
        });

    } catch (error) {
        console.error("Error fetching pending forms:", error);
        res.status(500).send("Failed to load pending forms.");
    }
};

// ==========================================
// 📄 5. VIEW SPECIFIC FORM (Read-Only)
// ==========================================
// 📄 5. VIEW SPECIFIC FORM (Read-Only)
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
// 🖨️ 6. GENERATE FILLED PDF (DISCOVERY MODE)
// ==========================================
// ==========================================
// 🖨️ GENERATE FILLED PDF (FINAL VERSION)
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
                    
                    // 👇 THIS IS THE FIX: Forces the text to be a readable size (9pt)
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
        fillText('text_36xvyn', form.sectionA_AdminUnits); // (A) Admin Units
        
        // Term & Academic Year
        fillText('TERM', form.term.split(' ')[0]); // Extracts "2nd" from "2nd Term"
        try { pdfForm.getDropdown('dropdown_87etxp').select(form.academicYear); } 
        catch (e) { fillText('AY', form.academicYear); } // Fallback if dropdown fails

        // Checkboxes
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
            if (i < 10) { // Max 10 rows on the PDF
                fillText(sectionB_Cols.course[i], row.courseCode);
                fillText(sectionB_Cols.section[i], row.section);
                fillText(sectionB_Cols.units[i], row.units);
                fillText(sectionB_Cols.date[i], row.effectiveDate);
            }
        });
        fillText('text_57cmig', form.totalTeachingUnits); // Total Units B

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
        fillText('text_58ltsz', form.totalEffectiveUnits); // Total Units C (adjust if you separate B & C totals)

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

        // ==========================================
        // 3. SECURE AND SEND PDF
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