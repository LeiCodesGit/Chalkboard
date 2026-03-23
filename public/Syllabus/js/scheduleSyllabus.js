let isSelecting = false;
let startCell = null;
let currentRange = { minR: -1, maxR: -1, minC: -1, maxC: -1 };

function addScheduleRow() {
    const tbody = document.getElementById('schedule-editor-body');
    addRow(tbody, 12);
}

function addEvaluationRow() {
    const tbody = document.getElementById('evaluation-editor-body');
    addRow(tbody, 7);
}

function addAssessmentRow() {
    const tbody = document.getElementById('assessment-editor-body');
    addRow(tbody, 3);
}

function addRow(tbody, colCount) {
    if (!tbody) return;
    const tr = document.createElement('tr');

    for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        // Center text for first 5 columns of schedule table, or first 2 of evaluation table
        if (tbody.id === 'schedule-editor-body' && i < 5) td.className = 'center-text';
        if (tbody.id === 'evaluation-editor-body' && i < 2) td.className = 'center-text';

        const div = document.createElement('div');
        div.className = 'editable-cell';
        div.contentEditable = 'true';

        // Input Restrictions [cite: 173]
        div.addEventListener('keydown', (e) => {
            const tbodyId = tbody.id;
            const colIndex = parseInt(td.dataset.colIndex);

            // Allowed control keys for all restricted cells
            const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];
            if (controlKeys.includes(e.key) || (e.ctrlKey || e.metaKey)) return;

            // Evaluation Table: Weights (LT, PE, Modular, Final) should only be numbers
            if (tbodyId === 'evaluation-editor-body' && [3, 4, 5, 6].includes(colIndex)) {
                if (!/^[0-9.]$/.test(e.key)) {
                    e.preventDefault();
                } else if (e.key === '.' && div.innerText.includes('.')) {
                    e.preventDefault(); // Prevent double decimals
                }
            }

            // Assessment Table: MSP column should allow numbers, dots, and %
            if (tbodyId === 'assessment-editor-body' && colIndex === 2) {
                if (!/^[0-9.%]$/.test(e.key)) {
                    e.preventDefault();
                }
            }
        });

        // Prevention for Pasting
        div.addEventListener('paste', (e) => {
            const tbodyId = tbody.id;
            const colIndex = parseInt(td.dataset.colIndex);
            const text = (e.clipboardData || window.clipboardData).getData('text');

            if (tbodyId === 'evaluation-editor-body' && [3, 4, 5, 6].includes(colIndex)) {
                if (!/^[0-9.]*$/.test(text) || (text.includes('.') && div.innerText.includes('.'))) {
                    e.preventDefault();
                }
            }
            if (tbodyId === 'assessment-editor-body' && colIndex === 2) {
                if (!/^[0-9.%]*$/.test(text)) {
                    e.preventDefault();
                }
            }
        });

        td.appendChild(div);
        tr.appendChild(td);

        td.addEventListener('mousedown', (e) => {
            isSelecting = true;
            const box = document.getElementById('table-selection-box');
            if (box) {
                box.classList.add('dragging');
                // Move the box to the container of the current table
                const container = td.closest('.outcomes-table-container');
                if (container && box.parentElement !== container) {
                    container.appendChild(box);
                }
            }
            startCell = td;
            updateRange(td, td);
        });

        td.addEventListener('mouseenter', () => {
            if (isSelecting) {
                const startTable = startCell.closest('tbody');
                const targetTable = td.closest('tbody');
                if (startTable === targetTable) {
                    extendSelection(td);
                }
            }
        });
    }

    tbody.appendChild(tr);
    renumberRows(tbody);
}

function renumberRows(tbody) {
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((tr, r) => {
        tr.dataset.rowIndex = r.toString();
        const tds = tr.querySelectorAll('td');
        tds.forEach((td, c) => {
            td.dataset.colIndex = c.toString();
        });
    });
}

function deleteScheduleRow() {
    const tbody = document.getElementById('schedule-editor-body');
    deleteRow(tbody);
}

function deleteEvaluationRow() {
    const tbody = document.getElementById('evaluation-editor-body');
    deleteRow(tbody);
}

function deleteAssessmentRow() {
    const tbody = document.getElementById('assessment-editor-body');
    deleteRow(tbody);
}

function deleteRow(tbody) {
    if (!tbody) return;
    const activeBody = startCell ? startCell.closest('tbody') : null;
    if (activeBody !== tbody) {
        // Fallback to last row if no active selection in this table
        if (tbody.rows.length > 0) tbody.deleteRow(-1);
        renumberRows(tbody);
        return;
    }

    if (currentRange.minR !== -1) {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        for (let i = currentRange.maxR; i >= currentRange.minR; i--) {
            if (rows[i]) rows[i].remove();
        }
        hideSelectionBox();
    } else if (tbody.rows.length > 0) {
        tbody.deleteRow(-1);
    }
    renumberRows(tbody);
}

function execCmd(command, value = null) {
    const activeCell = document.querySelector('td.highlighted-cell .editable-cell');
    if (activeCell) activeCell.focus();
    document.execCommand(command, false, value);
}

// Selection Logic (Matching infoSyllabus.js)
function extendSelection(td) {
    if (!isSelecting) return;
    updateRange(startCell, td);
}

function updateRange(c1, c2) {
    if (!c1 || !c2) return;
    const r1 = parseInt(c1.closest('tr').dataset.rowIndex);
    const r2 = parseInt(c2.closest('tr').dataset.rowIndex);
    const col1 = parseInt(c1.dataset.colIndex);
    const col2 = parseInt(c2.dataset.colIndex);

    const range = {
        minR: Math.min(r1, r2),
        maxR: Math.max(r1, r2),
        minC: Math.min(col1, col2),
        maxC: Math.max(col1, col2)
    };

    const tbody = c1.closest('tbody');
    currentRange = expandRangeForMerges(tbody, range);
    renderSelection();
}

function expandRangeForMerges(tbody, range) {
    const expanded = { ...range };
    const rows = tbody.querySelectorAll('tr');
    let changed = true;

    while (changed) {
        changed = false;
        for (let r = expanded.minR; r <= expanded.maxR; r++) {
            const tr = rows[r];
            if (!tr) continue;
            const tds = tr.querySelectorAll('td');
            tds.forEach(td => {
                const c = parseInt(td.dataset.colIndex);
                const cs = td.colSpan || 1;
                const rs = td.rowSpan || 1;
                const cEnd = c + cs - 1;
                const rEnd = r + rs - 1;

                // If cell intersects with range, expand range to cover full cell
                if (cEnd >= expanded.minC && c <= expanded.maxC &&
                    rEnd >= expanded.minR && r <= expanded.maxR) {
                    if (c < expanded.minC) { expanded.minC = c; changed = true; }
                    if (cEnd > expanded.maxC) { expanded.maxC = cEnd; changed = true; }
                    if (r < expanded.minR) { expanded.minR = r; changed = true; }
                    if (rEnd > expanded.maxR) { expanded.maxR = rEnd; changed = true; }
                }
            });
        }
    }
    return expanded;
}

function renderSelection() {
    if (!startCell || currentRange.minR === -1) return;
    const tbody = startCell.closest('tbody');
    const container = tbody.closest('.outcomes-table-container');
    if (!tbody || !container) return;

    // Clear highlights from ALL tables
    document.querySelectorAll('td.highlighted-cell').forEach(td => td.classList.remove('highlighted-cell'));

    let minTop = Infinity, minLeft = Infinity, maxBottom = 0, maxRight = 0;
    let found = false;

    const rows = tbody.querySelectorAll('tr');
    rows.forEach((tr, r) => {
        if (r >= currentRange.minR && r <= currentRange.maxR) {
            const tds = tr.querySelectorAll('td');
            tds.forEach((td, c) => {
                const colIndex = parseInt(td.dataset.colIndex);
                if (colIndex >= currentRange.minC && colIndex <= currentRange.maxC) {
                    if (td.style.display === 'none') return;
                    td.classList.add('highlighted-cell');
                    found = true;

                    const t = td.offsetTop;
                    const l = td.offsetLeft;
                    const w = td.offsetWidth;
                    const h = td.offsetHeight;

                    minTop = Math.min(minTop, t);
                    minLeft = Math.min(minLeft, l);
                    maxBottom = Math.max(maxBottom, t + h);
                    maxRight = Math.max(maxRight, l + w);
                }
            });
        }
    });

    const box = document.getElementById('table-selection-box');
    if (found && box) {
        box.style.display = 'block';
        box.style.top = (minTop - 1) + 'px';
        box.style.left = (minLeft - 1) + 'px';
        box.style.width = (maxRight - minLeft + 2) + 'px';
        box.style.height = (maxBottom - minTop + 2) + 'px';
    } else if (box) {
        box.style.display = 'none';
    }
}

function hideSelectionBox() {
    const box = document.getElementById('table-selection-box');
    if (box) box.style.display = 'none';
    document.querySelectorAll('td.highlighted-cell').forEach(td => td.classList.remove('highlighted-cell'));
    currentRange = { minR: -1, maxR: -1, minC: -1, maxC: -1 };
}

document.addEventListener('mouseup', () => {
    isSelecting = false;
    const box = document.getElementById('table-selection-box');
    if (box) box.classList.remove('dragging');
});

// Close palette if clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('color-palette-menu');
    if (menu && menu.classList.contains('active')) {
        const dropdowns = document.querySelectorAll('.color-picker-dropdown');
        let clickedInside = false;
        dropdowns.forEach(d => { if (d.contains(e.target)) clickedInside = true; });
        if (!clickedInside) menu.classList.remove('active');
    }
});

// Merge Function (Reference: infoSyllabus.js toggleMerge)
function toggleMerge() {
    if (currentRange.minR === -1 || !startCell) return;

    const tbody = startCell.closest('tbody');
    const rows = tbody.querySelectorAll('tr');
    let targetCell = null;
    let combinedHTML = '';
    const rowSpan = currentRange.maxR - currentRange.minR + 1;
    const colSpan = currentRange.maxC - currentRange.minC + 1;

    let isUnmerging = false;
    for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
        const tr = rows[r];
        const tds = tr.querySelectorAll('td');
        tds.forEach(td => {
            const c = parseInt(td.dataset.colIndex);
            if (c >= currentRange.minC && c <= currentRange.maxC) {
                if (td && (td.rowSpan > 1 || td.colSpan > 1)) {
                    isUnmerging = true;
                    targetCell = td;
                }
            }
        });
        if (isUnmerging) break;
    }

    if (isUnmerging && targetCell) {
        const startR = parseInt(targetCell.closest('tr').dataset.rowIndex);
        const startC = parseInt(targetCell.dataset.colIndex);
        const rs = targetCell.rowSpan;
        const cs = targetCell.colSpan;
        for (let r = startR; r < startR + rs; r++) {
            const tr = rows[r];
            const tds = tr.querySelectorAll('td');
            tds.forEach(td => {
                const c = parseInt(td.dataset.colIndex);
                if (c >= startC && c < startC + cs) {
                    td.style.display = '';
                    td.rowSpan = 1;
                    td.colSpan = 1;
                }
            });
        }
    } else {
        for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
            const tr = rows[r];
            const tds = tr.querySelectorAll('td');
            tds.forEach(td => {
                const c = parseInt(td.dataset.colIndex);
                if (c >= currentRange.minC && c <= currentRange.maxC) {
                    if (!td || td.style.display === 'none') return;
                    const div = td.querySelector('.editable-cell');
                    if (r === currentRange.minR && c === currentRange.minC) {
                        targetCell = td;
                        combinedHTML = div.innerHTML;
                    } else {
                        if (div.innerText.trim() !== '') combinedHTML += '<br>' + div.innerHTML;
                        td.style.display = 'none';
                    }
                }
            });
        }

        if (targetCell) {
            targetCell.rowSpan = rowSpan;
            targetCell.colSpan = colSpan;
            targetCell.style.display = '';
            targetCell.querySelector('.editable-cell').innerHTML = combinedHTML;
        }
    }

    renderSelection();
    renumberRows(tbody);
}

function fillCells() {
    if (currentRange.minR === -1 || !startCell) return;

    const tbody = startCell.closest('tbody');
    const rows = tbody.querySelectorAll('tr');

    // Get source cell
    const firstRow = rows[currentRange.minR];
    const tds = firstRow.querySelectorAll('td');
    // Find cell by colIndex since horizontal index might differ due to merge
    let sourceCell = null;
    tds.forEach(td => {
        if (parseInt(td.dataset.colIndex) === currentRange.minC) sourceCell = td;
    });

    if (!sourceCell) return;
    const sourceHTML = sourceCell.querySelector('.editable-cell').innerHTML;

    for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
        const tr = rows[r];
        const tds = tr.querySelectorAll('td');
        tds.forEach(td => {
            const c = parseInt(td.dataset.colIndex);
            if (c >= currentRange.minC && c <= currentRange.maxC) {
                if ((r === currentRange.minR && c === currentRange.minC) || !td || td.style.display === 'none') return;
                const div = td.querySelector('.editable-cell');
                if (div) div.innerHTML = sourceHTML;
            }
        });
    }
    renderSelection();
}

let activeFillColor = '#FFFF00';

const themeColors = [
    '#ffffff', '#000000', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646',
    '#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dbe5f1', '#f2dcdb', '#ebf1de', '#e6e0ec', '#dbeef3', '#fdeada',
    '#d8d8d8', '#595959', '#c4bd97', '#8db3e2', '#b8cce4', '#e5b9b7', '#d7e3bc', '#ccc1d9', '#b7dee8', '#fbd5b5',
    '#bfbfbf', '#3f3f3f', '#938953', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a2c7', '#92cddc', '#fac08f',
    '#a5a5a5', '#262626', '#494429', '#17365d', '#365f91', '#953734', '#76923c', '#5f497a', '#31859b', '#e36c09',
    '#7f7f7f', '#0c0c0c', '#1d1b10', '#0f243e', '#244061', '#632423', '#4f6128', '#3f3151', '#205867', '#974806'
];

const standardColors = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];

function initColorPalette() {
    const themeGrid = document.getElementById('theme-colors-grid');
    const standardGrid = document.getElementById('standard-colors-grid');
    if (!themeGrid || !standardGrid) return;

    themeColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = color;
        swatch.onclick = (e) => { e.stopPropagation(); selectPaletteColor(color); };
        themeGrid.appendChild(swatch);
    });

    standardColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = color;
        swatch.onclick = (e) => { e.stopPropagation(); selectPaletteColor(color); };
        standardGrid.appendChild(swatch);
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('color-palette-menu');
        if (menu && menu.classList.contains('active') && !e.target.closest('.color-picker-dropdown')) {
            menu.classList.remove('active');
        }
    });
}

function toggleColorPalette(e) {
    e.stopPropagation();
    const menu = document.getElementById('color-palette-menu');
    if (!menu) return;

    const dropdown = e.currentTarget.closest('.color-picker-dropdown');
    if (dropdown && menu.parentElement !== dropdown) {
        dropdown.appendChild(menu);
    }

    menu.classList.toggle('active');
}

function selectPaletteColor(color) {
    activeFillColor = color;
    updateActiveColorBar(color);
    applyActiveColor();
    const menu = document.getElementById('color-palette-menu');
    menu.classList.remove('active');
}

function updateActiveColorBar(color) {
    const bar = document.getElementById('active-color-bar');
    if (bar) bar.style.backgroundColor = color === 'transparent' ? '#ccc' : color;
}

function applyActiveColor() {
    if (currentRange.minR === -1 || !startCell) return;
    const tbody = startCell.closest('tbody');
    const rows = tbody.querySelectorAll('tr');
    for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
        const tr = rows[r];
        if (!tr) continue;
        const tds = tr.querySelectorAll('td');
        tds.forEach(td => {
            const c = parseInt(td.dataset.colIndex);
            if (c >= currentRange.minC && c <= currentRange.maxC) {
                if (!td || td.style.display === 'none') return;
                td.style.setProperty('background-color', activeFillColor, 'important');
            }
        });
    }
    renderSelection();
}

function autoSaveSchedule() {
    const data = {
        schedule: Array.from(document.querySelectorAll('#schedule-editor-body tr')).map(row => 
            Array.from(row.querySelectorAll('.editable-cell')).map(cell => cell.innerHTML)),
        evaluation: Array.from(document.querySelectorAll('#evaluation-editor-body tr')).map(row => 
            Array.from(row.querySelectorAll('.editable-cell')).map(cell => cell.innerHTML)),
        assessment: Array.from(document.querySelectorAll('#assessment-editor-body tr')).map(row => 
            Array.from(row.querySelectorAll('.editable-cell')).map(cell => cell.innerHTML))
    };
    const key = `syllabus_draft_schedule_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    sessionStorage.setItem(key, JSON.stringify(data));
}

function loadSchedule() {
    const key = `syllabus_draft_schedule_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const saved = sessionStorage.getItem(key);
    if (!saved) return;
    const data = JSON.parse(saved);

    const tables = [
        { id: 'schedule-editor-body', rows: data.schedule, func: addScheduleRow },
        { id: 'evaluation-editor-body', rows: data.evaluation, func: addEvaluationRow },
        { id: 'assessment-editor-body', rows: data.assessment, func: addAssessmentRow }
    ];

    tables.forEach(t => {
        const body = document.getElementById(t.id);
        if (body && t.rows) {
            body.innerHTML = ''; // Wipe defaults
            t.rows.forEach(rowContent => {
                t.func();
                const lastRow = body.lastElementChild;
                const cells = lastRow.querySelectorAll('.editable-cell');
                rowContent.forEach((html, i) => { if(cells[i]) cells[i].innerHTML = html; });
            });
        }
    });
}

// Wire it up
window.addEventListener('load', () => {
    initColorPalette();
    
    const key = `syllabus_draft_schedule_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedSessionData = sessionStorage.getItem(key);
    const hasServerData = window.SERVER_SYLLABUS_DATA && 
                          ( (window.SERVER_SYLLABUS_DATA.schedules && window.SERVER_SYLLABUS_DATA.schedules.length > 0) || 
                            (window.SERVER_SYLLABUS_DATA.evaluation && window.SERVER_SYLLABUS_DATA.evaluation.length > 0) );

    if (hasServerData && !savedSessionData) {
        loadFromServer();
    } else if (savedSessionData) {
        loadFromSession();
    } else {
        // Initial defaults if nothing found
        const scheduleBody = document.getElementById('schedule-editor-body');
        if (scheduleBody) for (let i = 0; i < 5; i++) addScheduleRow();
        const evalBody = document.getElementById('evaluation-editor-body');
        if (evalBody) for (let i = 0; i < 3; i++) addEvaluationRow();
        const assessmentBody = document.getElementById('assessment-editor-body');
        if (assessmentBody) for (let i = 0; i < 3; i++) addAssessmentRow();
    }

    document.addEventListener('input', (e) => {
        if (e.target.closest('[contenteditable="true"]')) autoSaveSchedule();
    });
});

/* ── Final Submission Integration ── */
window.submitSyllabus = async function() {
    try {
        // 1. Get step 1 data
        const key = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
        const draftStr = sessionStorage.getItem(key);
        if (!draftStr) {
            alert('Missing data from Step 1. Please go back and fill out the previous form.');
            return;
        }
        const payload = JSON.parse(draftStr);

        if (!payload.syllabusId) {
            alert('CRITICAL ERROR: The Syllabus ID is missing from your session data. Please return to the Courses Dashboard and start again.');
            return;
        }

        // 2. Course Schedule Table Validation
        const scheduleRows = document.querySelectorAll('#schedule-editor-body tr');
        if (scheduleRows.length === 0) {
            alert("All fields are required.");
            return;
        }
        
        let scheduleFilled = false;
        payload.weeklySchedule = Array.from(scheduleRows)
            .filter(r => r.style.display !== 'none') // skip hidden merged cells
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                const rowData = {
                    week: cells[0]?.innerText.trim() || '',
                    coNumber: cells[1]?.innerText.trim() || '',
                    moNumber: cells[2]?.innerText.trim() || '',
                    iloNumber: cells[3]?.innerText.trim() || '',
                    coverageDay: cells[4]?.innerText.trim() || '',
                    coverageTopic: cells[5]?.innerText.trim() || '',
                    tlaMode: cells[6]?.innerText.trim() || '',
                    tlaActivities: cells[7]?.innerText.trim() || '',
                    assessmentTaskMode: cells[8]?.innerText.trim() || '',
                    assessmentTaskTask: cells[9]?.innerText.trim() || '',
                    referenceNum: cells[10]?.innerText.trim() || '',
                    dateCovered: cells[11]?.innerText.trim() || ''
                };
                if (rowData.week || rowData.coverageTopic) scheduleFilled = true;
                return rowData;
            });
            
        if (!scheduleFilled) {
            alert("All fields are required.");
            return;
        }

        // 3. Course Evaluation Table Validation
        const evalRows = document.querySelectorAll('#evaluation-editor-body tr');
        if (evalRows.length === 0) {
            alert("All fields are required.");
            return;
        }
        
        let evalFilled = false;
        payload.courseEvaluation = Array.from(evalRows)
            .filter(r => r.style.display !== 'none')
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                const rowData = {
                    moduleCode: cells[0]?.innerText.trim() || '',
                    coNumber: cells[1]?.innerText.trim() || '',
                    mediatingOutcome: cells[2]?.innerText.trim() || '',
                    assessmentWeightLT: cells[3]?.innerText.trim() || '',
                    assessmentWeightPE: cells[4]?.innerText.trim() || '',
                    modularWeight: cells[5]?.innerText.trim() || '',
                    finalWeight: cells[6]?.innerText.trim() || ''
                };
                if (rowData.moduleCode || rowData.coNumber) evalFilled = true;
                return rowData;
            });

        if (!evalFilled) {
            alert("All fields are required.");
            return;
        }

        // 4. Assessment Tasks (CO Assessment) Table Validation
        const assessRows = document.querySelectorAll('#assessment-editor-body tr');
        if (assessRows.length === 0) {
            alert("All fields are required.");
            return;
        }
        
        let assessFilled = false;
        payload.courseOutcomesAssessment = Array.from(assessRows)
            .filter(r => r.style.display !== 'none')
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                const rowData = {
                    coNumber: cells[0]?.innerText.trim() || '',
                    assessmentTasks: cells[1]?.innerText.trim() || '',
                    minSatisfactoryPerf: cells[2]?.innerText.trim() || ''
                };
                if (rowData.coNumber || rowData.assessmentTasks) assessFilled = true;
                return rowData;
            });

        if (!assessFilled) {
            alert("All fields are required.");
            return;
        }
            
        // POST to backend
        const fetchResponse = await fetch('/syllabus/schedule/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await fetchResponse.json();
        
        if (result.success) {
            const key = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
            sessionStorage.removeItem(key);
            alert('Syllabus successfully compiled and submitted for review!');
            
            // Role-based redirection
            const role = (window.USER_ROLE || '').toLowerCase();
            if (role === 'dean') {
                window.location.href = `/syllabus/${window.USER_ID}`;
            } else if (role === 'professor' || role === 'faculty') {
                window.location.href = '/faculty';
            } else if (role === 'program-chair' || role === 'program chair') {
                window.location.href = '/syllabus/prog-chair';
            } else {
                window.location.href = '/syllabus';
            }
        } else {
            alert('Error saving syllabus: ' + (result.error || 'Unknown error'));
        }
        
    } catch (error) {
        console.error("Submission failed:", error);
        alert("An error occurred during submission. Check console for details.");
    }
};

function loadFromServer() {
    if (!window.SERVER_SYLLABUS_DATA) return;
    const { schedules, evaluation } = window.SERVER_SYLLABUS_DATA;

    // Restore Weekly Schedule
    const scheduleBody = document.getElementById('schedule-editor-body');
    if (scheduleBody && schedules && schedules.length > 0) {
        scheduleBody.innerHTML = '';
        schedules.forEach(item => {
            addScheduleRow();
            const lastRow = scheduleBody.lastElementChild;
            const cells = lastRow.querySelectorAll('.editable-cell');
            if (cells.length >= 12) {
                cells[0].innerText = item.week || "";
                cells[1].innerText = item.outcomeCo || "";
                cells[2].innerText = item.outcomeMo || "";
                cells[3].innerText = item.outcomeIlo || "";
                cells[4].innerText = item.coverageDay || "";
                cells[5].innerText = item.coverageTopic || "";
                cells[6].innerText = item.tlaMode || "";
                cells[7].innerText = item.tlaActivities || "";
                cells[8].innerText = item.assessmentTaskMode || "";
                cells[9].innerText = item.assessmentTaskTask || "";
                cells[10].innerText = item.referenceNum || "";
                cells[11].innerText = item.dateCovered || "";
            }
        });
    }

    // Restore Course Evaluation
    const evalBody = document.getElementById('evaluation-editor-body');
    if (evalBody && evaluation && evaluation.length > 0) {
        evalBody.innerHTML = '';
        evaluation.forEach(item => {
            addEvaluationRow();
            const lastRow = evalBody.lastElementChild;
            const cells = lastRow.querySelectorAll('.editable-cell');
            if (cells.length >= 7) {
                cells[0].innerText = item.moduleCode || "";
                cells[1].innerText = item.coNumber || "";
                cells[2].innerText = item.mediatingOutcome || "";
                cells[3].innerText = item.onlineTaskWeight || "0";
                cells[4].innerText = item.longExaminationWeight || "0";
                cells[5].innerText = item.moduleWeight || "0";
                cells[6].innerText = item.finalWeight || "0";
            }
        });
    }
}

function loadFromSession() {
    const key = `syllabus_draft_schedule_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedData = sessionStorage.getItem(key);
    if (!savedData) return;
    const data = JSON.parse(savedData);

    const scheduleBody = document.getElementById('schedule-editor-body');
    if (scheduleBody && data.schedule) {
        scheduleBody.innerHTML = '';
        data.schedule.forEach(rowCells => {
            addScheduleRow();
            const lastRow = scheduleBody.lastElementChild;
            const targetCells = lastRow.querySelectorAll('.editable-cell');
            rowCells.forEach((html, i) => { if (targetCells[i]) targetCells[i].innerHTML = html; });
        });
    }

    const evalBody = document.getElementById('evaluation-editor-body');
    if (evalBody && data.evaluation) {
        evalBody.innerHTML = '';
        data.evaluation.forEach(rowCells => {
            addEvaluationRow();
            const lastRow = evalBody.lastElementChild;
            const targetCells = lastRow.querySelectorAll('.editable-cell');
            rowCells.forEach((html, i) => { if (targetCells[i]) targetCells[i].innerHTML = html; });
        });
    }

    const assessmentBody = document.getElementById('assessment-editor-body');
    if (assessmentBody && data.assessment) {
        assessmentBody.innerHTML = '';
        data.assessment.forEach(rowCells => {
            addAssessmentRow();
            const lastRow = assessmentBody.lastElementChild;
            const targetCells = lastRow.querySelectorAll('.editable-cell');
            rowCells.forEach((html, i) => { if (targetCells[i]) targetCells[i].innerHTML = html; });
        });
    }
}
