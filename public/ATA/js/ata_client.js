// ==========================================
// 0. INITIALIZE SIGNATURE PAD
// ==========================================
let signaturePad;
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('signatureCanvas');
    if (canvas) {
        signaturePad = new SignaturePad(canvas, {
            penColor: "rgb(0, 0, 0)", // Black ink
            backgroundColor: "rgba(0,0,0,0)" // Transparent background
        });

        document.getElementById('clearSignatureBtn').addEventListener('click', () => {
            signaturePad.clear();
        });
    }
});

// ==========================================
// 1. HAMBURGER MENU & UI UTILITIES
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (hamburgerMenu && sidebar && sidebarOverlay) {
        hamburgerMenu.addEventListener('click', () => {
            hamburgerMenu.classList.toggle('active');
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            hamburgerMenu.classList.remove('active');
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    if(window.handleInnerSectionVisibility) window.handleInnerSectionVisibility();
});

const backButton = document.querySelector('.back-button');
if (backButton) {
    backButton.addEventListener('click', () => {
        window.location.href = '/ata-main';
    });
}

// ==========================================
// 2. USER STATE (Strict Validation & Security)
// ==========================================
const rawRole = document.body.getAttribute('data-role');
const rawEmployment = document.body.getAttribute('data-employment');
const rawPracticum = document.body.getAttribute('data-practicum');

const path = window.location.pathname;
const isPublicPage = path === '/' || path === '/ata' || path === '/ata/' || path.startsWith('/auth');

if (!isPublicPage) {
    if (!rawRole || rawRole.trim() === "" || !rawEmployment || rawEmployment.trim() === "") {
        alert("⚠️ Security Error: Missing or invalid real-time session data. Logging out for your protection.");
        window.location.href = '/auth/logout'; 
        throw new Error("FATAL: Session data corrupted. Halting script execution."); 
    }
}

window.currentUser = {
    role: rawRole || "Professor", 
    employmentType: rawEmployment || "Full-Time",
    employmentFromOutside: (rawEmployment === "Part-Time"),
    isPracticumCoordinator: (rawPracticum === "true") 
};

document.addEventListener('DOMContentLoaded', () => {
    const partTimeRadio = document.getElementById('radioPartTime');
    const fullTimeRadio = document.getElementById('radioFullTime');

    if (window.currentUser.role === 'Dean') {
        window.currentUser.employmentType = "Full-Time";
        window.currentUser.employmentFromOutside = false;
        
        if (fullTimeRadio) fullTimeRadio.checked = true;
        if (partTimeRadio) {
            partTimeRadio.disabled = true;
            partTimeRadio.parentElement.style.opacity = "0.5";
            partTimeRadio.parentElement.style.cursor = "not-allowed";
            partTimeRadio.parentElement.setAttribute("title", "Deans are required to be Full-Time.");
        }
    } else {
        if (window.currentUser.employmentType === "Part-Time") {
            if (partTimeRadio) partTimeRadio.checked = true;
        } else {
            if (fullTimeRadio) fullTimeRadio.checked = true;
        }
    }

    const employmentRadios = document.querySelectorAll('input[name="employment"]');
    employmentRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            window.currentUser.employmentType = e.target.value;
            window.currentUser.employmentFromOutside = (e.target.value === "Part-Time");
            
            // 👇 FIXED: Wipe Section F inputs clean if they switch to Full-Time
            if (e.target.value === "Full-Time") {
                document.querySelectorAll('#form4 input').forEach(input => input.value = '');
            }
            
            if (window.currentStep === 4 && !window.isStepVisible(4)) {
                window.currentStep = 3; 
                if(window.updateFormDisplay) window.updateFormDisplay();
            } else {
                if(window.updateFormDisplay) window.updateFormDisplay(true); 
            }
        });
    });

    const positionSelect = document.getElementById('position');
    const collegeSelect = document.getElementById('college');

    if (positionSelect) {
        const role = window.currentUser.role;
        
        if (role === 'Program-Chair' || role === 'Dean' || role === 'Practicum-Coordinator') {
            positionSelect.value = role; 
            positionSelect.disabled = true; 
            positionSelect.style.cursor = 'not-allowed';
            positionSelect.style.opacity = '0.6';
            positionSelect.setAttribute('title', 'Your position is securely locked to your administrative role.');
            
            if (role === 'Dean' && collegeSelect) {
                collegeSelect.value = 'CEA';
                collegeSelect.disabled = true;
                collegeSelect.style.cursor = 'not-allowed';
                collegeSelect.style.opacity = '0.6';
                collegeSelect.setAttribute('title', 'Deans are mapped to the entire CEA College.');
            }
        } 
        else {
            Array.from(positionSelect.options).forEach(option => {
                if (['Program-Chair', 'Dean', 'Practicum-Coordinator'].includes(option.value)) {
                    option.disabled = true; 
                    option.style.display = 'none'; 
                }
            });
        }
    }

    if(window.handleInnerSectionVisibility) window.handleInnerSectionVisibility();
});

// ==========================================
// 3. VISIBILITY LOGIC (Dynamic Rules)
// ==========================================
window.isAdminUser = function() {
    const adminRoles = ['Program-Chair', 'Dean', 'Admin', 'VPAA', 'HR', 'HRMO'];
    
    return (adminRoles.includes(window.currentUser.role) || 
            window.currentUser.isPracticumCoordinator);
};
window.isStepVisible = function(stepNumber) {
    const isPartTime = window.currentUser.employmentFromOutside;

    switch(stepNumber) {
        case 1: return true; 
        case 2: return true; 
        case 3: return true; 
        case 4: return isPartTime; 
        case 5: return true; 
        case 6: return true; 
        case 7: return window.isAdminUser(); 
        default: return false;
    }
};

window.handleInnerSectionVisibility = function() {
    const adminMode = window.isAdminUser(); 

    const sectionA = document.getElementById('sectionA_Container'); 
    if (sectionA) sectionA.style.display = adminMode ? 'block' : 'none';

    const sectionD = document.getElementById('sectionD_Container');
    if (sectionD) sectionD.style.display = adminMode ? 'block' : 'none';

    const dashboardBtn = document.getElementById('adminCourseBtn');
    if (dashboardBtn) dashboardBtn.style.display = adminMode ? 'block' : 'none';

    const adminApprovalCard = document.getElementById('adminApprovalCard');
    if (adminApprovalCard) adminApprovalCard.style.display = adminMode ? 'block' : 'none';

    const isHighAdmin = (window.currentUser.role === 'Program-Chair' || window.currentUser.role === 'Dean');
    const form6SignatureRows = document.querySelectorAll('#form6 .signature-row');
    
    form6SignatureRows.forEach(row => {
        row.style.display = isHighAdmin ? 'none' : ''; 
    });
};

// ==========================================
// 4. CALCULATE SUMMARY TOTALS & SMART TOGGLES
// ==========================================
window.calculateSummary = function() {
    // 👇 Added G_raw to separate raw units from effective units!
    let totals = { A: 0, B: 0, C: 0, D: 0, G_raw: 0, G_eff: 0 };

    const getUnit = (row, colIndex) => {
        const cell = row.children[colIndex];
        if (!cell) return 0;
        const el = cell.querySelector('input, select');
        return el ? (Number(el.value) || 0) : 0;
    };

    totals.A = Number(document.getElementById('teachingUnits1')?.value) || 0;

    let isSectionC = false;
    const form2Inner = document.querySelector('#form2 .ata-form');
    if (form2Inner) {
        Array.from(form2Inner.children).forEach(child => {
            if (child.classList.contains('form-divider')) isSectionC = true;
            if (child.classList.contains('course-row')) {
                if (isSectionC) totals.C += getUnit(child, 2);
                else totals.B += getUnit(child, 2);
            }
        });
    }

    document.querySelectorAll('#form3 .admin-row').forEach(row => totals.D += getUnit(row, 1));
    
    document.querySelectorAll('#form5 .remedial-row').forEach(row => {
        const units = getUnit(row, 3);
        const students = getUnit(row, 4);
        const typeCell = row.children[5];
        const typeSelect = typeCell ? typeCell.querySelector('select') : null;
        const type = typeSelect ? typeSelect.value : "lecture";

        totals.G_raw += units; // Tracks the raw input units perfectly!

        let effective = units * (students / 40);
        if (type === 'lab') effective *= 2;
        totals.G_eff += effective;
    });

    // 1. Push LIVE totals to active form pages
    const totalB = document.querySelectorAll('#form2 .total-value')[0];
    const totalC = document.querySelectorAll('#form2 .total-value')[1];
    const totalD = document.querySelector('#form3 .total-value');
    
    if (totalB) totalB.textContent = totals.B;
    if (totalC) totalC.textContent = totals.C;
    if (totalD) totalD.textContent = totals.D;

    // 2. Update Step 6 Review Table
    const adminMode = window.isAdminUser();
    
    const sumRowA = document.getElementById('sumRowA');
    if (sumRowA) {
        sumRowA.style.display = adminMode ? 'flex' : 'none';
        sumRowA.querySelector('.units').textContent = totals.A;
    }

    const sumRowD = document.getElementById('sumRowD');
    if (sumRowD) sumRowD.style.display = adminMode ? 'flex' : 'none';

    const elUnitsB = document.getElementById('sumUnitsB');
    if (elUnitsB) { elUnitsB.textContent = totals.B; document.getElementById('sumEffB').textContent = totals.B; }

    const elUnitsC = document.getElementById('sumUnitsC');
    if (elUnitsC) { elUnitsC.textContent = totals.C; document.getElementById('sumEffC').textContent = totals.C; }

    const elUnitsD = document.getElementById('sumUnitsD');
    if (elUnitsD) { elUnitsD.textContent = totals.D; document.getElementById('sumEffD').textContent = totals.D; }

    // 👇 FIXED: Injects BOTH the raw units and effective units into Section G
    const elUnitsG = document.getElementById('sumUnitsG');
    if (elUnitsG) elUnitsG.textContent = totals.G_raw;
    const elEffG = document.getElementById('sumEffG');
    if (elEffG) elEffG.textContent = totals.G_eff.toFixed(2);
    
    // 👇 NEW: Save this globally so the Next button can check it!
    window.remedialEffTotal = totals.G_eff; 
    
    // 👇 NEW: Show or hide the red warning box!
    const remedialErrorDiv = document.getElementById('remedialErrorDiv');
    if (remedialErrorDiv) {
        remedialErrorDiv.style.display = totals.G_eff > 6 ? 'block' : 'none';
    }

    // ========================================================
    // 👇 NEW: Real-time Next/Submit Button Color Change!
    // ========================================================
    const nextBtnEl = document.getElementById('nextBtn');
    if (nextBtnEl) {
        // Figure out where the "Next" button is trying to go
        let nextStepCandidate = (window.currentStep || 1) + 1;
        if (window.isStepVisible) {
            while (nextStepCandidate <= 7 && !window.isStepVisible(nextStepCandidate)) {
                nextStepCandidate++;
            }
        }
        
        const isSubmitBtn = nextBtnEl.textContent.includes('Submit') || nextBtnEl.textContent === 'Finish';

        // If they are overloaded AND the button leads to the Review page (Step 6) or Submit
        if (totals.G_eff > 6 && (isSubmitBtn || nextStepCandidate >= 6)) {
            nextBtnEl.style.backgroundColor = "#6c757d"; // Turn it Gray
            nextBtnEl.style.borderColor = "#6c757d";
            nextBtnEl.style.cursor = "not-allowed";      // Show the 'blocked' mouse pointer
        } else {
            // Restore normal colors if they are safe!
            nextBtnEl.style.backgroundColor = isSubmitBtn ? "#28a745" : ""; // Green if Submit, Default if Next
            nextBtnEl.style.borderColor = ""; 
            nextBtnEl.style.cursor = "pointer";
        }
    }

    // 👇 FIXED: Per Rule 7, Grand Total strictly excludes Section A!
    const grandTotal = totals.B + totals.C + totals.D;
    const totalRegUnits = document.getElementById('grandTotalUnits');
    const totalRegEff = document.getElementById('grandTotalEff');
    
    if (totalRegUnits) totalRegUnits.textContent = grandTotal;
    if (totalRegEff) totalRegEff.textContent = grandTotal;

    // 👇 Mapúa Rule 9: 11 for Part-Time, 15 for Full-Time
    const empType = document.querySelector('input[name="employment"]:checked')?.value || "Full-Time";
    const OVERLOAD_LIMIT = empType === 'Part-Time' ? 11 : 15; 
    
    const justificationRow = document.querySelector('.justification-row');
    
    // Only show the justification text box if they exceed the limit!
    if (justificationRow) {
        if (grandTotal > OVERLOAD_LIMIT) {
            justificationRow.style.display = 'flex'; 
        } else {
            justificationRow.style.display = 'none'; 
        }
    }



    
};

// ==========================================
// 5. THE OMNI-BRAIN (Flawless Priority Engine)
// ==========================================
window.getSectionWarning = function(step) {
    const currentForm = document.getElementById('form' + step);
    if (!currentForm) return 'gray';

    const hasVisited = window.visitedSteps && window.visitedSteps.has(step);
    if (!hasVisited) return 'gray';

    if (step === 6) {
        const cb = document.getElementById('acceptCheckbox');
        if (cb && !cb.checked) return 'red-checkbox';
        return 'green';
    }
    if (step === 5 && window.remedialEffTotal > 6) {
        return 'red-limit';
    }

    let needsYellow = false;
    let isSectionEmpty = true;

    const rows = currentForm.querySelectorAll('.course-row, .admin-row, .practicum-row, .employment-row, .remedial-row');
    for (let row of rows) {
        const inputs = Array.from(row.querySelectorAll('input[type="text"], select'));
        if(inputs.length > 1) { 
            const filledCount = inputs.filter(i => i.value.trim() !== '').length;
            if (filledCount > 0) isSectionEmpty = false;
            
            if (filledCount > 0 && filledCount < inputs.length) {
                needsYellow = true; break;
            }
        }
    }
    
    if (step === 1 && !needsYellow) {
        const step1Inputs = [
            document.getElementById('facultyName'), document.getElementById('position'),
            document.getElementById('college'), document.getElementById('address')
        ];
        const filledCount = step1Inputs.filter(i => i && i.value.trim() !== '').length;
        if (filledCount < step1Inputs.length) needsYellow = true; 
    }

    if (step === 4 && isSectionEmpty) {
        needsYellow = true;
    }
    
    if (needsYellow) return 'yellow';

    if ([1, 2, 3].includes(step) && window.scrolledSteps && !window.scrolledSteps.has(step)) {
        // 👇 FIX: Step 1 and Step 3 are short pages for regular Professors, so they are safe!
        if ((step === 1 || step === 3) && !window.isAdminUser()) {
            // Safe
        } else {
            return 'red-scroll';
        }
    }

    return 'green';
};

window.updateDotsOnly = function() {
    const stepDots = Array.from(document.querySelectorAll('.progress-dot'));
    stepDots.forEach((dot, index) => {
        const stepNumber = index + 1;
        
        dot.classList.remove('filled', 'active');
        dot.style.display = "inline-block"; 
        dot.style.color = ""; 

        if (window.isStepVisible && !window.isStepVisible(stepNumber)) {
            dot.style.opacity = "0.3"; 
            dot.style.cursor = "not-allowed";
            if (stepNumber === 4) dot.setAttribute("title", "This section is for Part-Time employment only.");
            if (stepNumber === 7) {
                dot.style.display = "none";
                return;
            }
            dot.textContent = '○';
            return;
        } else {
            dot.style.opacity = "1"; 
            dot.style.cursor = "pointer";
            dot.removeAttribute("title");
        }

        if (stepNumber === window.currentStep) {
            dot.textContent = '●'; 
            dot.classList.add('active'); 
            return;
        }

        const warning = window.getSectionWarning(stepNumber);

        if (warning === 'green') {
            dot.textContent = '●'; 
            dot.classList.add('filled');
        } else if (warning === 'yellow') {
            dot.textContent = '●'; 
            dot.style.color = '#ffc107'; 
            dot.setAttribute("title", "Notice: Missing mandatory fields detected.");
        }
        else if (warning === 'red-limit') {
            // 👇 NEW: The specific dot warning for the 6.00 limit!
            dot.textContent = '●'; 
            dot.style.color = '#dc3545'; 
            dot.setAttribute("title", "Error: Remedial Effective Units exceed the maximum limit of 6.00.");
        }
         else if (warning.startsWith('red')) {
            dot.textContent = '●'; 
            dot.style.color = '#dc3545'; 
            dot.setAttribute("title", "Action Required: Missing mandatory section or acceptance.");
        } else {
            dot.textContent = '○'; 
        }
    });
};

const triggerUpdates = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        if (window.calculateSummary) window.calculateSummary();
        if (window.updateDotsOnly) window.updateDotsOnly();
    }
};
document.addEventListener('input', triggerUpdates);
document.addEventListener('change', triggerUpdates);

// ==========================================
// 6. NEXT BUTTON LOGIC & API SUBMISSION
// ==========================================
const nextBtn = document.getElementById('nextBtn');

if (nextBtn) {
    nextBtn.addEventListener('click', async function() {
        // 1. Figure out where the user is trying to go
        let nextStepCandidate = window.currentStep + 1;
        while (nextStepCandidate <= 7 && !window.isStepVisible(nextStepCandidate)) {
            nextStepCandidate++;
        }

        const isTryingToSubmit = this.textContent.includes('Submit') || this.textContent === 'Finish';

        // 👇 SMART BLOCKADE: Only blocks if trying to reach the Review/Admin sections, or Submitting!
        if (window.remedialEffTotal > 6 && (isTryingToSubmit || nextStepCandidate >= 6)) {
            e.preventDefault();
            alert("⚠️ RULE VIOLATION:\n\nYou have exceeded the maximum limit of 6 effective units for Remedial Modules.\n\nPlease reduce your remedial assignments before proceeding to the Review section.");
            return; // Stops the jump, but leaves the button active for earlier pages!
        }
        // 🚀 THE SUBMIT TRIGGER
        if (this.textContent.includes('Submit') || this.textContent === 'Finish') {
            this.textContent = 'Submitting...'; 
            this.disabled = true;

            const getVal = (row, index) => {
                const cell = row.children[index];
                if(!cell) return "";
                const el = cell.querySelector('input, select');
                return el ? el.value.trim() : "";
            };
            const getNum = (row, index) => Number(getVal(row, index)) || 0;

            // 👇 FIXED: Added the 'justification' grabber right here!
            const payload = {
                facultyName: document.getElementById('facultyName')?.value.trim() || "",
                position: document.getElementById('position')?.value.trim() || "",
                college: document.getElementById('college')?.value.trim() || "",
                address: document.getElementById('address')?.value.trim() || "",
                employmentStatus: document.getElementById('employmentStatus')?.value || "",
                employmentType: document.querySelector('input[name="employment"]:checked')?.value || "",
                facultySignature: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL("image/png") : "",
                term: "2nd Term 2025-2026", 
                academicYear: "2025-2026", 
                action: "SUBMIT",
                justification: document.getElementById('justificationText')?.value || "", // 👈 GRABS THE ADMIN REMARKS!
                sectionA_AdminUnits: Number(document.getElementById('teachingUnits1')?.value) || 0,
                sectionB_WithinCollege: [],
                sectionC_OtherCollege: [],
                sectionD_AdminWork: [],
                sectionE_Practicum: [],
                sectionF_OutsideEmployment: [],
                sectionG_Remedial: []
            };

            let isSectionCSubmit = false;
            const form2InnerSubmit = document.querySelector('#form2 .ata-form');
            if (form2InnerSubmit) {
                Array.from(form2InnerSubmit.children).forEach(child => {
                    if (child.classList.contains('form-divider')) isSectionCSubmit = true;
                    if (child.classList.contains('course-row')) {
                        const courseCode = getVal(child, 0);
                        if (courseCode) {
                            const courseObj = {
                                courseCode: courseCode,
                                section: getVal(child, 1),
                                units: getNum(child, 2),
                                effectiveDate: getVal(child, 3)
                            };
                            if (isSectionCSubmit) payload.sectionC_OtherCollege.push(courseObj);
                            else payload.sectionB_WithinCollege.push(courseObj);
                        }
                    }
                });
            }

            document.querySelectorAll('#form3 .admin-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionD_AdminWork.push({
                    workDescription: getVal(row, 0),
                    units: getNum(row, 1),
                    effectiveDate: getVal(row, 2)
                });
            });

            document.querySelectorAll('#form3 .practicum-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionE_Practicum.push({
                    courseCode: getVal(row, 0),
                    numberOfStudents: getNum(row, 1),
                    coordinator: getVal(row, 2)
                });
            });
            if (payload.employmentType === 'Part-Time') {
                document.querySelectorAll('#form4 .employment-row').forEach(row => {
                    if (getVal(row, 0)) payload.sectionF_OutsideEmployment.push({
                        employer: getVal(row, 0),
                        position: getVal(row, 1),
                        courseOrUnits: getVal(row, 2),
                        hoursPerWeek: getNum(row, 3)
                    });
                });
            }
            document.querySelectorAll('#form5 .remedial-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionG_Remedial.push({
                    courseId: getVal(row, 0),
                    moduleCode: getVal(row, 1),
                    section: getVal(row, 2),
                    units: getNum(row, 3),
                    numberOfStudents: getNum(row, 4),
                    type: getVal(row, 5) || "lecture"
                });
            });

            try {
                const response = await fetch('/ata/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert("ATA Form submitted successfully!");
                    window.location.href = '/ata/dashboard/window';
                } else {
                    const errorText = await response.text(); 
                    try {
                        const errorData = JSON.parse(errorText);
                        alert(`Server Rejected Submission:\n${errorData.error || errorData.message || 'Unknown Error'}`);
                    } catch(e) {
                        alert(`Server Error: Could not process request.`);
                    }
                    this.textContent = 'Submit'; 
                    this.disabled = false;
                }

            } catch (error) {
                alert("Server error. Please try again.");
                this.textContent = 'Submit';
                this.disabled = false;
            }
            return;
        }

        // ➡️ NORMAL "NEXT" LOGIC
        while (nextStepCandidate <= 7 && !window.isStepVisible(nextStepCandidate)) {
            nextStepCandidate++;
        }

        if (nextStepCandidate <= 7) {
            window.currentStep = nextStepCandidate;
            if(window.updateFormDisplay) window.updateFormDisplay();
            if (window.calculateSummary) window.calculateSummary();
        }
    });
}

// ==========================================
// 7. REVIEW & APPROVAL LOGIC (Dual-Role Aware)
// ==========================================
const btnReturn = document.getElementById('btnReturn');
const btnApprove = document.getElementById('btnApprove');

// 👇 FIXED: Added a check! If 'btnSmartApprove' exists, this script will shut down and let the new EJS script take over!
const isSmartPage = document.getElementById('btnSmartApprove');

if (btnReturn && btnApprove && !isSmartPage) {
    const remarksInput = document.getElementById('adminRemarks');
    const pathParts = window.location.pathname.split('/');
    const formId = pathParts[pathParts.length - 1];

    // 👇 1. Grab the current status of the form directly from the HTML body
    const formStatus = document.body.getAttribute('data-status');
    const formHasPracticum = document.body.getAttribute('data-has-practicum') === 'true';

    let actionWord = 'APPROVE';
    let displayMessage = 'Approve Form';

    // 👇 2. Change the button behavior based on the FORM'S status
    if (formStatus === 'PENDING_CHAIR') {
        actionWord = 'ENDORSE';
        displayMessage = formHasPracticum ? 'Endorse to Practicum' : 'Endorse to Dean';
    } 
    else if (formStatus === 'PENDING_PRACTICUM') {
        actionWord = 'VALIDATE';
        displayMessage = 'Validate for Dean';
    } 
    else if (formStatus === 'PENDING_DEAN') {
        actionWord = 'APPROVE';
        displayMessage = 'Approve to VPAA';
    } 
    else if (formStatus === 'PENDING_VPAA') {
        actionWord = 'NOTE';
        displayMessage = 'Note & Endorse to HR'; // 👈 Updated for VPAA
    }
    // 👇 NEW: Tells the button what to do when HR opens the form!
    else if (formStatus === 'PENDING_HR') {
        actionWord = 'NOTE';
        displayMessage = 'Note & Finalize'; 
    }
    btnApprove.innerHTML = `<i class="fas fa-check"></i> ${displayMessage}`;

    const processAction = async (actionType) => {
        const remarks = remarksInput ? remarksInput.value : '';
        if (actionType === 'RETURN' && (!remarks || remarks.trim() === '')) {
            alert("⚠️ Remarks are strictly required when returning a form to the faculty.");
            return;
        }

        const confirmText = actionType === 'RETURN' ? 'RETURN this form to the faculty' : displayMessage;

        if (confirm(`Are you sure you want to ${confirmText}?`)) {
            try {
                btnApprove.disabled = true;
                btnReturn.disabled = true;

                const response = await fetch(`/ata/approve/${formId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: actionType, remarks: remarks })
                });
                const result = await response.json();
                
                if (response.ok) {
                    alert(result.message);
                    window.location.href = '/ata/pending'; 
                } else {
                    alert("Error: " + result.error);
                    btnApprove.disabled = false;
                    btnReturn.disabled = false;
                }
            } catch (err) {
                alert("A network error occurred. Please try again.");
                btnApprove.disabled = false;
                btnReturn.disabled = false;
            }
        }
    };
    btnReturn.addEventListener('click', () => processAction('RETURN'));
    btnApprove.addEventListener('click', () => processAction(actionWord));
}
// ==========================================
// 8. MULTI-STEP FORM NAVIGATION & SCROLL TRACKER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const stepDots = Array.from(document.querySelectorAll('.progress-dot'));
    
    if (stepDots.length > 0) {
        window.currentStep = 1;
        window.highestStepReached = 1; 
        window.visitedSteps = new Set();
        window.scrolledSteps = new Set(); 

        const formTitle = document.getElementById('formTitle')?.querySelector('h1');
        const formBackBtn = document.getElementById('backBtn'); 
        const formNextBtn = document.getElementById('nextBtn');
        const container = document.querySelector('.form-cards-container');

        const step3DotEl = document.getElementById('step3Dot');
        if (step3DotEl) {
            step3DotEl.setAttribute('data-label', window.isAdminUser() ? 'Admin & Practicum' : 'Practicum Advising');
        }

        const formTitles = [
            'ATA form: Personal Details',
            'ATA form: Teaching Assignments',
            window.isAdminUser() ? 'ATA form: Administrative & Practicum Work' : 'ATA form: Practicum Advising',
            'ATA form: External Employment (Part-Time Only)',
            'ATA form: Remedial Module Assignments',
            'ATA form: Review & Submit',
            'ATA form: Admin Approval Section'
        ];

        const checkScrollBottom = () => {
            if (!container) return;
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20) {
                window.scrolledSteps.add(window.currentStep);
                if (window.updateDotsOnly) window.updateDotsOnly();
            }
        };

        if (container) {
            container.addEventListener('scroll', checkScrollBottom);
        }

        window.scrollToMissedContent = function(step, wasVisited) {
            const currentForm = document.getElementById('form' + step);
            if (!currentForm) return;

            if (!wasVisited) return; 

            const warning = window.getSectionWarning(step);

            if (warning === 'red-checkbox') {
                const cbRow = currentForm.querySelector('.acceptance-row');
                if (cbRow) {
                    cbRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    cbRow.style.transition = "background-color 0.3s, box-shadow 0.3s";
                    const orig = cbRow.style.backgroundColor;
                    
                    cbRow.style.backgroundColor = "rgba(220, 53, 69, 0.2)";
                    cbRow.style.boxShadow = "0 0 15px 5px rgba(220, 53, 69, 0.4)";
                    
                    setTimeout(() => {
                        cbRow.style.backgroundColor = orig;
                        cbRow.style.boxShadow = "none";
                    }, 2000);
                }
            } 
            else if (warning === 'yellow') {
                let targetInput = null;
                const rows = currentForm.querySelectorAll('.course-row, .admin-row, .practicum-row, .employment-row, .remedial-row');
                for (let row of rows) {
                    const inputs = Array.from(row.querySelectorAll('input[type="text"], select'));
                    if(inputs.length > 1) { 
                        const filledCount = inputs.filter(i => i.value.trim() !== '').length;
                        if (filledCount > 0 && filledCount < inputs.length) {
                            targetInput = inputs.find(i => i.value.trim() === '');
                            break;
                        }
                    }
                }
                if (step === 1 && !targetInput) {
                    const step1Inputs = [
                        document.getElementById('facultyName'), document.getElementById('position'),
                        document.getElementById('college'), document.getElementById('address')
                    ];
                    targetInput = step1Inputs.find(i => i && i.value.trim() === '');
                }
                
                if (step === 4 && !targetInput) {
                    targetInput = currentForm.querySelector('.employment-row input[type="text"]');
                }

                if (targetInput) {
                    targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetInput.style.transition = "box-shadow 0.3s";
                    targetInput.style.boxShadow = "0 0 15px 5px #ffc107"; 
                    setTimeout(() => targetInput.style.boxShadow = "none", 2000);
                }
            }
            else if (warning === 'red-scroll') {
                let redTarget = null;
                if (step === 1) {
                    redTarget = currentForm.querySelector('.form-section-divider'); 
                } else if (step === 2) {
                    redTarget = Array.from(currentForm.querySelectorAll('.form-section-header')).find(el => el.textContent.includes('(C)')); 
                } else if (step === 3) {
                    redTarget = Array.from(currentForm.querySelectorAll('.form-section-header')).find(el => el.textContent.includes('(E)')); 
                }

                if (redTarget) {
                    redTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    redTarget.style.transition = "background-color 0.3s, color 0.3s, box-shadow 0.3s, border-radius 0.3s";
                    const originalBg = redTarget.style.backgroundColor;
                    
                    redTarget.style.backgroundColor = "rgba(220, 53, 69, 0.2)";
                    redTarget.style.boxShadow = "0 0 15px 5px rgba(220, 53, 69, 0.4)";
                    redTarget.style.borderRadius = "5px";
                    
                    setTimeout(() => {
                        redTarget.style.backgroundColor = originalBg;
                        redTarget.style.boxShadow = "none";
                    }, 2000);

                    window.scrolledSteps.add(step);
                    if (window.updateDotsOnly) window.updateDotsOnly();
                }
            }
        };

        window.updateFormDisplay = function(preventScroll = false) {
            const wasVisited = window.visitedSteps.has(window.currentStep);
            window.visitedSteps.add(window.currentStep);

            if ([4, 5, 6, 7].includes(window.currentStep)) {
                window.scrolledSteps.add(window.currentStep);
            }
            if ((window.currentStep === 1 || window.currentStep === 3) && !window.isAdminUser()) {
                window.scrolledSteps.add(window.currentStep);
            }

            for(let i=1; i<=7; i++) {
                const f = document.getElementById('form'+i);
                if(f) f.style.display = 'none';
            }

            const currentForm = document.getElementById('form' + window.currentStep);
            if (currentForm) {
                currentForm.style.display = 'block';
                
                if (container && !preventScroll) {
                    container.scrollTop = 0; 
                    
                    setTimeout(() => {
                        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20) {
                            window.scrolledSteps.add(window.currentStep);
                            if (window.updateDotsOnly) window.updateDotsOnly();
                        }
                    }, 50);
                }
            }

            if (formTitle) formTitle.textContent = formTitles[window.currentStep - 1];

            if (window.updateDotsOnly) window.updateDotsOnly();

            if (formBackBtn) formBackBtn.textContent = (window.currentStep === 1) ? 'Return to Dashboard' : 'Back';

            let lastVisibleStep = 7;
            while(lastVisibleStep > 0 && window.isStepVisible && !window.isStepVisible(lastVisibleStep)) {
                lastVisibleStep--;
            }

            if (formNextBtn) {
                if (window.currentStep === lastVisibleStep) {
                    let target = "Program Chair"; 
                    if (window.currentUser.role === 'Dean') {
                        target = "VPAA";
                    } else if (window.currentUser.role === 'Program-Chair') {
                        let hasPracticum = false;
                        document.querySelectorAll('#form3 .practicum-row select, #form3 .practicum-row input').forEach(input => {
                            if (input.value.trim() !== '') hasPracticum = true;
                        });
                        target = hasPracticum ? "Practicum Coord." : "Dean";
                    }
                    formNextBtn.textContent = `Submit to ${target}`;
                    formNextBtn.style.backgroundColor = "#28a745"; 
                } else {
                    formNextBtn.textContent = 'Next';
                    formNextBtn.style.backgroundColor = ""; 
                }
            }

            if (window.handleInnerSectionVisibility) window.handleInnerSectionVisibility();
            if (window.calculateSummary) window.calculateSummary(); 
            
            if (!preventScroll) {
                setTimeout(() => {
                    if (window.scrollToMissedContent) window.scrollToMissedContent(window.currentStep, wasVisited);
                }, 100);
            }
        };

        stepDots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                const targetStep = index + 1;
                if (window.isStepVisible && !window.isStepVisible(targetStep)) return; 
                // 👇 SMART BLOCKADE: Stop them from sneaking into Review via the dots!
                if (window.remedialEffTotal > 6 && targetStep >= 6) {
                    alert("⚠️ RULE VIOLATION:\n\nYou have exceeded the maximum limit of 6 effective units for Remedial Modules.\n\nPlease reduce your remedial assignments before proceeding to the Review section.");
                    
                    // Automatically jump them to the Remedial section so they can fix it!
                    window.currentStep = 5;
                    updateFormDisplay();
                    return;
                }
                window.currentStep = targetStep;
                updateFormDisplay(); 
            });
        });

        if (formBackBtn) {
            formBackBtn.addEventListener('click', function() {
                if (window.currentStep === 1) {
                    window.location.href = '/ata/dashboard/window';
                } else {
                    let prevStep = window.currentStep - 1;
                    while (prevStep > 0 && window.isStepVisible && !window.isStepVisible(prevStep)) {
                        prevStep--; 
                    }
                    if (prevStep > 0) {
                        window.currentStep = prevStep;
                        updateFormDisplay(); 
                    }
                }
            });
        }

        updateFormDisplay();
    }
});

// ==========================================
// 9. DYNAMIC TABLE ROWS (ADD & REMOVE FIX)
// ==========================================
document.addEventListener('click', function(e) {
    // ➕ HANDLE ADD BUTTONS
    if (e.target.closest('.add-course-btn button') || e.target.closest('.secondary-btn.small-btn')) {
        e.preventDefault();
        const btn = e.target.closest('button');
        const btnContainer = btn.parentElement;
        
        let previousEl = btnContainer.previousElementSibling;
        while (previousEl && !previousEl.className.includes('-row') && previousEl.className !== 'course-row') {
            previousEl = previousEl.previousElementSibling;
        }
        
        if (previousEl) {
            const newRow = previousEl.cloneNode(true);
            
            // Clear inputs, but keep dropdown structure intact!
            newRow.querySelectorAll('input').forEach(input => {
                if (input.type === 'text') input.value = '';
                if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
            });
            newRow.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
            
            btnContainer.parentNode.insertBefore(newRow, btnContainer);
            
            if (window.calculateSummary) window.calculateSummary();
            if (window.updateDotsOnly) window.updateDotsOnly();
        }
    }

    // 🗑️ HANDLE REMOVE (TRASH) BUTTONS
    if (e.target.closest('.remove-btn')) {
        e.preventDefault();
        const row = e.target.closest('.course-row, .admin-row, .practicum-row, .employment-row, .remedial-row');
        
        if (row) {
            const rowClass = row.classList[0]; 
            
            const hasNext = row.nextElementSibling && row.nextElementSibling.classList.contains(rowClass);
            const hasPrev = row.previousElementSibling && row.previousElementSibling.classList.contains(rowClass);
            
            if (hasNext || hasPrev) {
                row.remove();
            } else {
                row.querySelectorAll('input').forEach(i => i.value = '');
                row.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
            }
            
            if (window.calculateSummary) window.calculateSummary();
            if (window.updateDotsOnly) window.updateDotsOnly();
        }
    }
});
// ==========================================
// 10. PDF PREVIEW HANDLER (Live Generator)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const previewPdfBtn = document.getElementById('previewPdfBtn');
    
    if (previewPdfBtn) {
        previewPdfBtn.addEventListener('click', async (e) => {
            e.preventDefault(); 
            
            const originalText = previewPdfBtn.innerHTML;
            previewPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            previewPdfBtn.disabled = true;

            // 1. Gather all the data currently typed on the screen
            const getVal = (row, index) => {
                const cell = row.children[index];
                if(!cell) return "";
                const el = cell.querySelector('input, select');
                return el ? el.value.trim() : "";
            };
            const getNum = (row, index) => Number(getVal(row, index)) || 0;

            const payload = {
                facultyName: document.getElementById('facultyName')?.value.trim() || "",
                position: document.getElementById('position')?.value.trim() || "",
                college: document.getElementById('college')?.value.trim() || "",
                address: document.getElementById('address')?.value.trim() || "",
                facultySignature: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL("image/png") : "",
                employmentStatus: document.getElementById('employmentStatus')?.value || "",
                employmentType: document.querySelector('input[name="employment"]:checked')?.value || "",
                term: "2nd Term", 
                academicYear: "2025-2026", 
                sectionA_AdminUnits: Number(document.getElementById('teachingUnits1')?.value) || 0,
                sectionB_WithinCollege: [],
                sectionC_OtherCollege: [],
                sectionD_AdminWork: [],
                sectionE_Practicum: [],
                sectionF_OutsideEmployment: [],
                sectionG_Remedial: [],
                justification: document.getElementById('justificationText')?.value || ""
            };

            let isSectionC = false;
            const form2Inner = document.querySelector('#form2 .ata-form');
            if (form2Inner) {
                Array.from(form2Inner.children).forEach(child => {
                    if (child.classList.contains('form-divider')) isSectionC = true;
                    if (child.classList.contains('course-row')) {
                        if (getVal(child, 0)) {
                            const obj = { courseCode: getVal(child, 0), section: getVal(child, 1), units: getNum(child, 2), effectiveDate: getVal(child, 3) };
                            isSectionC ? payload.sectionC_OtherCollege.push(obj) : payload.sectionB_WithinCollege.push(obj);
                        }
                    }
                });
            }

            document.querySelectorAll('#form3 .admin-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionD_AdminWork.push({ workDescription: getVal(row, 0), units: getNum(row, 1), effectiveDate: getVal(row, 2) });
            });

            document.querySelectorAll('#form3 .practicum-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionE_Practicum.push({ courseCode: getVal(row, 0), numberOfStudents: getNum(row, 1), coordinator: getVal(row, 2) });
            });

            if (payload.employmentType === 'Part-Time') {
                document.querySelectorAll('#form4 .employment-row').forEach(row => {
                    if (getVal(row, 0)) payload.sectionF_OutsideEmployment.push({ employer: getVal(row, 0), position: getVal(row, 1), courseOrUnits: getVal(row, 2), hoursPerWeek: getNum(row, 3) });
                });
            }
            document.querySelectorAll('#form5 .remedial-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionG_Remedial.push({ courseId: getVal(row, 0), moduleCode: getVal(row, 1), section: getVal(row, 2), units: getNum(row, 3), numberOfStudents: getNum(row, 4), type: getVal(row, 5) || "lecture" });
            });

            // 2. Send to Server to build PDF in memory
            try {
                const response = await fetch('/ata/preview-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    // 3. Create a temporary URL to view the file
                    const blob = await response.blob();
                    const pdfUrl = URL.createObjectURL(blob);
                    window.open(pdfUrl, '_blank'); // Opens beautifully in a new tab!
                } else {
                    alert("Error generating preview.");
                }
            } catch (error) {
                console.error(error);
                alert("Network error.");
            } finally {
                previewPdfBtn.innerHTML = originalText;
                previewPdfBtn.disabled = false;
            }
        });
    }
});