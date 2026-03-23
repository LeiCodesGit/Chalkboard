function autoSaveNewSyllabus() {
    const draftData = {
        peos: Array.from(document.querySelectorAll('#peo-container .peo-row')).map(row => ({
            text: row.querySelector('.peo-editable-text')?.innerText || "",
            checks: Array.from(row.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
        })),
        sos: Array.from(document.querySelectorAll('#so-container .peo-row')).map(row => ({
            text: row.querySelector('.peo-editable-text')?.innerText || "",
            checks: Array.from(row.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
        }))
    };
    const key = `syllabus_draft_new_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    sessionStorage.setItem(key, JSON.stringify(draftData));
}

function format(command) {
    document.execCommand(command, false, null);
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    alert("File attached: " + file.name);
}

/* ── SO: Renumber + Add + Delete ── */
function renumberSoRows() {
    const container = document.getElementById('so-container');
    const rows = container.getElementsByClassName('peo-row');
    Array.from(rows).forEach((row, i) => {
        row.querySelector('.peo-number').textContent = `${String.fromCharCode(97 + i)}.`;
    });
}

function addSoRow() {
    const container = document.getElementById('so-container');
    const rows = container.getElementsByClassName('peo-row');
    const letter = String.fromCharCode(97 + rows.length);

    const rowDiv = document.createElement('div');
    rowDiv.className = 'peo-row';
    rowDiv.innerHTML = `
        <div class="peo-text-side">
            <span class="peo-number">${letter}.</span>
            <div class="peo-editable-text" contenteditable="true" data-placeholder="Edit text"></div>
        </div>
        <div class="peo-checkbox-side">
            <input type="checkbox"><input type="checkbox"><input type="checkbox">
        </div>
        <button class="btn-delete-row" onclick="deleteSoRow(this)" title="Delete row">
            <span class="material-symbols-outlined">remove</span>
        </button>
    `;
    container.appendChild(rowDiv);
}

function deleteSoRow(btn) {
    btn.closest('.peo-row').remove();
    renumberSoRows();
}

/* ── PEO: Renumber + Add + Delete ── */
function renumberPeoRows() {
    const container = document.getElementById('peo-container');
    const rows = container.getElementsByClassName('peo-row');
    Array.from(rows).forEach((row, i) => {
        row.querySelector('.peo-number').textContent = `${i + 1}.`;
    });
}

function addPeoRow() {
    const container = document.getElementById('peo-container');
    const nextNum = container.getElementsByClassName('peo-row').length + 1;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'peo-row';
    rowDiv.innerHTML = `
        <div class="peo-text-side">
            <span class="peo-number">${nextNum}.</span>
            <div class="peo-editable-text" contenteditable="true" data-placeholder="Edit text"></div>
        </div>
        <div class="peo-checkbox-side">
            <input type="checkbox"><input type="checkbox"><input type="checkbox">
        </div>
        <button class="btn-delete-row" onclick="deletePeoRow(this)" title="Delete row">
            <span class="material-symbols-outlined">remove</span>
        </button>
    `;
    container.appendChild(rowDiv);
}

function deletePeoRow(btn) {
    btn.closest('.peo-row').remove();
    renumberPeoRows();
}

/* ── Persistent placeholder for all contenteditable fields ── */
function initPersistentPlaceholder(el) {
    function update() {
        if (el.innerText.trim() === '') {
            el.classList.add('show-placeholder');
        } else {
            el.classList.remove('show-placeholder');
        }
    }
    el.addEventListener('input', update);
    update();
}

function handleBackAction() {
    // 1. Check if the user wants to save
    const confirmSave = confirm("Would you like to save your progress as a draft before leaving?");

    if (confirmSave) {
        saveToSession();
        alert("Progress saved to session!");
    }
    
    // 2. Proceed with going back
    window.history.back();
}

function saveToSession() {
    const draftData = {
        // Collect PEO data from the container [cite: 113]
        peos: Array.from(document.querySelectorAll('#peo-container .peo-row')).map(row => ({
            text: row.querySelector('.peo-editable-text').innerText,
            checks: Array.from(row.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
        })),
        // Collect SO data from the container [cite: 126]
        sos: Array.from(document.querySelectorAll('#so-container .peo-row')).map(row => ({
            text: row.querySelector('.peo-editable-text').innerText,
            checks: Array.from(row.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
        }))
    };

    // Save as a JSON string in session storage
    const key = `syllabus_draft_new_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    sessionStorage.setItem(key, JSON.stringify(draftData));
}

function loadFromServer() {
    if (!window.SERVER_SYLLABUS_DATA) return;
    const { peos, sos } = window.SERVER_SYLLABUS_DATA;

    // Clear the default rows that are in the EJS
    document.querySelectorAll('#peo-container .peo-row').forEach(row => row.remove());
    document.querySelectorAll('#so-container .peo-row').forEach(row => row.remove());

    // Restore PEOs from DB
    if (peos && peos.description && peos.description.length > 0) {
        peos.description.forEach((desc, i) => {
            addPeoRow();
            const lastRow = document.querySelector('#peo-container .peo-row:last-child');
            if (lastRow) {
                lastRow.querySelector('.peo-editable-text').innerText = desc;
                const checks = lastRow.querySelectorAll('input[type="checkbox"]');
                const rating = peos.rating && peos.rating[i] ? peos.rating[i] : '000';
                for (let j = 0; j < 3; j++) {
                    if (checks[j]) checks[j].checked = rating[j] === '1';
                }
            }
        });
    }

    // Restore SOs from DB
    if (sos && sos.description && sos.description.length > 0) {
        sos.description.forEach((desc, i) => {
            addSoRow();
            const lastRow = document.querySelector('#so-container .peo-row:last-child');
            if (lastRow) {
                lastRow.querySelector('.peo-editable-text').innerText = desc;
                const checks = lastRow.querySelectorAll('input[type="checkbox"]');
                const rating = sos.rating && sos.rating[i] ? sos.rating[i] : '000';
                for (let j = 0; j < 3; j++) {
                    if (checks[j]) checks[j].checked = rating[j] === '1';
                }
            }
        });
    }
}

function loadFromSession() {
    const key = `syllabus_draft_new_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedData = sessionStorage.getItem(key);
    if (!savedData) return;

    const data = JSON.parse(savedData);

    // FIX: Instead of .innerHTML = '', only remove existing .peo-row elements
    document.querySelectorAll('#peo-container .peo-row').forEach(row => row.remove());
    document.querySelectorAll('#so-container .peo-row').forEach(row => row.remove());

    // Reconstruct PEOs
    data.peos.forEach(item => {
        addPeoRow(); 
        const lastRow = document.querySelector('#peo-container .peo-row:last-child');
        if (lastRow) {
            lastRow.querySelector('.peo-editable-text').innerText = item.text;
            const checkboxes = lastRow.querySelectorAll('input[type="checkbox"]');
            item.checks.forEach((checked, i) => { if(checkboxes[i]) checkboxes[i].checked = checked; });
        }
    });

    // Reconstruct SOs
    data.sos.forEach(item => {
        addSoRow();
        const lastRow = document.querySelector('#so-container .peo-row:last-child');
        if (lastRow) {
            lastRow.querySelector('.peo-editable-text').innerText = item.text;
            const checkboxes = lastRow.querySelectorAll('input[type="checkbox"]');
            item.checks.forEach((checked, i) => { if(checkboxes[i]) checkboxes[i].checked = checked; });
        }
    });
}

// 1. ADD THIS: Auto-trigger save whenever something changes
document.addEventListener('input', (e) => {
    if (e.target.getAttribute('contenteditable') === 'true' || e.target.type === 'checkbox') {
        autoSaveNewSyllabus();
    }
});

// 2. FIX: Consolidate your load logic so it only runs once and clears defaults first
window.addEventListener('load', () => {
    const key = `syllabus_draft_new_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedSessionData = sessionStorage.getItem(key);
    const hasServerData = window.SERVER_SYLLABUS_DATA && 
                          ( (window.SERVER_SYLLABUS_DATA.peos && window.SERVER_SYLLABUS_DATA.peos.description.length > 0) || 
                            (window.SERVER_SYLLABUS_DATA.sos && window.SERVER_SYLLABUS_DATA.sos.description.length > 0) );

    if (hasServerData && !savedSessionData) {
        loadFromServer();
    } else if (savedSessionData) {
        loadFromSession();
    }
});

document.querySelectorAll('[contenteditable][data-placeholder]').forEach(initPersistentPlaceholder);

// Re-init for dynamically added PEO/SO rows
const peoSoObserver = new MutationObserver(() => {
    document.querySelectorAll('[contenteditable][data-placeholder]').forEach(el => {
        if (!el.dataset.placeholderInit) {
            el.dataset.placeholderInit = '1';
            initPersistentPlaceholder(el);
        }
    });
});
const observeContainers = ['peo-container', 'so-container'];
observeContainers.forEach(id => {
    const container = document.getElementById(id);
    if (container) peoSoObserver.observe(container, { childList: true });
});

/* ── Save Draft and Route to Info ── */
window.saveNewToSession = function() {
    // 1. Validation for PEOs and SOs
    const peoRows = document.querySelectorAll('#peo-container .peo-row');
    const soRows = document.querySelectorAll('#so-container .peo-row');

    if (peoRows.length === 0 || soRows.length === 0) {
        alert("All fields are required.");
        return;
    }

    // Validate PEO content and checkboxes
    for (let i = 0; i < peoRows.length; i++) {
        const text = peoRows[i].querySelector('.peo-editable-text')?.innerText.trim();
        const checks = Array.from(peoRows[i].querySelectorAll('input[type="checkbox"]'));
        if (!text || !checks.some(c => c.checked)) {
            alert("All fields are required.");
            peoRows[i].querySelector('.peo-editable-text').focus();
            return;
        }
    }

    // Validate SO content and checkboxes
    for (let i = 0; i < soRows.length; i++) {
        const text = soRows[i].querySelector('.peo-editable-text')?.innerText.trim();
        const checks = Array.from(soRows[i].querySelectorAll('input[type="checkbox"]'));
        if (!text || !checks.some(c => c.checked)) {
            alert("All fields are required.");
            soRows[i].querySelector('.peo-editable-text').focus();
            return;
        }
    }

    const key = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const payload = JSON.parse(sessionStorage.getItem(key)) || {};
    try {
        // Collect PEOs
        const peoRows = document.querySelectorAll('#peo-container .peo-row');
        payload.programObjectives = Array.from(peoRows).map((row) => {
            return row.querySelector('.peo-text-side .peo-editable-text')?.innerText.trim() || '';
        });
        payload.programObjectivesRating = Array.from(peoRows).map((row) => {
            const checkboxes = row.querySelectorAll('.peo-checkbox-side input[type="checkbox"]');
            return Array.from(checkboxes).map(cb => cb.checked ? '1' : '0').join(''); 
        });

        // Collect SOs
        const soRows = document.querySelectorAll('#so-container .peo-row');
        payload.studentObjectives = Array.from(soRows).map((row) => {
            return row.querySelector('.peo-text-side .peo-editable-text')?.innerText.trim() || '';
        });
        payload.studentObjectivesRating = Array.from(soRows).map((row) => {
            const checkboxes = row.querySelectorAll('.peo-checkbox-side input[type="checkbox"]');
            return Array.from(checkboxes).map(cb => cb.checked ? '1' : '0').join(''); 
        });
        
        // Pass the Syllabus ID payload context along natively
        payload.syllabusId = window.CURRENT_SYLLABUS_ID;

        // Save to session
        const saveKey = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
        sessionStorage.setItem(saveKey, JSON.stringify(payload));
        
        // Proceed to info
        if (window.CURRENT_SYLLABUS_ID) {
            window.location.href = `/syllabus/info/${window.CURRENT_SYLLABUS_ID}`;
        } else {
            console.error("Missing syllabus ID");
            alert("Error: Course ID is missing.");
        }
    } catch (e) {
        console.error("Error saving new step data:", e);
        alert("There was an error saving your data.");
    }
};
