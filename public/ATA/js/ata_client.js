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

    // Run visibility check on load!
    window.handleInnerSectionVisibility();
});

// Back Button
const backButton = document.querySelector('.back-button');
if (backButton) {
    backButton.addEventListener('click', () => {
        window.location.href = '/ata-main';
    });
}

// ==========================================
// 2. USER STATE (Strict Validation Kill Switch)
// ==========================================
const rawRole = document.body.getAttribute('data-role');
const rawEmployment = document.body.getAttribute('data-employment');
const rawPracticum = document.body.getAttribute('data-practicum');

// 👇 Check if we are on the public landing page
const isPublicPage = window.location.pathname === '/' || window.location.pathname === '/ata' || window.location.pathname.startsWith('/auth');

// 🚨 THE KILL SWITCH (Only runs on protected pages!)
if (!isPublicPage) {
    if (!rawRole || rawRole.trim() === "" || !rawEmployment || rawEmployment.trim() === "") {
        alert("⚠️ Security Error: Missing or invalid real-time session data. Logging out for your protection.");
        window.location.href = '/auth/logout'; 
        throw new Error("FATAL: Session data corrupted. Halting script execution."); 
    }
}

// Data is verified (or we are on a public page). Save it securely to memory.
window.currentUser = {
    role: rawRole || "Guest", 
    employmentType: rawEmployment || "Full-Time",
    employmentFromOutside: (rawEmployment === "Part-Time"),
    isPracticumCoordinator: (rawPracticum === "true") 
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.currentUser.employmentType === "Part-Time") {
        const partTimeRadio = document.getElementById('radioPartTime');
        if (partTimeRadio) partTimeRadio.checked = true;
    } else {
        const fullTimeRadio = document.getElementById('radioFullTime');
        if (fullTimeRadio) fullTimeRadio.checked = true;
    }

    if(window.handleInnerSectionVisibility) window.handleInnerSectionVisibility();
});

// ==========================================
// 3. VISIBILITY LOGIC (The Rules)
// ==========================================
// Define "Admin" privileges (including the new Practicum Coordinator role)
const isAdmin = (window.currentUser.role === "Program-Chair" || window.currentUser.role === "Dean" || window.currentUser.isPracticumCoordinator);

window.isStepVisible = function(stepNumber) {
    const isPartTime = window.currentUser.employmentFromOutside;

    switch(stepNumber) {
        case 1: return true; 
        case 2: return true; 
        case 3: return true; 
        case 4: return isPartTime; // Section F: Outside Employment
        case 5: return true; 
        case 6: return true; 
        case 7: return isAdmin;    // Section H: Approval (Only Chairs, Deans, & Coordinators)
        default: return false;
    }
};

window.handleInnerSectionVisibility = function() {
    // Existing Form sections
    const sectionA = document.getElementById('sectionA_Container'); 
    if (sectionA) sectionA.style.display = isAdmin ? 'block' : 'none';

    const sectionD = document.getElementById('sectionD_Container');
    if (sectionD) sectionD.style.display = isAdmin ? 'block' : 'none';

    // Dashboard Admin Buttons
    const dashboardBtn = document.getElementById('adminCourseBtn');
    if (dashboardBtn) dashboardBtn.style.display = isAdmin ? 'block' : 'none';

    const adminApprovalCard = document.getElementById('adminApprovalCard');
    if (adminApprovalCard) adminApprovalCard.style.display = isAdmin ? 'block' : 'none';
};

// ==========================================
// --- CALCULATE SUMMARY TOTALS (Fixed UI Bug) ---
// ==========================================
window.calculateSummary = function() {
    let totals = { A: 0, B: 0, C: 0, D: 0, E: 0, G: 0 };

    const getUnit = (row, inputIndex) => Number(row.querySelectorAll('input')[inputIndex]?.value) || 0;

    // Scrape Section A (From Form 1)
    totals.A = Number(document.getElementById('teachingUnits1')?.value) || 0;

    // Scrape Form 2 (Sections B & C) - FIXED WRAPPER TARGETING
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

    // Scrape Form 3 (Section D & E)
    document.querySelectorAll('#form3 .admin-row').forEach(row => totals.D += getUnit(row, 1));
    
    // Scrape Form 5 (Section G)
    // Scrape Form 5 (Section G) with Mapua Multipliers
    document.querySelectorAll('#form5 .remedial-row').forEach(row => {
        const units = Number(row.querySelectorAll('input')[3]?.value) || 0;
        const students = Number(row.querySelectorAll('input')[4]?.value) || 0;
        const type = row.querySelector('select.type-select')?.value || "lecture";

        // Live UI Calculation for the user to see
        let effective = units * (students / 40);
        if (type === 'lab') effective *= 2;
        
        totals.G += effective;
    });

    // Update the UI Table
    const summaryRows = document.querySelectorAll('.summary-row');
    if(summaryRows.length >= 5) {
        summaryRows[0].querySelector('.units').textContent = totals.B;
        summaryRows[0].querySelector('.effective').textContent = totals.B; 
        summaryRows[1].querySelector('.units').textContent = totals.C;
        summaryRows[1].querySelector('.effective').textContent = totals.C; 
        summaryRows[2].querySelector('.units').textContent = totals.D;
        summaryRows[2].querySelector('.effective').textContent = totals.D; 
        summaryRows[3].querySelector('.units').textContent = totals.E;
        summaryRows[3].querySelector('.effective').textContent = totals.E; 
        summaryRows[4].querySelector('.units').textContent = totals.G;
        summaryRows[4].querySelector('.effective').textContent = totals.G; 
    }

    // Grand Total (A + B + C + D + E)
    const grandTotal = totals.A + totals.B + totals.C + totals.D + totals.E;
    const totalRow = document.querySelector('.summary-total');
    if(totalRow) {
        totalRow.querySelector('.units').textContent = grandTotal;
        totalRow.querySelector('.effective').textContent = grandTotal;
    }
};

// ==========================================
// 5. NEXT BUTTON LOGIC & API SUBMISSION
// ==========================================
const nextBtn = document.getElementById('nextBtn');

if (nextBtn) {
    nextBtn.addEventListener('click', async function() {
        
        if (this.textContent === 'Finish' || this.textContent === 'Submit') {
            this.textContent = 'Submitting...'; 
            this.disabled = true;

            const payload = {
                facultyName: document.getElementById('facultyName')?.value.trim() || "",
                position: document.getElementById('position')?.value.trim() || "",
                college: document.getElementById('college')?.value.trim() || "",
                address: document.getElementById('address')?.value.trim() || "",
                // employmentStatus: document.querySelector('input[name="employment"]:checked')?.value || "",
                employmentType: document.querySelector('input[name="employment"]:checked')?.value || "",
                
                term: "2nd Term", 
                academicYear: "2025-2026", 
                action: "SUBMIT",
                
                // 👇 ADDED SECTION A SCRAPE 👇
                sectionA_AdminUnits: Number(document.getElementById('teachingUnits1')?.value) || 0,
                
                sectionB_WithinCollege: [],
                sectionC_OtherCollege: [],
                sectionD_AdminWork: [],
                sectionE_Practicum: [],
                sectionF_OutsideEmployment: [],
                sectionG_Remedial: []
            };

            const getVal = (row, index) => row.querySelectorAll('input')[index]?.value.trim() || "";
            const getNum = (row, index) => Number(row.querySelectorAll('input')[index]?.value) || 0;

            // Scrape Section B & C (FIXED WRAPPER TARGETING)
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

            // Scrape Section D
            document.querySelectorAll('#form3 .admin-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionD_AdminWork.push({
                    workDescription: getVal(row, 0),
                    units: getNum(row, 1),
                    effectiveDate: getVal(row, 2)
                });
            });

            // Scrape Section E
            document.querySelectorAll('#form3 .practicum-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionE_Practicum.push({
                    courseCode: getVal(row, 0),
                    numberOfStudents: getNum(row, 1),
                    coordinator: getVal(row, 2)
                });
            });

            // Scrape Section F
            document.querySelectorAll('#form4 .employment-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionF_OutsideEmployment.push({
                    employer: getVal(row, 0),
                    position: getVal(row, 1),
                    courseOrUnits: getVal(row, 2),
                    hoursPerWeek: getNum(row, 3)
                });
            });

            // Scrape Section G
            document.querySelectorAll('#form5 .remedial-row').forEach(row => {
                if (getVal(row, 0)) payload.sectionG_Remedial.push({
                    courseId: getVal(row, 0),
                    moduleCode: getVal(row, 1),
                    section: getVal(row, 2),
                    units: getNum(row, 3),
                    numberOfStudents: getNum(row, 4),
                    type: row.querySelector('select.type-select')?.value || "lecture"
                });
            });

            try {
                const token = localStorage.getItem('jwtToken') || 'dummy_test_token_123'; 
                
                const response = await fetch('/ata/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    alert("ATA Form submitted successfully!");
                    window.location.href = '/dashboard/window'; 
                } else {
                    const errorText = await response.text(); 
                    console.error("Server Response:", errorText);
                    try {
                        const errorData = JSON.parse(errorText);
                        alert(`Server Rejected Submission:\n${errorData.error || errorData.message || 'Unknown Error'}`);
                    } catch(e) {
                        alert(`Server Error`);
                    }
                    this.textContent = 'Submit'; 
                    this.disabled = false;
                }

            } catch (error) {
                console.error("Submission failed:", error);
                alert("Server error. Please try again.");
                this.textContent = 'Submit';
                this.disabled = false;
            }
            return;
        }

        let nextStepCandidate = window.currentStep + 1;
        while (nextStepCandidate <= 7 && !window.isStepVisible(nextStepCandidate)) {
            nextStepCandidate++;
        }

        if (nextStepCandidate <= 7) {
            window.currentStep = nextStepCandidate;
            if(window.updateFormDisplay) window.updateFormDisplay();
            
            if (window.currentStep === 6 && window.calculateSummary) {
                window.calculateSummary();
            }
        } else {
            alert("End of form.");
        }
    });
}