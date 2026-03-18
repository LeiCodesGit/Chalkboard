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
// 1.2 DYNAMIC ACADEMIC YEAR GENERATOR
// ==========================================
// ==========================================
// 1.5 SMART ACADEMIC YEAR INPUT
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    const ayInput = document.getElementById("academicYear");
    
    if (ayInput) {
        // Real-time formatting while typing
        ayInput.addEventListener("input", function(e) {
            // Strip out any letters (only allow numbers and hyphens)
            this.value = this.value.replace(/[^\d-]/g, '');
            
            // If they type exactly 4 numbers (and aren't pressing backspace), magically add the rest!
            if (this.value.length === 4 && !this.value.includes('-') && e.inputType !== 'deleteContentBackward') {
                const startYear = parseInt(this.value);
                this.value = `${startYear}-${startYear + 1}`;
            }
        });

        // Backup formatting (if they copy-paste or click away)
        ayInput.addEventListener("blur", function() {
            const val = this.value.trim();
            if (/^\d{4}$/.test(val)) {
                const startYear = parseInt(val);
                this.value = `${startYear}-${startYear + 1}`;
            }
        });
    }
});

// ==========================================
// 1.6 DYNAMIC ACCEPTANCE TEXT
// ==========================================
window.updateAcceptanceText = function() {
    const termDropdown = document.getElementById('term');
    const yearDropdown = document.getElementById('academicYear');
    const acceptLabel = document.getElementById('dynamicAcceptLabel');

    if (acceptLabel && termDropdown && yearDropdown) {
        const termVal = termDropdown.value ? termDropdown.value.replace(" Term", "").toUpperCase() : "___";
        const yearVal = yearDropdown.value;

        if (yearVal && yearVal.includes('-')) {
            const years = yearVal.split('-'); // Splits "2026-2027" into ["2026", "2027"]
            acceptLabel.innerHTML = `I hereby accept the above teaching assignment/s for the <strong>${termVal}</strong> term for Academic Year <strong>${years[0]}</strong> to <strong>${years[1]}</strong>.`;
        } else {
            // Default fallback if they haven't typed a year yet
            acceptLabel.innerHTML = "I hereby accept the above teaching assignment/s.";
        }
    }
};
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
    if (sectionA) sectionA.style.display = adminMode ? 'flex' : 'none';

    const sectionD = document.getElementById('sectionD_Container');
    if (sectionD) sectionD.style.display = adminMode ? 'flex' : 'none';

    const dashboardBtn = document.getElementById('adminCourseBtn');
    if (dashboardBtn) dashboardBtn.style.display = adminMode ? 'block' : 'none';

    const adminApprovalCard = document.getElementById('adminApprovalCard');
    if (adminApprovalCard) adminApprovalCard.style.display = adminMode ? 'block' : 'none';
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

    // 👇 1. Add this helper so the live calculator can read text!
    const getVal = (row, colIndex) => {
        const cell = row.children[colIndex];
        if(!cell) return "";
        const el = cell.querySelector('input, select');
        return el ? el.value.trim() : "";
    };

    totals.A = Number(document.getElementById('teachingUnits1')?.value) || 0;

    // 👇 2. STRICT CHECK: Section B
    document.querySelectorAll('#form2 .form-row:nth-child(1) .course-row').forEach(row => {
        if (getVal(row, 0) && getVal(row, 1) && getUnit(row, 2) > 0 && getVal(row, 3)) {
            totals.B += getUnit(row, 2);
        }
    });
    
    // 👇 3. STRICT CHECK: Section C
    document.querySelectorAll('#form2 .form-row:nth-child(2) .course-row').forEach(row => {
        if (getVal(row, 0) && getVal(row, 1) && getUnit(row, 2) > 0 && getVal(row, 3)) {
            totals.C += getUnit(row, 2);
        }
    });

    // 👇 4. STRICT CHECK: Section D
    document.querySelectorAll('#form3 .admin-row').forEach(row => {
        if (getVal(row, 0) && getUnit(row, 1) > 0 && getVal(row, 2)) {
            totals.D += getUnit(row, 1);
        }
    });
    
    // 👇 5. STRICT CHECK: Section G
    document.querySelectorAll('#form5 .remedial-row').forEach(row => {
        const units = getUnit(row, 3);
        const students = getUnit(row, 4);
        const typeCell = row.children[5];
        const typeSelect = typeCell ? typeCell.querySelector('select') : null;
        const type = typeSelect ? typeSelect.value : "lecture";

        // Only calculate if EVERY box in the remedial row is filled
        if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2) && units > 0 && students > 0) {
            totals.G_raw += units;
            let effective = units * (students / 40);
            if (type === 'lab') effective *= 2;
            totals.G_eff += effective;
        }
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

    // Update the local Section G display
    if (document.getElementById('localUnitsG')) document.getElementById('localUnitsG').textContent = totals.G_raw;
    if (document.getElementById('localEffG')) document.getElementById('localEffG').textContent = totals.G_eff.toFixed(2);
    
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
            document.getElementById('college'), document.getElementById('address'),
            document.getElementById('term'), document.getElementById('academicYear')
        ];
        const filledCount = step1Inputs.filter(i => i && i.value.trim() !== '').length;
        if (filledCount < step1Inputs.length) needsYellow = true; 
        
        // 👇 NEW: Check if the employment radio button is empty!
        if (!document.querySelector('input[name="employment"]:checked')) {
            needsYellow = true;
        }
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
        
        // 1. Reset all states cleanly
        dot.classList.remove('filled', 'active');
        dot.style.display = "flex"; 
        dot.style.borderColor = ""; // Resets the yellow border if it was applied

        // 2. Handle Hidden/Disabled Steps (like Part-Time Outside Employment)
        if (window.isStepVisible && !window.isStepVisible(stepNumber)) {
            dot.style.opacity = "0.3"; 
            dot.style.cursor = "not-allowed";
            if (stepNumber === 4) dot.setAttribute("title", "This section is for Part-Time employment only.");
            if (stepNumber === 7) {
                dot.style.display = "none";
            }
            return;
        } else {
            dot.style.opacity = "1"; 
            dot.style.cursor = "pointer";
            dot.removeAttribute("title");
        }

        // 3. Handle Active Step
        if (stepNumber === window.currentStep) {
            dot.classList.add('active'); 
            return;
        }

        // 4. Handle Warnings & Finished States (NO textContent overwrites!)
        const warning = window.getSectionWarning(stepNumber);

        if (warning === 'green') {
            dot.classList.add('filled');
            
        } else if (warning === 'yellow') {
            // Beautiful yellow warning applied to the border to match new CSS
            dot.style.borderColor = '#ffc107'; 
            dot.setAttribute("title", "Notice: Missing mandatory fields detected.");
            
        } else if (warning === 'red-limit') {
            // Converts the aggressive red error into a calm yellow border warning
            dot.style.borderColor = '#ffc107'; 
            dot.setAttribute("title", "Notice: Remedial Effective Units exceed the maximum limit of 6.00.");
            
        } else if (warning && warning.startsWith('red')) {
            // Neutralizes the red-scroll warning completely. Just marks it as filled.
            dot.classList.add('filled'); 
        }
    });
};

const triggerUpdates = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        if (window.calculateSummary) window.calculateSummary();
        if (window.updateDotsOnly) window.updateDotsOnly();
        if (window.updateAcceptanceText) window.updateAcceptanceText();
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
            const acceptBox = document.getElementById('acceptCheckbox');
            if (acceptBox && !acceptBox.checked) {
                    alert("⚠️ Action Required: You must check the box to accept your teaching assignments before submitting.");
                    return; 
            }

                // ALWAYS require a drawn signature
            if (!signaturePad || signaturePad.isEmpty()) {
                    alert("⚠️ Action Required: Please provide your e-signature in the box provided before submitting.");
                    return; // 🛑 STOPS THE SUBMISSION
            }
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
                existingDraftId: document.getElementById('existingDraftId')?.value || null, // 👈 ADD THIS LINE!
                facultyName: document.getElementById('facultyName')?.value.trim() || "",
                position: document.getElementById('position')?.value.trim() || "",
                college: document.getElementById('college')?.value.trim() || "",
                address: document.getElementById('address')?.value.trim() || "",
                employmentStatus: document.getElementById('employmentStatus')?.value || "",
                employmentType: document.querySelector('input[name="employment"]:checked')?.value || "",
                facultySignature: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL("image/png") : "",
                term: document.getElementById('term')?.value || "", 
                academicYear: document.getElementById('academicYear')?.value || "", 
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

            // Section B: Requires Course, Section, Units, and Date
            document.querySelectorAll('#form2 .form-row:nth-child(1) .course-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getNum(row, 2) > 0 && getVal(row, 3)) {
                    payload.sectionB_WithinCollege.push({ courseCode: getVal(row, 0), section: getVal(row, 1), units: getNum(row, 2), effectiveDate: getVal(row, 3) });
                }
            });

            // Section C: Requires Course, Section, Units, and Date
            document.querySelectorAll('#form2 .form-row:nth-child(2) .course-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getNum(row, 2) > 0 && getVal(row, 3)) {
                    payload.sectionC_OtherCollege.push({ courseCode: getVal(row, 0), section: getVal(row, 1), units: getNum(row, 2), effectiveDate: getVal(row, 3) });
                }
            });

            // Section D: Requires Description, Units, and Date
            document.querySelectorAll('#form3 .admin-row').forEach(row => {
                if (getVal(row, 0) && getNum(row, 1) > 0 && getVal(row, 2)) {
                    payload.sectionD_AdminWork.push({ workDescription: getVal(row, 0), units: getNum(row, 1), effectiveDate: getVal(row, 2) });
                }
            });

            // Section E: Requires Course Code, Students, and Coordinator
            document.querySelectorAll('#form3 .practicum-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2)) {
                    payload.sectionE_Practicum.push({ courseCode: getVal(row, 0), numberOfStudents: getNum(row, 1), coordinator: getVal(row, 2) });
                }
            });
            
            // Section F: Requires Employer, Position, Course, and Hours
            if (payload.employmentType === 'Part-Time') {
                document.querySelectorAll('#form4 .employment-row').forEach(row => {
                    if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2) && getVal(row, 3)) {
                        payload.sectionF_OutsideEmployment.push({ employer: getVal(row, 0), position: getVal(row, 1), courseOrUnits: getVal(row, 2), hoursPerWeek: getNum(row, 3) });
                    }
                });
            }

            // Section G: Requires Course ID, Module Code, Section, Units, and Students
            document.querySelectorAll('#form5 .remedial-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2) && getNum(row, 3) > 0 && getVal(row, 4)) {
                    payload.sectionG_Remedial.push({ courseId: getVal(row, 0), moduleCode: getVal(row, 1), section: getVal(row, 2), units: getNum(row, 3), numberOfStudents: getNum(row, 4), type: getVal(row, 5) || "lecture" });
                }
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

        window.scrollToMissedContent = function(step) {
    // 👇 AUTO-SCROLL AND RED HIGHLIGHT COMPLETELY DISABLED
    // We just silently update the system's memory so the dots update, 
    // but the screen will NEVER auto-scroll or flash red again.
    
            if (window.scrolledSteps) {
                window.scrolledSteps.add(step);
            }
            
            if (window.updateDotsOnly) {
                window.updateDotsOnly();
            }
            
            return; // Stops the function right here!
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
                        target = "Program Chair"; 
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
                existingDraftId: document.getElementById('existingDraftId')?.value || null,
                facultyName: document.getElementById('facultyName')?.value.trim() || "",
                position: document.getElementById('position')?.value.trim() || "",
                college: document.getElementById('college')?.value.trim() || "",
                address: document.getElementById('address')?.value.trim() || "",
                facultySignature: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL("image/png") : "",
                employmentStatus: document.getElementById('employmentStatus')?.value || "",
                employmentType: document.querySelector('input[name="employment"]:checked')?.value || "",
                term: document.getElementById('term')?.value || "", 
                academicYear: document.getElementById('academicYear')?.value || "", 
                sectionA_AdminUnits: Number(document.getElementById('teachingUnits1')?.value) || 0,
                sectionB_WithinCollege: [],
                sectionC_OtherCollege: [],
                sectionD_AdminWork: [],
                sectionE_Practicum: [],
                sectionF_OutsideEmployment: [],
                sectionG_Remedial: [],
                justification: document.getElementById('justificationText')?.value || ""
            };

            // Section B: Requires Course, Section, Units, and Date
            document.querySelectorAll('#form2 .form-row:nth-child(1) .course-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getNum(row, 2) > 0 && getVal(row, 3)) {
                    payload.sectionB_WithinCollege.push({ courseCode: getVal(row, 0), section: getVal(row, 1), units: getNum(row, 2), effectiveDate: getVal(row, 3) });
                }
            });

            // Section C: Requires Course, Section, Units, and Date
            document.querySelectorAll('#form2 .form-row:nth-child(2) .course-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getNum(row, 2) > 0 && getVal(row, 3)) {
                    payload.sectionC_OtherCollege.push({ courseCode: getVal(row, 0), section: getVal(row, 1), units: getNum(row, 2), effectiveDate: getVal(row, 3) });
                }
            });

            // Section D: Requires Description, Units, and Date
            document.querySelectorAll('#form3 .admin-row').forEach(row => {
                if (getVal(row, 0) && getNum(row, 1) > 0 && getVal(row, 2)) {
                    payload.sectionD_AdminWork.push({ workDescription: getVal(row, 0), units: getNum(row, 1), effectiveDate: getVal(row, 2) });
                }
            });

            // Section E: Requires Course Code, Students, and Coordinator
            document.querySelectorAll('#form3 .practicum-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2)) {
                    payload.sectionE_Practicum.push({ courseCode: getVal(row, 0), numberOfStudents: getNum(row, 1), coordinator: getVal(row, 2) });
                }
            });
            
            // Section F: Requires Employer, Position, Course, and Hours
            if (payload.employmentType === 'Part-Time') {
                document.querySelectorAll('#form4 .employment-row').forEach(row => {
                    if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2) && getVal(row, 3)) {
                        payload.sectionF_OutsideEmployment.push({ employer: getVal(row, 0), position: getVal(row, 1), courseOrUnits: getVal(row, 2), hoursPerWeek: getNum(row, 3) });
                    }
                });
            }

            // Section G: Requires Course ID, Module Code, Section, Units, and Students
            document.querySelectorAll('#form5 .remedial-row').forEach(row => {
                if (getVal(row, 0) && getVal(row, 1) && getVal(row, 2) && getNum(row, 3) > 0 && getVal(row, 4)) {
                    payload.sectionG_Remedial.push({ courseId: getVal(row, 0), moduleCode: getVal(row, 1), section: getVal(row, 2), units: getNum(row, 3), numberOfStudents: getNum(row, 4), type: getVal(row, 5) || "lecture" });
                }
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

// ==========================================
// 11. AUTO-POPULATE DRAFT DATA (EDIT MODE)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if the backend passed a draft form to the EJS template
    if (window.DRAFT_FORM_DATA && typeof window.DRAFT_FORM_DATA === 'object') {
        console.log("Found draft data! Populating form...", window.DRAFT_FORM_DATA);
        const data = window.DRAFT_FORM_DATA;

        // --- Helper to fill standard inputs ---
        const fillInput = (id, value) => {
            const el = document.getElementById(id);
            if (el && value) el.value = value;
        };

        // --- A. Personal Details & Setup ---
        fillInput('facultyName', data.facultyName);
        fillInput('position', data.position);
        fillInput('college', data.college);
        fillInput('address', data.address);
        fillInput('employmentStatus', data.employmentStatus);
        fillInput('term', data.term);
        fillInput('academicYear', data.academicYear);
        
        if (data.employmentType === 'Part-Time') {
            const ptRadio = document.getElementById('radioPartTime');
            if (ptRadio) ptRadio.click(); // .click() ensures the other JS logic fires!
        } else {
            const ftRadio = document.getElementById('radioFullTime');
            if (ftRadio) ftRadio.click();
        }

        // --- Helper to fill repeating Table Rows ---
        const fillTable = (dataArray, sectionContainerId, rowClass, addBtnSelector, mappingFunc) => {
            if (!dataArray || dataArray.length === 0) return;
            
            const container = document.getElementById(sectionContainerId);
            if (!container) return;

            // 1. Click the add button enough times to match the data length
            const addBtn = container.querySelector(addBtnSelector);
            // We start at 1 because the HTML already has 1 empty row by default
            for (let i = 1; i < dataArray.length; i++) {
                if(addBtn) addBtn.click();
            }

            // 2. Now fill the rows
            const rows = container.querySelectorAll(`.${rowClass}`);
            dataArray.forEach((item, index) => {
                if (rows[index]) {
                    mappingFunc(rows[index], item);
                }
            });
        };

        // --- B. Section A: Admin Units ---
        fillInput('teachingUnits1', data.sectionA_AdminUnits);

        // --- C. Section B: Within College ---
        fillTable(data.sectionB_WithinCollege, 'form2', 'course-row', '.add-course-btn button', (row, item) => {
            const inputs = row.querySelectorAll('input, select');
            if(inputs[0]) inputs[0].value = item.courseCode || '';
            if(inputs[1]) inputs[1].value = item.section || '';
            if(inputs[2]) inputs[2].value = item.units || '';
            if(inputs[3]) inputs[3].value = item.effectiveDate || '';
        });

        // --- D. Section C: Other Colleges (Note: Needs specific logic if mixed in form2) ---
        // Since form2 mixes Section B and C, we find the divider and only look at rows after it
        if (data.sectionC_OtherCollege && data.sectionC_OtherCollege.length > 0) {
            const form2 = document.getElementById('form2');
            const divider = form2.querySelector('.form-divider');
            if (divider) {
                // Find the Add Button specifically for Section C (the one after the divider)
                const addBtns = form2.querySelectorAll('.add-course-btn button');
                const addBtnC = addBtns[addBtns.length - 1]; // Usually the second one

                for (let i = 1; i < data.sectionC_OtherCollege.length; i++) {
                    if(addBtnC) addBtnC.click();
                }

                // Get all course rows, but only process those that come AFTER the divider
                const allCourseRows = Array.from(form2.querySelectorAll('.course-row'));
                const sectionCRows = allCourseRows.filter(row => {
                    return row.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_PRECEDING;
                });

                data.sectionC_OtherCollege.forEach((item, index) => {
                    if (sectionCRows[index]) {
                        const inputs = sectionCRows[index].querySelectorAll('input, select');
                        if(inputs[0]) inputs[0].value = item.courseCode || '';
                        if(inputs[1]) inputs[1].value = item.section || '';
                        if(inputs[2]) inputs[2].value = item.units || '';
                        if(inputs[3]) inputs[3].value = item.effectiveDate || '';
                    }
                });
            }
        }

        // --- E. Section D: Admin Work ---
        fillTable(data.sectionD_AdminWork, 'form3', 'admin-row', '.add-course-btn button', (row, item) => {
            const inputs = row.querySelectorAll('input, select');
            if(inputs[0]) inputs[0].value = item.workDescription || '';
            if(inputs[1]) inputs[1].value = item.units || '';
            if(inputs[2]) inputs[2].value = item.effectiveDate || '';
        });

        // --- F. Section E: Practicum ---
        fillTable(data.sectionE_Practicum, 'form3', 'practicum-row', '.add-course-btn:last-of-type button', (row, item) => {
            const inputs = row.querySelectorAll('input, select');
            if(inputs[0]) inputs[0].value = item.courseCode || '';
            if(inputs[1]) inputs[1].value = item.numberOfStudents || '';
            if(inputs[2]) inputs[2].value = item.coordinator || '';
        });

        // --- G. Section F: Outside Employment ---
        fillTable(data.sectionF_OutsideEmployment, 'form4', 'employment-row', '.add-course-btn button', (row, item) => {
            const inputs = row.querySelectorAll('input');
            if(inputs[0]) inputs[0].value = item.employer || '';
            if(inputs[1]) inputs[1].value = item.position || '';
            if(inputs[2]) inputs[2].value = item.courseOrUnits || '';
            if(inputs[3]) inputs[3].value = item.hoursPerWeek || '';
        });

        // --- H. Section G: Remedial ---
        fillTable(data.sectionG_Remedial, 'form5', 'remedial-row', '.add-course-btn button', (row, item) => {
            const inputs = row.querySelectorAll('input, select');
            if(inputs[0]) inputs[0].value = item.courseId || '';
            if(inputs[1]) inputs[1].value = item.moduleCode || '';
            if(inputs[2]) inputs[2].value = item.section || '';
            if(inputs[3]) inputs[3].value = item.units || '';
            if(inputs[4]) inputs[4].value = item.numberOfStudents || '';
            if(inputs[5]) inputs[5].value = item.type || 'lecture';
        });

        // --- I. Finally, trigger calculations! ---
        if (window.calculateSummary) window.calculateSummary();
        if (window.updateDotsOnly) window.updateDotsOnly();
    }
});