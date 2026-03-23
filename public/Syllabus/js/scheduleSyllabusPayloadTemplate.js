// Append to scheduleSyllabus.js
window.submitSyllabus = async function() {
    try {
        // 1. Get step 1 data
        const draftStr = sessionStorage.getItem('syllabusFormDraft');
        if (!draftStr) {
            alert('Missing data from Step 1. Please go back and fill out the previous form.');
            return;
        }
        const payload = JSON.parse(draftStr);

        // 2. Schedule Table
        const scheduleRows = document.querySelectorAll('#schedule-editor-body tr');
        payload.weeklySchedule = Array.from(scheduleRows)
            .filter(r => r.style.display !== 'none')
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                return {
                    week: cells[0]?.innerText.trim() || '',
                    coNumber: cells[1]?.innerText.trim() || '',
                    moNumber: cells[2]?.innerText.trim() || '',
                    iloNumber: cells[3]?.innerText.trim() || '',
                    tlaMode: cells[4]?.innerText.trim() || '',
                    tlaActivities: cells[5]?.innerText.trim() || '',
                    assessmentTaskMode: cells[6]?.innerText.trim() || '',
                    assessmentTaskTask: cells[7]?.innerText.trim() || '',
                    coverageDay: cells[8]?.innerText.trim() || '',
                    coverageTopic: cells[9]?.innerText.trim() || '',
                    referenceNum: cells[10]?.innerText.trim() || '',
                    dateCovered: cells[11]?.innerText.trim() || ''
                };
            });

        // 3. Course Evaluation Table
        const evalRows = document.querySelectorAll('#evaluation-editor-body tr');
        payload.courseEvaluation = Array.from(evalRows)
            .filter(r => r.style.display !== 'none')
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                return {
                    moduleCode: cells[0]?.innerText.trim() || '',
                    coNumber: cells[1]?.innerText.trim() || '',
                    mediatingOutcome: cells[2]?.innerText.trim() || '',
                    assessmentWeightLT: cells[3]?.innerText.trim() || '',
                    assessmentWeightPE: cells[4]?.innerText.trim() || '',
                    modularWeight: cells[5]?.innerText.trim() || '',
                    finalWeight: cells[6]?.innerText.trim() || ''
                };
            });

        // 4. Assessment Tasks (CO Assessment) Table
        const assessRows = document.querySelectorAll('#assessment-editor-body tr');
        payload.courseOutcomesAssessment = Array.from(assessRows)
            .filter(r => r.style.display !== 'none')
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                return {
                    coNumber: cells[0]?.innerText.trim() || '',
                    assessmentTasks: cells[1]?.innerText.trim() || '',
                    minSatisfactoryPerf: cells[2]?.innerText.trim() || ''
                };
            });
            
        // POST to backend
        const response = await fetch('/syllabus/schedule/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.success) {
            sessionStorage.removeItem('syllabusFormDraft');
            alert('Syllabus successfully compiled and submitted for review!');
            window.location.href = '/syllabus'; // Per user request: back to course list
        } else {
            alert('Error saving syllabus: ' + (result.error || 'Unknown error'));
        }
        
    } catch (error) {
        console.error("Submission failed:", error);
        alert("An error occurred during submission.");
    }
}
