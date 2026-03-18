import ATAForm from '../models/ATA/ATAForm.js';
import { PDFDocument, PDFName } from 'pdf-lib';
import { mainDB } from '../database/mongo-dbconnect.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 🔐 SAVE VIP SIGNATURE TO PROFILE VAULT
// ==========================================
export const saveVipSignature = async (req, res) => {
    try {
        const { signatureImage } = req.body;
        
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        
        if (!liveUser) return res.status(404).json({ error: "User not found." });

        // Save it to their profile!
        liveUser.signatureImage = signatureImage;
        await liveUser.save();

        res.status(200).json({ message: "Signature Vault updated successfully!" });
    } catch (error) {
        console.error("Error saving VIP signature:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ==========================================
// 🩻 PREVIEW VIP SIGNATURE ON BLANK FORM
// ==========================================
export const previewVipSignaturePdf = async (req, res) => {
    try {
        const { signatureImage, role } = req.body;
        
        // 👇 Fetch the live user to get their REAL NAME!
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }
        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        const actualName = liveUser ? `${liveUser.firstName} ${liveUser.lastName}`.trim() : "Faculty Member";

        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();

        let targetBox = 'text_83xjqp'; 
        let title = "PROGRAM CHAIR / CLUSTER HEAD";
        let offsetX = 0;
        let offsetY = 0;
        let customScale = 0.3; 

        if (role === 'Dean') { 
            targetBox = 'text_80trhj'; title = "DEAN"; 
            offsetY = -10;
        }
        else if (role === 'VPAA') { 
            targetBox = 'text_81gbif'; title = "VPAA"; 
            offsetX = 30; 
            offsetY = -10;   
        }
        else if (['HR', 'HRMO'].includes(role)) { 
            targetBox = 'text_82wmdd'; title = "HRMO"; 
            offsetY = -13; 
        }
        else if (role === 'Practicum-Coordinator') {
            targetBox = 'text_176plma'; 
            offsetX = 45;       
            offsetY = -8;       
            customScale = 0.12; 
        }

        const field = pdfForm.getTextField(targetBox);
        if (role === 'Practicum-Coordinator') {
            field.setText(actualName); 
            field.setFontSize(7);
        } else {
            field.setText(`SAMPLE PREVIEW | ${new Date().toLocaleDateString('en-US')}`);
            field.setFontSize(7);
        }

        if (signatureImage && signatureImage.startsWith('data:image')) {
            const widgets = field.acroField.getWidgets();
            if (widgets && widgets.length > 0) {
                const rect = widgets[0].getRectangle();
                const page = pdfDoc.getPages()[0];
                
                const pngImage = await pdfDoc.embedPng(signatureImage);
                const pngDims = pngImage.scale(customScale); 
                
                page.drawImage(pngImage, {
                    x: rect.x + offsetX, 
                    y: rect.y + offsetY, 
                    width: pngDims.width,
                    height: pngDims.height,
                });
            }
        }

        // 👇 FIXED: The Ultimate PDF Locker (Removes dropdowns entirely!)
        const allFields = pdfForm.getFields();
        const firstPage = pdfDoc.getPages()[0];
        
        const dropdownData = [];
        
        allFields.forEach(f => {
            if (f.constructor.name === 'PDFDropdown') {
                const selected = f.getSelected();
                const val = selected && selected.length > 0 ? selected[0] : '';
                
                const widgets = f.acroField.getWidgets();
                if (widgets && widgets.length > 0) {
                    dropdownData.push({ field: f, val: val, rect: widgets[0].getRectangle() });
                }
            } else {
                f.enableReadOnly();
            }
        });

        dropdownData.forEach(data => {
            pdfForm.removeField(data.field); 
            if (data.val) {
                firstPage.drawText(data.val, {
                    x: data.rect.x + 2,
                    y: data.rect.y + 4, 
                    size: 8
                });
            }
        });

        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("VIP Preview Error:", error);
        res.status(500).json({ error: "Failed to generate VIP preview." });
    }
};

// ==========================================
// 🧠 1. THE MATH ENGINE 
// ==========================================
const calculateUnits = (formData) => {
    const sumUnits = (array) => {
        if (!array || !array.length) return 0;
        return array.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
    };

    const sumB = sumUnits(formData.sectionB_WithinCollege);
    const sumC = sumUnits(formData.sectionC_OtherCollege);
    const sumD = sumUnits(formData.sectionD_AdminWork);

    const totalTeachingUnits = sumB + sumC + sumD; 
    const totalEffectiveUnits = totalTeachingUnits; 

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
    
    return { sumB, sumC, sumD, totalTeachingUnits, totalEffectiveUnits, totalRemedialUnits };
};

// ==========================================
// 📄 RENDER NEW ATA FORM
// ==========================================
export const renderNewATA = async (req, res) => {
    try {
        // 👇 1. Extract the session ID safely
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        
        // 👇 2. CRITICAL FIX: Fetch the LIVE user from the DB so we get the signature!
        const liveUser = await User.findById(sessionUserID);
        
        const coordinators = await User.find({ isPracticumCoordinator: true });
        const coordinatorNames = coordinators.map(c => `${c.firstName} ${c.lastName}`.trim());

        res.render('ATA/new-ata', { 
            // 👇 3. Pass the LIVE USER to the EJS template!
            user: liveUser || req.user, 
            role: liveUser ? liveUser.role : req.user.role, 
            employmentType: liveUser ? liveUser.employmentType : req.user.employmentType,
            isPracticumCoordinator: liveUser ? liveUser.isPracticumCoordinator : req.user.isPracticumCoordinator,
            coordinators: coordinatorNames,
            currentPageCategory: 'ata'
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
        
        // 👇 1. Grab the ID from the frontend payload (will be null for new forms)
        const existingDraftId = formData.existingDraftId; 
        
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        if (!liveUser) return res.status(404).json({ error: "User not found in database." });

        const totals = calculateUnits(formData);

        if (totals.totalRemedialUnits > 6) {
            return res.status(400).json({ error: `Remedial limit exceeded. You have ${totals.totalRemedialUnits.toFixed(2)} units.` });
        }

        let newStatus = 'DRAFT';
        let initialHistory = []; 
        
        // 🚀 Auto-Routing Logic
        if (formData.action === 'SUBMIT') {
            const routingRole = liveUser.role || "Professor"; 
            const hasPracticum = formData.sectionE_Practicum && formData.sectionE_Practicum.length > 0;
            const adminFullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();
            
            if (routingRole === 'Program-Chair') {
                // Chairs auto-endorse their own forms to the Dean (or Practicum)
                newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_DEAN';
                initialHistory.push({
                    approverRole: 'Program-Chair',
                    approverName: adminFullName,
                    approvalStatus: 'ENDORSED',
                    remarks: formData.justification || "Endorsed by Program Chair upon submission.",
                    signatureImage: liveUser.signatureImage || "",
                    date: Date.now()
                });
            } 
            else {
                // EVERYONE ELSE (Professors AND Deans) goes to the Program Chair first!
                newStatus = 'PENDING_CHAIR'; 
            }
        }

        // 👇 2. Package all data into one object so we can use it for BOTH create and update
        const formPayload = {
            userID: sessionUserID, 
            facultyName: formData.facultyName, 
            position: formData.position,
            college: formData.college,
            employmentStatus: formData.employmentStatus,
            employmentType: formData.employmentType,
            sectionA_AdminUnits: formData.sectionA_AdminUnits || 0,
            address: formData.address,
            facultySignature: formData.facultySignature || "",
            term: formData.term || "2nd Term 2025-2026", 
            academicYear: formData.academicYear || "2025-2026",
            
            sectionB_WithinCollege: formData.sectionB_WithinCollege || [],
            sectionC_OtherCollege: formData.sectionC_OtherCollege || [],
            sectionD_AdminWork: formData.sectionD_AdminWork || [],
            sectionE_Practicum: formData.sectionE_Practicum || [],
            sectionF_OutsideEmployment: formData.sectionF_OutsideEmployment || [],
            sectionG_Remedial: formData.sectionG_Remedial || [],

            totalTeachingUnits: totals.totalTeachingUnits,
            totalEffectiveUnits: totals.totalEffectiveUnits,
            totalRemedialUnits: totals.totalRemedialUnits,
            status: newStatus,
            
            // Crucial: Clear out the old rejection remarks from the Chair since they fixed it!
            remarks: "",
            chairRemarks: "" 
        };

        // 👇 3. THE FORK IN THE ROAD (Update vs Create)
        if (existingDraftId) {
            // --- UPDATE EXISTING DRAFT ---
            const existingForm = await ATAForm.findById(existingDraftId);
            if (!existingForm) return res.status(404).json({ error: "Draft not found." });

            // Apply the new data over the old data
            Object.assign(existingForm, formPayload);

            // Add auto-history if they are an admin, OR add a "Resubmitted" tag for professors
            if (initialHistory.length > 0) {
                existingForm.approvalHistory.push(...initialHistory);
            } else if (newStatus !== 'DRAFT') {
                existingForm.approvalHistory.push({
                    approverRole: 'Professor',
                    approverName: formData.facultyName,
                    approvalStatus: 'RESUBMITTED',
                    remarks: 'Draft corrected and resubmitted to Chair.',
                    date: Date.now()
                });
            }

            await existingForm.save();
            return res.status(200).json({ message: "Draft successfully updated and resubmitted!", data: existingForm });

        } else {
            // --- CREATE BRAND NEW FORM ---
            formPayload.approvalHistory = initialHistory;
            const newForm = new ATAForm(formPayload);
            
            await newForm.save(); 
            return res.status(201).json({ message: "ATA Form submitted successfully!", data: newForm });
        }

    } catch (error) {
        console.error("Error submitting ATA:", error);
        res.status(500).json({ error: "Failed to submit ATA Form: " + error.message });
    }
};
// ==========================================
// 🚦 3. ENDORSE / APPROVE / RETURN 
// ==========================================
export const approveATA = async (req, res) => {
    try {
        const { action, remarks } = req.body;
        const formId = req.params.id;
        
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        
        if (!liveUser) return res.status(404).json({ error: "User not found." });

        const primaryRole = liveUser.role; 
        const isPracticumCoord = liveUser.isPracticumCoordinator === true;
        const adminFullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();

        const form = await ATAForm.findById(formId);
        if (!form) return res.status(404).json({ error: "ATA Form not found." });

        let newStatus = form.status;
        let historyStatus = '';
        let appliedRole = primaryRole; 

        if (action === 'RETURN') {
            if (!remarks || remarks.trim() === '') {
                return res.status(400).json({ error: "Remarks are strictly required when returning a form." });
            }
            newStatus = 'DRAFT';
            historyStatus = 'RETURNED';
        } 
        else {
            switch (form.status) {
                case 'PENDING_CHAIR':
                    if (primaryRole === 'Program-Chair' && action === 'ENDORSE') {
                        const hasPracticum = form.sectionE_Practicum && form.sectionE_Practicum.length > 0;
                        
                        // 👇 SMART ROUTING: If the form belongs to a Dean, skip the Dean queue!
                        if (form.position === 'Dean') {
                            newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_VPAA';
                        } else {
                            newStatus = hasPracticum ? 'PENDING_PRACTICUM' : 'PENDING_DEAN';
                        }
                        historyStatus = 'ENDORSED';
                    } else return res.status(403).json({ error: "Invalid action for Chair." });
                    break;

                case 'PENDING_PRACTICUM':
                    if ((primaryRole === 'Practicum-Coordinator' || isPracticumCoord) && action === 'VALIDATE') {
                        historyStatus = 'VALIDATED';
                        appliedRole = 'Practicum-Coordinator'; 
                        
                        const requiredCoordinators = [...new Set(
                            (form.sectionE_Practicum || [])
                                .filter(row => row.coordinator && row.coordinator.trim() !== '')
                                .map(row => row.coordinator.trim().toLowerCase())
                        )];

                        const signedCoordinators = form.approvalHistory
                            .filter(log => log.approvalStatus === 'VALIDATED' || log.approverRole === 'Practicum-Coordinator')
                            .map(log => log.approverName.trim().toLowerCase());

                        signedCoordinators.push(adminFullName.toLowerCase()); 

                        const allSigned = requiredCoordinators.every(reqName => signedCoordinators.includes(reqName));

                        if (allSigned) {
                            // 👇 SMART ROUTING: If the form belongs to a Dean, skip the Dean queue!
                            newStatus = (form.position === 'Dean') ? 'PENDING_VPAA' : 'PENDING_DEAN'; 
                        } else {
                            newStatus = 'PENDING_PRACTICUM'; 
                        }
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
                        newStatus = 'PENDING_HR'; 
                        historyStatus = 'NOTED';
                    } else return res.status(403).json({ error: "Invalid action for VPAA." });
                    break;

                case 'PENDING_HR':
                    if (['HR', 'HRMO'].includes(primaryRole) && action === 'NOTE') {
                        // Return status to FINALIZED so it shows up in "My Approved Forms"
                        newStatus = 'FINALIZED'; 
                        historyStatus = 'FINALIZED'; 
                        form.archivedAt   = new Date();
                        form.archivedById = sessionUserID;
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
            signatureImage: liveUser.signatureImage || "",
            date: Date.now()
        });

        await form.save();

        let stayOnPage = false;
        
        if (newStatus === 'PENDING_PRACTICUM' && isPracticumCoord) {
            // 👇 SAFETY PATCH: Uses (form.sectionE_Practicum || [])
            const userIsListedCoord = (form.sectionE_Practicum || []).some(row =>
                row.coordinator && row.coordinator.trim().toLowerCase() === adminFullName.toLowerCase()
            );
            
            const alreadyValidated = form.approvalHistory.some(log =>
                log.approverRole === 'Practicum-Coordinator' && log.approverName.toLowerCase() === adminFullName.toLowerCase()
            );

            if (userIsListedCoord && !alreadyValidated) {
                stayOnPage = true; 
            }
        }

        res.status(200).json({ 
            message: `Success! Form is now ${newStatus}`,
            newStatus: newStatus,
            stayOnPage: stayOnPage 
        });

    } catch (error) { 
        console.error("APPROVE ATA ERROR:", error);
        res.status(500).json({ error: error.message }); 
    }
};

// ==========================================
// 📥 4. GET PENDING APPROVALS 
// ==========================================
export const getPendingApprovals = async (req, res) => {
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
        
        if (!liveUser) {
            return res.status(404).send("User not found in database.");
        }

        const userRole = liveUser.role || "Professor"; 
        const userProgram = liveUser.program || liveUser.department || "CpE"; 
        const fullName = `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim();
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        let queryConditions = [];

        if (userRole === 'Program-Chair') {
            // 👇 SMART QUERY: Grabs their own program OR the Dean's form
            queryConditions.push({ 
                status: 'PENDING_CHAIR', 
                $or: [
                    { college: userProgram }, // e.g., 'CpE'
                    { position: 'Dean' }      // The Dean's form
                ]
            });
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
        if (userRole === 'VPAA') {
            queryConditions.push({ status: 'PENDING_VPAA' }); 
        }
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

        let pendingForms = await ATAForm.find(query).sort({ createdAt: -1 });

        // 👇 NEW: THE INBOX HIDER 
        // Hides multi-coordinator forms from people who have already signed them!
        // 👇 UPGRADED: DUAL-ROLE INBOX HIDER 
        // Checks if you have signed for the specific required step, not just anywhere in the history!
        pendingForms = pendingForms.filter(form => {
            let requiredRoleForStep = '';
            
            if (form.status === 'PENDING_CHAIR') requiredRoleForStep = 'Program-Chair';
            else if (form.status === 'PENDING_PRACTICUM') requiredRoleForStep = 'Practicum-Coordinator';
            else if (form.status === 'PENDING_DEAN') requiredRoleForStep = 'Dean';
            else if (form.status === 'PENDING_VPAA') requiredRoleForStep = 'VPAA';
            else if (form.status === 'PENDING_HR') requiredRoleForStep = 'HR';

            // Find the index of the MOST RECENT "RESUBMITTED" action by the Professor
            let lastResubmitIndex = -1;
            for (let i = form.approvalHistory.length - 1; i >= 0; i--) {
                if (form.approvalHistory[i].approvalStatus === 'RESUBMITTED') {
                    lastResubmitIndex = i;
                    break;
                }
            }

            // Check if Marites signed it AFTER the last time it was resubmitted
            const alreadySignedForThisStep = form.approvalHistory.some((log, index) => {
                // If this signature happened BEFORE the resubmission, ignore it!
                if (index < lastResubmitIndex) return false;

                const nameMatch = log.approverName.toLowerCase() === fullName.toLowerCase();
                const roleMatch = log.approverRole === requiredRoleForStep || (requiredRoleForStep === 'HR' && ['HR', 'HRMO'].includes(log.approverRole));
                
                return nameMatch && roleMatch;
            });

            return !alreadySignedForThisStep;
        });

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

        if (userRole === 'Program-Chair') {
            // 👇 SMART QUERY: Ensures the Dean's form stays in their history after approval
            queryConditions.push({ 
                'approvalHistory.approverRole': 'Program-Chair',
                $or: [
                    { college: userProgram },
                    { position: 'Dean' }
                ]
            });
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
        if (userRole === 'VPAA') {
            queryConditions.push({
                $or: [
                    { 'approvalHistory.approverRole': 'VPAA' },
                    { status: { $in: ['PENDING_HR', 'ARCHIVED'] } } // ✅ PATCHED
                ]
            });
        }
        if (userRole === 'HR' || userRole === 'HRMO') {
            queryConditions.push({
                $or: [
                    { 'approvalHistory.approverRole': { $in: ['HR', 'HRMO'] } },
                    { status: 'ARCHIVED' }
                ]
            });
        }

        let query = {};
        if (queryConditions.length > 1) {
            query = { $or: queryConditions };
        } else if (queryConditions.length === 1) {
            query = queryConditions[0];
        } else {
            query = { _id: null }; 
        }

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
        
        const hasPracticum = form.sectionE_Practicum && form.sectionE_Practicum.length > 0;
        
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);

        res.render('ATA/review-ata', { 
            form: form, 
            role: liveUser ? liveUser.role : req.user.role,
            user: liveUser || req.user, 
            currentPageCategory: 'ata',
            hasPracticum: hasPracticum,
            totalRegularLoad: form.totalEffectiveUnits || 0,
            employmentType: form.employmentType || "Full-Time"
        });
    } catch (error) {
        console.error("Error fetching form:", error);
        res.status(500).send("Failed to load form.");
    }
};

// ==========================================
// 🖨️ 6. GENERATE FILLED PDF (FINAL VERSION)
// ==========================================
export const viewAtaPdf = async (req, res) => {
    try {
        const form = await ATAForm.findById(req.params.id);
        if (!form) return res.status(404).send("Form not found");

        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();

        const fillText = (fieldName, value) => {
            try { 
                if (value !== undefined && value !== null) {
                    const field = pdfForm.getTextField(fieldName);
                    field.setText(value.toString());
                    field.setFontSize(7); 
                } 
            } catch (err) {}
        };

        const getSum = (arr) => {
            if(!arr || !arr.length) return 0;
            return arr.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
        };

        fillText('text_1tvhi', form.facultyName);
        fillText('text_5jvwx', form.position);
        fillText('COLLEGE', form.college);
        fillText('text_2beim', form.employmentStatus);
        fillText('text_4wesx', form.address);
        
        const adminUnits = Number(form.sectionA_AdminUnits) || 0;
        if (adminUnits > 0) {
            fillText('text_36xvyn', adminUnits); 
        }
        try { 
            if (form.term) pdfForm.getDropdown('TERM').select(form.term.replace(" Term", "").toUpperCase()); 
        } catch (e) { console.log("Failed to map TERM"); }
        
        try { 
            if (form.academicYear) pdfForm.getDropdown('AY').select(form.academicYear); 
        } catch (e) { console.log("Failed to map AY"); }

       try { 
            if (form.term) {
                const cleanTerm = form.term.replace(" Term", "").toUpperCase();
                // Treat TERM1 as a dropdown!
                try { pdfForm.getDropdown('TERM1').select(cleanTerm); } 
                catch (e) { fillText('TERM1', cleanTerm); }
            }
        } catch(e) {}

        if (form.academicYear) {
            const years = form.academicYear.split('-'); // Splits "2026-2027" into ["2026", "2027"]
            if (years.length === 2) {
                // Treat YEAR1 as a dropdown (Stamps "2026")
                try { pdfForm.getDropdown('YEAR1').select(years[0]); } 
                catch (e) { fillText('YEAR1', years[0]); }
                
                // Selects "2027"
                try { pdfForm.getDropdown('dropdown_87etxp').select(years[1]); } 
                catch(e) { fillText('dropdown_87etxp', years[1]); }
            }
        }

        try {
            if (form.employmentType === 'Full-Time') pdfForm.getCheckBox('checkbox_7vfdl').check();
            if (form.employmentType === 'Part-Time') pdfForm.getCheckBox('checkbox_8omuk').check();
        } catch (e) {}

        const safeForEach = (array, mappingCols, limit) => {
            if (!array || !Array.isArray(array)) return;
            array.forEach((row, i) => {
                if (i < limit) {
                    Object.keys(mappingCols).forEach(key => fillText(mappingCols[key][i], row[key]));
                }
            });
        };

        safeForEach(form.sectionB_WithinCollege, {
            courseCode: ['text_10kmln', 'text_11ywye', 'text_12funt', 'text_13cbrv', 'text_14oddx', 'text_15vwye', 'text_16zhiz', 'text_17arqj', 'text_18yeyt', 'text_19usez'],
            section: ['text_60olqb', 'text_61lnlx', 'text_62qqva', 'text_63scfz', 'text_64yecq', 'text_65guog', 'text_66qocy', 'text_67vs', 'text_68hldf', 'text_69pugt'],
            units:   ['text_70cmcr', 'text_71yakp', 'text_72gwrs', 'text_73lgtb', 'text_74hsiw', 'text_75oeti', 'text_76gklh', 'text_88yf',  'text_89wumx', 'text_90gzrv'],
            effectiveDate: ['text_91nlsp', 'text_92akoo', 'text_93paai', 'text_95sxfz', 'text_96erde', 'text_97xhu',  'text_98nlys', 'text_99teyw', 'text_100vjjp','text_101dvuo']
        }, 10);
        fillText('text_57cmig', getSum(form.sectionB_WithinCollege)); 

        safeForEach(form.sectionC_OtherCollege, {
            courseCode: ['text_47rebo', 'text_48qzlp', 'text_49jhlb', 'text_50tsch', 'text_51hunk', 'text_52yzee', 'text_53upjj', 'text_54prkk', 'text_55qvgs', 'text_56krii'],
            section: ['text_102lvno','text_103vhsh','text_104slei','text_105slnh','text_106ybso','text_107vcxk','text_108akar','text_109bggl','text_110qjji','text_111lbn'],
            units:   ['text_112udtm','text_113dznl','text_114ls',  'text_115lgxa','text_116faud','text_117jugg','text_118mlep','text_119nrkb','text_120kvok','text_121xhpk'],
            effectiveDate: ['text_122aymw','text_123wfov','text_124mqbu','text_125brsh','text_126soxx','text_127fsch','text_128nioh','text_129bo',  'text_130bcsd','text_131uwop']
        }, 10);
        fillText('text_58ltsz', getSum(form.sectionC_OtherCollege)); 
        fillText('text_59oaji', form.totalEffectiveUnits); 

        safeForEach(form.sectionD_AdminWork, {
            workDescription: ['text_20guwb', 'text_21mcrd', 'text_22cvxd', 'text_23wmjb', 'text_24klgl', 'text_25qlo',  'text_26rjfo', 'text_27yhai', 'text_28zdmg', 'text_29pzoo'],
            units: ['text_145jwbs','text_146wauh','text_147ehza','text_148bmno','text_149doip','text_150vtzu','text_151bojp','text_152hqsk','text_153hzhi','text_154rarc'],
            effectiveDate: ['text_156wiqa','text_157mlzt','text_158huzn','text_159evta','text_160kjvt','text_161vlsi','text_162taez','text_163jzvw','text_164xnnl','text_165tghd']
        }, 10);

        safeForEach(form.sectionE_Practicum, {
            courseCode: ['text_33orrs', 'text_34wipa', 'text_35oa',   'text_40ebhe', 'text_41pvju', 'text_42sfft', 'text_43aaxp', 'text_44pkqs', 'text_45oyci', 'text_46sba'],
            numberOfStudents: ['text_166lylu','text_167pzwu','text_168petn','text_169nzbj','text_170iphf','text_171zthi','text_172uhtp','text_173kvtu','text_174iafc','text_175wnlh'],
            coordinator: ['text_176plma','text_177kwyx','text_178bleo','text_179hjnh','text_180znjo','text_181jcgm','text_182hixs','text_183eow', 'text_184ccue','text_185nzmw']
        }, 10);

        safeForEach(form.sectionF_OutsideEmployment, {
            employer: ['text_30zgdb', 'text_31svix', 'text_32swnc'],
            position: ['text_132vcas', 'text_133fnhe', 'text_134zdas'],
            courseOrUnits: ['text_186xbfm', 'text_187ovcx', 'text_188mvam'],
            hoursPerWeek: ['text_189wqci', 'text_190bgcl', 'text_191vbow']
        }, 3);

        const sectionG_Cols = {
            courseId: ['text_192hjls', 'text_193wxqe', 'text_194yhdr', 'text_195fnhw', 'text_196lkcn', 'text_197fbom'],
            moduleCode: ['text_198qwfc', 'text_199rrkq', 'text_200qtaf', 'text_201kfpr', 'text_202clmr', 'text_203ixre'],
            section: ['text_204koex', 'text_205fpjg', 'text_206vilo', 'text_207ycmc', 'text_208ct', 'text_209yyje'],
            units: ['text_210hcgg', 'text_211vjtw', 'text_212aiiv', 'text_213hris', 'text_214rxes', 'text_215glxf'],
            numberOfStudents: ['text_216libu', 'text_217ppog', 'text_218xytr', 'text_219rsjy', 'text_220nnsl', 'text_221plmo'],
            effectiveUnits: ['text_223ralg', 'text_224jzoz', 'text_225ywjn', 'text_226dtgn', 'text_227hemq', 'text_228hoxb']
        };

        const sectionG = form.sectionG_Remedial || [];
        sectionG.forEach((row, i) => {
            if (i < 6) {
                fillText(sectionG_Cols.courseId[i], row.courseId);
                fillText(sectionG_Cols.moduleCode[i], row.moduleCode);
                fillText(sectionG_Cols.section[i], row.section);
                fillText(sectionG_Cols.units[i], row.units);
                fillText(sectionG_Cols.numberOfStudents[i], row.numberOfStudents);
                
                let effUnits = (Number(row.units) || 0) * ((Number(row.numberOfStudents) || 0) / 40);
                if (row.type === 'lab') effUnits *= 2;
                if (effUnits > 0) fillText(sectionG_Cols.effectiveUnits[i], effUnits.toFixed(2));
            }
        });
        
        fillText('text_222pgqw', form.totalRemedialUnits); 

        // ==========================================
        // 3. OFFICIAL SIGNATURES & STAMPING
        // ==========================================
        const formattedCreationDate = new Date(form.createdAt).toLocaleDateString('en-US');
        fillText('text_84skhw', `${form.facultyName} | ${formattedCreationDate}`); 

        if (form.facultySignature && form.facultySignature.startsWith('data:image')) {
            try {
                const sigField = pdfForm.getTextField('text_84skhw');
                const widgets = sigField.acroField.getWidgets();
                
                if (widgets && widgets.length > 0) {
                    const rect = widgets[0].getRectangle();
                    const firstPage = pdfDoc.getPages()[0];
                    const pngImage = await pdfDoc.embedPng(form.facultySignature);
                    const pngDims = pngImage.scale(0.3); 

                    firstPage.drawImage(pngImage, {
                        x: rect.x,
                        y: rect.y - 15, 
                        width: pngDims.width,
                        height: pngDims.height,
                    });
                }
            } catch (e) {
                console.error("Failed to stamp database signature:", e);
            }
        }

        // Grabbing logs and printing names/dates
        const getSignature = (role) => form.approvalHistory.find(log => log.approverRole === role);
        
        const chairLog = getSignature('Program-Chair');
        if (chairLog) fillText('text_83xjqp', `${chairLog.approverName} | ${new Date(chairLog.date).toLocaleDateString('en-US')}`);

        const deanLog = getSignature('Dean');
        if (deanLog) fillText('text_80trhj', `${deanLog.approverName} | ${new Date(deanLog.date).toLocaleDateString('en-US')}`);

        const vpaaLog = getSignature('VPAA');
        if (vpaaLog) fillText('text_81gbif', `${vpaaLog.approverName} | ${new Date(vpaaLog.date).toLocaleDateString('en-US')}`);

        const hrLog = form.approvalHistory.find(log => ['HR', 'HRMO'].includes(log.approverRole));
        if (hrLog) fillText('text_82wmdd', `${hrLog.approverName} | ${new Date(hrLog.date).toLocaleDateString('en-US')}`);

        // VIP Stamper Engine
        const stampAdminSignature = async (log, boxName, offsetX = 0, offsetY = 0, customScale = 0.3) => {
            if (log && log.signatureImage && log.signatureImage.startsWith('data:image')) {
                try {
                    const field = pdfForm.getTextField(boxName);
                    const widgets = field.acroField.getWidgets();
                    if (widgets && widgets.length > 0) {
                        const rect = widgets[0].getRectangle();
                        const page = pdfDoc.getPages()[0];
                        const pngImage = await pdfDoc.embedPng(log.signatureImage);
                        const pngDims = pngImage.scale(customScale); 
                        
                        page.drawImage(pngImage, {
                            x: rect.x + offsetX,
                            y: rect.y + offsetY,
                            width: pngDims.width,
                            height: pngDims.height,
                        });
                    }
                } catch (e) {
                    console.error(`Failed to stamp admin signature for ${boxName}:`, e);
                }
            }
        };

        // Command big signatures
        if (chairLog) await stampAdminSignature(chairLog, 'text_83xjqp'); 
        if (deanLog) await stampAdminSignature(deanLog, 'text_80trhj', 0, -10);   
        if (vpaaLog) await stampAdminSignature(vpaaLog, 'text_81gbif', 30, -10);
        if (hrLog) await stampAdminSignature(hrLog, 'text_82wmdd', 0, -13);

        // 👇 MULTI-COORDINATOR SMART STAMPER
        if (form.sectionE_Practicum && form.sectionE_Practicum.length > 0) {
            const pracBoxes = ['text_176plma','text_177kwyx','text_178bleo','text_179hjnh','text_180znjo','text_181jcgm','text_182hixs','text_183eow', 'text_184ccue','text_185nzmw'];
            
            const allPracLogs = form.approvalHistory.filter(log => log.approverRole === 'Practicum-Coordinator');

            for (let i = 0; i < form.sectionE_Practicum.length; i++) {
                const row = form.sectionE_Practicum[i];
                
                if (i < 10 && row.coordinator && row.coordinator.trim() !== '') {
                    const matchingLog = allPracLogs.find(log => 
                        log.approverName.toLowerCase() === row.coordinator.trim().toLowerCase()
                    );
                    if (matchingLog) {
                        await stampAdminSignature(matchingLog, pracBoxes[i], 45, -8, 0.12);
                    }
                }
            }
        }
        // 👇 MULTI-COORDINATOR SMART STAMPER
        if (form.sectionE_Practicum && form.sectionE_Practicum.length > 0) {
            const pracBoxes = ['text_176plma','text_177kwyx','text_178bleo','text_179hjnh','text_180znjo','text_181jcgm','text_182hixs','text_183eow', 'text_184ccue','text_185nzmw'];
            
            const allPracLogs = form.approvalHistory.filter(log => log.approverRole === 'Practicum-Coordinator');

            for (let i = 0; i < form.sectionE_Practicum.length; i++) {
                const row = form.sectionE_Practicum[i];
                
                if (i < 10 && row.coordinator && row.coordinator.trim() !== '') {
                    const matchingLog = allPracLogs.find(log => 
                        log.approverName.toLowerCase() === row.coordinator.trim().toLowerCase()
                    );
                    if (matchingLog) {
                        await stampAdminSignature(matchingLog, pracBoxes[i], 45, -8, 0.12);
                    }
                }
            }
        }

        // 👇 NEW: SECTION C AUTO-STAMPER FOR PROGRAM CHAIR
        if (chairLog && form.sectionC_OtherCollege && form.sectionC_OtherCollege.length > 0) {
            const sectionCSigBoxes = [
                'text_135vkpf', 'text_136xvan', 'text_137jepq', 'text_138qntu', 'text_139xse', 
                'text_140zwmd', 'text_141xurk', 'text_142xqwx', 'text_143qipa', 'text_144qixn'
            ];
            
            for (let i = 0; i < form.sectionC_OtherCollege.length; i++) {
                const row = form.sectionC_OtherCollege[i];
                
                // Only stamp if the row actually has a course typed in!
                if (i < 10 && row.courseCode && row.courseCode.trim() !== '') {
                    // Stamps the Chair's signature scaled down to 12% to fit the table perfectly
                    await stampAdminSignature(chairLog, sectionCSigBoxes[i], 10, -5, 0.12);
                }
            }
        }
        // 👆 END OF SECTION C AUTO-STAMPER

        // PERFECTED OVERLOAD JUSTIFICATION LOGIC
        const regularLoad = form.totalEffectiveUnits || 0;
        const isPartTime = form.employmentType === 'Part-Time';
        const overloadLimit = isPartTime ? 11 : 15;

        if (regularLoad > overloadLimit) {
            const chairRemarks = chairLog && chairLog.remarks && chairLog.remarks.trim() !== '' 
                ? chairLog.remarks 
                : "Justification pending Program Chair review.";
            
            let remainingText = chairRemarks;
            let lines = ['', '', ''];
            const MAX_CHARS = 155; 

            for (let i = 0; i < 3; i++) {
                if (remainingText.length === 0) break;
                if (remainingText.length <= MAX_CHARS) {
                    lines[i] = remainingText;
                    break;
                }
                
                let breakPoint = remainingText.lastIndexOf(' ', MAX_CHARS);
                if (breakPoint === -1 || breakPoint === 0) {
                    breakPoint = MAX_CHARS; 
                }
                
                lines[i] = remainingText.substring(0, breakPoint).trim();
                remainingText = remainingText.substring(breakPoint).trim();
            }
            
            fillText('text_77ynib', lines[0]);
            fillText('text_78xlcm', lines[1]);
            fillText('text_79mcxn', lines[2]);
        } else {
            fillText('text_77ynib', "N/A");
        }

        const allFields = pdfForm.getFields();
        const firstPage = pdfDoc.getPages()[0];
        
        const dropdownData = [];
        
        allFields.forEach(field => {
            if (field.constructor.name === 'PDFDropdown') {
                const selected = field.getSelected();
                const val = selected && selected.length > 0 ? selected[0] : '';
                
                const widgets = field.acroField.getWidgets();
                if (widgets && widgets.length > 0) {
                    dropdownData.push({ field: field, val: val, rect: widgets[0].getRectangle() });
                }
            } else {
                field.enableReadOnly();
            }
        });

        dropdownData.forEach(data => {
            pdfForm.removeField(data.field); 
            if (data.val) {
                firstPage.drawText(data.val, {
                    x: data.rect.x + 2,
                    y: data.rect.y + 4, 
                    size: 8
                });
            }
        });

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
// 📊 7. DASHBOARD METRICS ENGINE 
// ==========================================
export const renderDashboard = async (req, res) => {
    try {
        // 👇 FIXED: Tell it to check req.session.user (which your login system uses)
        const sessionData = req.session?.user || req.user;
        
        if (!sessionData) {
            console.error("No session data found. Redirecting to login.");
            return res.redirect('/login');
        }

        let sessionUserID = "unknown";
        if (sessionData._id && sessionData._id.$oid) sessionUserID = sessionData._id.$oid;
        else if (sessionData._id) sessionUserID = sessionData._id.toString();
        else if (sessionData.id) sessionUserID = sessionData.id;
        else if (sessionData.employeeId) sessionUserID = sessionData.employeeId;

        // If it's still unknown, block the database call so it doesn't crash
        if (sessionUserID === "unknown") {
            console.error("Could not extract a valid ID from the session object.");
            return res.redirect('/login');
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);
        if (!liveUser) return res.status(404).send("User not found in database.");

        const liveRole = liveUser.role || "Professor";
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        const myPendingCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: { $regex: 'PENDING' } 
        });

        const myApprovedCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: 'FINALIZED' 
        });

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

        res.render('ATA/dashboard_window', {
            user: liveUser,
            role: liveRole, 
            employmentType: liveUser.employmentType,
            isPracticumCoordinator: isPracticumCoordinator,
            myPendingCount,
            myApprovedCount,
            lastSubmissionDate,
            lastStatus,
            totalUnits,
            effectiveUnits,
            currentPageCategory: 'ata' // Ensures the sidebar highlights the ATA button!
        });

    } catch (error) {
        console.error("Error loading dashboard metrics:", error);
        res.status(500).send("Failed to load dashboard.");
    }
};

// ==========================================
// 🩻 8. GENERATE LIVE PDF PREVIEW 
// ==========================================
export const previewAtaPdf = async (req, res) => {
    try {
        const formData = req.body;
        const totals = calculateUnits(formData);

        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();

        const fillText = (fieldName, value) => {
            try { 
                if (value !== undefined && value !== null) {
                    const field = pdfForm.getTextField(fieldName);
                    field.setText(value.toString());
                    field.setFontSize(7); 
                } 
            } catch (err) {}
        };

        fillText('text_1tvhi', formData.facultyName);
        fillText('text_5jvwx', formData.position);
        fillText('COLLEGE', formData.college);
        fillText('text_2beim', formData.employmentStatus);
        fillText('text_4wesx', formData.address);
        const adminUnits = Number(formData.sectionA_AdminUnits) || 0;
        if (adminUnits > 0) {
            fillText('text_36xvyn', adminUnits); 
        }
        try { 
            if (formData.term) pdfForm.getDropdown('TERM').select(formData.term.replace(" Term", "").toUpperCase()); 
        } catch (e) { console.log("Failed to map TERM preview"); }
        
        try { 
            if (formData.academicYear) pdfForm.getDropdown('AY').select(formData.academicYear); 
        } catch (e) { console.log("Failed to map AY preview"); }
        try { 
            if (formData.term) {
                const cleanTerm = formData.term.replace(" Term", "").toUpperCase();
                try { pdfForm.getDropdown('TERM1').select(cleanTerm); } 
                catch (e) { fillText('TERM1', cleanTerm); }
            }
        } catch(e) {}

        if (formData.academicYear) {
            const years = formData.academicYear.split('-'); 
            if (years.length === 2) {
                try { pdfForm.getDropdown('YEAR1').select(years[0]); } 
                catch (e) { fillText('YEAR1', years[0]); }
                
                try { pdfForm.getDropdown('dropdown_87etxp').select(years[1]); } 
                catch(e) { fillText('dropdown_87etxp', years[1]); }
            }
        }

        try {
            if (formData.employmentType === 'Full-Time') pdfForm.getCheckBox('checkbox_7vfdl').check();
            if (formData.employmentType === 'Part-Time') pdfForm.getCheckBox('checkbox_8omuk').check();
        } catch (e) {}

        const safeForEach = (array, mappingCols, limit) => {
            if (!array || !Array.isArray(array)) return;
            array.forEach((row, i) => {
                if (i < limit) {
                    Object.keys(mappingCols).forEach(key => fillText(mappingCols[key][i], row[key]));
                }
            });
        };

        safeForEach(formData.sectionB_WithinCollege, {
            courseCode: ['text_10kmln', 'text_11ywye', 'text_12funt', 'text_13cbrv', 'text_14oddx', 'text_15vwye', 'text_16zhiz', 'text_17arqj', 'text_18yeyt', 'text_19usez'],
            section: ['text_60olqb', 'text_61lnlx', 'text_62qqva', 'text_63scfz', 'text_64yecq', 'text_65guog', 'text_66qocy', 'text_67vs', 'text_68hldf', 'text_69pugt'],
            units:   ['text_70cmcr', 'text_71yakp', 'text_72gwrs', 'text_73lgtb', 'text_74hsiw', 'text_75oeti', 'text_76gklh', 'text_88yf',  'text_89wumx', 'text_90gzrv'],
            effectiveDate: ['text_91nlsp', 'text_92akoo', 'text_93paai', 'text_95sxfz', 'text_96erde', 'text_97xhu',  'text_98nlys', 'text_99teyw', 'text_100vjjp','text_101dvuo']
        }, 10);
        fillText('text_57cmig', totals.sumB); 

        safeForEach(formData.sectionC_OtherCollege, {
            courseCode: ['text_47rebo', 'text_48qzlp', 'text_49jhlb', 'text_50tsch', 'text_51hunk', 'text_52yzee', 'text_53upjj', 'text_54prkk', 'text_55qvgs', 'text_56krii'],
            section: ['text_102lvno','text_103vhsh','text_104slei','text_105slnh','text_106ybso','text_107vcxk','text_108akar','text_109bggl','text_110qjji','text_111lbn'],
            units:   ['text_112udtm','text_113dznl','text_114ls',  'text_115lgxa','text_116faud','text_117jugg','text_118mlep','text_119nrkb','text_120kvok','text_121xhpk'],
            effectiveDate: ['text_122aymw','text_123wfov','text_124mqbu','text_125brsh','text_126soxx','text_127fsch','text_128nioh','text_129bo',  'text_130bcsd','text_131uwop']
        }, 10);
        fillText('text_58ltsz', totals.sumC); 
        fillText('text_59oaji', totals.totalEffectiveUnits); 

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
            employer: ['text_30zgdb', 'text_31svix', 'text_32swnc'],
            position: ['text_132vcas', 'text_133fnhe', 'text_134zdas'],
            courseOrUnits: ['text_186xbfm', 'text_187ovcx', 'text_188mvam'],
            hoursPerWeek: ['text_189wqci', 'text_190bgcl', 'text_191vbow']
        }, 3);

        const sectionG_Cols = {
            courseId: ['text_192hjls', 'text_193wxqe', 'text_194yhdr', 'text_195fnhw', 'text_196lkcn', 'text_197fbom'],
            moduleCode: ['text_198qwfc', 'text_199rrkq', 'text_200qtaf', 'text_201kfpr', 'text_202clmr', 'text_203ixre'],
            section: ['text_204koex', 'text_205fpjg', 'text_206vilo', 'text_207ycmc', 'text_208ct', 'text_209yyje'],
            units: ['text_210hcgg', 'text_211vjtw', 'text_212aiiv', 'text_213hris', 'text_214rxes', 'text_215glxf'],
            numberOfStudents: ['text_216libu', 'text_217ppog', 'text_218xytr', 'text_219rsjy', 'text_220nnsl', 'text_221plmo'],
            effectiveUnits: ['text_223ralg', 'text_224jzoz', 'text_225ywjn', 'text_226dtgn', 'text_227hemq', 'text_228hoxb']
        };

        const sectionG = formData.sectionG_Remedial || [];
        sectionG.forEach((row, i) => {
            if (i < 6) { 
                fillText(sectionG_Cols.courseId[i], row.courseId);
                fillText(sectionG_Cols.moduleCode[i], row.moduleCode);
                fillText(sectionG_Cols.section[i], row.section);
                fillText(sectionG_Cols.units[i], row.units);
                fillText(sectionG_Cols.numberOfStudents[i], row.numberOfStudents);
                
                let effUnits = (Number(row.units) || 0) * ((Number(row.numberOfStudents) || 0) / 40);
                if (row.type === 'lab') effUnits *= 2;
                if (effUnits > 0) fillText(sectionG_Cols.effectiveUnits[i], effUnits.toFixed(2));
            }
        });
        
        fillText('text_222pgqw', totals.totalRemedialUnits); 
        fillText('text_84skhw', `${formData.facultyName} | ${new Date().toLocaleDateString('en-US')}`); 

        if (formData.facultySignature && formData.facultySignature.startsWith('data:image')) {
            try {
                const sigField = pdfForm.getTextField('text_84skhw');
                const widgets = sigField.acroField.getWidgets();
                
                if (widgets && widgets.length > 0) {
                    const rect = widgets[0].getRectangle();
                    const firstPage = pdfDoc.getPages()[0];
                    
                    const pngImage = await pdfDoc.embedPng(formData.facultySignature);
                    const pngDims = pngImage.scale(0.3); 

                    firstPage.drawImage(pngImage, {
                        x: rect.x,
                        y: rect.y - 15, 
                        width: pngDims.width,
                        height: pngDims.height,
                    });
                }
            } catch (e) {
                console.error("Failed to stamp live signature preview:", e);
            }
        }

        const regularLoad = totals.totalEffectiveUnits || 0;
        const isPartTime = formData.employmentType === 'Part-Time';
        const overloadLimit = isPartTime ? 11 : 15;

        if (regularLoad > overloadLimit) {
            if (formData.justification && formData.justification.trim() !== '') {
                
                let remainingText = formData.justification;
                let lines = ['', '', ''];
                const MAX_CHARS = 155; 

                for (let i = 0; i < 3; i++) {
                    if (remainingText.length === 0) break;
                    if (remainingText.length <= MAX_CHARS) {
                        lines[i] = remainingText;
                        break;
                    }
                    
                    let breakPoint = remainingText.lastIndexOf(' ', MAX_CHARS);
                    if (breakPoint === -1 || breakPoint === 0) {
                        breakPoint = MAX_CHARS; 
                    }
                    
                    lines[i] = remainingText.substring(0, breakPoint).trim();
                    remainingText = remainingText.substring(breakPoint).trim();
                }
                
                fillText('text_77ynib', lines[0]);
                fillText('text_78xlcm', lines[1]);
                fillText('text_79mcxn', lines[2]);

            } else {
                fillText('text_77ynib', "OVERLOAD DETECTED:");
                fillText('text_78xlcm', "Justification will be provided by the Program Chair upon review and endorsement.");
            }
        } else {
            fillText('text_77ynib', "N/A");
        }

        const allFields = pdfForm.getFields();
        const firstPage = pdfDoc.getPages()[0];
        
        const dropdownData = [];
        
        allFields.forEach(field => {
            if (field.constructor.name === 'PDFDropdown') {
                const selected = field.getSelected();
                const val = selected && selected.length > 0 ? selected[0] : '';
                
                const widgets = field.acroField.getWidgets();
                if (widgets && widgets.length > 0) {
                    dropdownData.push({ field: field, val: val, rect: widgets[0].getRectangle() });
                }
            } else {
                field.enableReadOnly();
            }
        });

        dropdownData.forEach(data => {
            pdfForm.removeField(data.field); 
            if (data.val) {
                firstPage.drawText(data.val, {
                    x: data.rect.x + 2,
                    y: data.rect.y + 4, 
                    size: 8
                });
            }
        });
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("Preview PDF Error:", error);
        res.status(500).json({ error: "Failed to generate preview." });
    }
};
// ==========================================
// 🗄️ 8. ARCHIVED FORMS ENGINE
// ==========================================
export const getArchivedATAs = async (req, res) => {
    try {
        // Since we will use requireAuth middleware, req.user is guaranteed to exist!
        const sessionData = req.user; 
        
        // Fetch ALL forms that have been finalized by HR
        const archivedForms = await ATAForm.find({ status: 'FINALIZED' })
            .sort({ updatedAt: -1 }) 
            .lean();

        // Render the Archive Page
        res.render('ATA/archived-atas', {
            user: sessionData, 
            role: sessionData.role,
            forms: archivedForms,
            totalCount: archivedForms.length,
            currentPageCategory: 'ata' 
        });
    } catch (error) {
        console.error("Error loading archived ATAs:", error);
        res.status(500).send("Failed to load archive.");
    }
};
// ==========================================
// 🩻 PDF X-RAY 
// ==========================================
export const discoverPdfFields = async (req, res) => {
    try {
        const templatePath = path.join(__dirname, '../templates/ATA-College-Blank.pdf'); 
        const existingPdfBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pdfForm = pdfDoc.getForm();
        const fields = pdfForm.getFields();
        
        fields.forEach(field => {
            const type = field.constructor.name;
            const name = field.getName();
            
            try {
                if (type === 'PDFTextField') {
                    const textField = pdfForm.getTextField(name);
                    textField.setText(name); 
                    textField.setFontSize(6); 
                } 
                else if (type === 'PDFDropdown') {
                    const dropField = pdfForm.getDropdown(name);
                    dropField.addOptions([name]);
                    dropField.select(name);
                }
                else if (type === 'PDFCheckBox') {
                    pdfForm.getCheckBox(name).check();
                }
            } catch (err) {}
        });

        pdfForm.flatten(); 
        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=Visual_PDF_Map.pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("X-Ray Error:", error);
        res.status(500).send("Failed to generate visual PDF map.");
    }
};