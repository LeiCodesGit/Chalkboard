function autoSaveInfo() {
    // Helper to get text by row and item index for the grid
    const getGridText = (rowIdx, itemIdx) => {
        return document.querySelectorAll('.info-row')[rowIdx]
            ?.querySelectorAll('.course-editable-text')[itemIdx]?.innerText.trim() || "";
    };

    const infoData = {
        // Basic Info Grid
        courseCode: document.querySelector('.info-item.small .course-editable-text')?.innerText.trim() || "",
        courseTitle: document.querySelector('.info-item.large .course-editable-text')?.innerText.trim() || "",
        ayTerm: document.getElementById('ay-term-field')?.innerText.trim() || "",
        preRequisite: getGridText(1, 0),
        coRequisite: getGridText(1, 1),
        creditUnits: getGridText(1, 2),
        classSchedule: getGridText(2, 0),
        courseDesign: getGridText(2, 1),

        // Text Areas
        courseDescription: document.querySelector('.multiline[data-placeholder*="course description"]')?.innerText.trim() || "",
        textbook: document.querySelector('.multiline[data-placeholder*="textbook"]')?.innerText.trim() || "",
        references: document.querySelector('.multiline[data-placeholder*="references"]')?.innerText.trim() || "",

        // Course Outcomes Statement Grid (The CO1, CO2 list)
        outcomesGrid: Array.from(document.querySelectorAll('#outcomes-container .outcomes-row')).map(row => ({
            statement: row.querySelector('.outcomes-statement .outcomes-editable-text')?.innerText.trim() || "",
            skills: row.querySelector('.outcomes-skills-side .outcomes-editable-text')?.innerText.trim() || ""
        })),

        // Mapping Table (I, E, D dropdowns)
        mappingValues: Array.from(document.querySelectorAll('#mapping-body tr')).map(row => {
            return Array.from(row.querySelectorAll('.custom-dropdown-trigger')).map(trigger => {
                return trigger.dataset.value || ""; // Captures the internal 'I', 'E', or 'D' value
            });
        }),

        // Editor Table (The one with the toolbar)
        editorRows: Array.from(document.querySelectorAll('#outcomes-editor-body tr')).map(row => {
            return Array.from(row.querySelectorAll('.editable-cell')).map(cell => cell.innerHTML);
        }),

        // Concept Map
        conceptMap: document.getElementById('concept-map-preview')?.src || ""
    };

    const key = `syllabus_draft_info_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    sessionStorage.setItem(key, JSON.stringify(infoData));
}



function handleInfoBack() {
    autoSaveInfo();
    setTimeout(() => { window.history.back(); }, 100);
}

function handleInfoNext() {
    // 1. Basic Fields Validation
    const courseCode = document.querySelector('.info-item.small .course-editable-text')?.innerText.trim();
    const courseTitle = document.querySelector('.info-item.large .course-editable-text')?.innerText.trim();
    const ayTerm = document.getElementById('ay-term-field')?.innerText.trim();
    const courseDescription = document.querySelector('.multiline[data-placeholder*="course description"]')?.innerText.trim();
    const creditUnits = document.querySelector('.info-row:nth-child(2) .info-item:nth-child(3) .course-editable-text')?.innerText.trim();
    const textbook = document.querySelector('.multiline[data-placeholder*="textbook"]')?.innerText.trim();
    const references = document.querySelector('.multiline[data-placeholder*="references"]')?.innerText.trim();

    if (!courseCode || !courseTitle || !ayTerm || !courseDescription || !creditUnits || !textbook || !references) {
        alert("All fields are required.");
        return;
    }

    // 2. Outcomes (CO) Validation
    const coRows = document.querySelectorAll('#outcomes-container .outcomes-row');
    if (coRows.length === 0) {
        alert("All fields are required.");
        return;
    }
    
    for (let i = 0; i < coRows.length; i++) {
        const statement = coRows[i].querySelector('.outcomes-statement .outcomes-editable-text')?.innerText.trim();
        if (!statement) {
            alert("All fields are required.");
            coRows[i].querySelector('.outcomes-statement .outcomes-editable-text').focus();
            return;
        }
    }

    // 3. Mapping Validation (At least one alignment per CO) [cite: 173]
    const mappingRows = document.querySelectorAll('#mapping-body tr');
    for (let i = 0; i < mappingRows.length; i++) {
        const triggers = mappingRows[i].querySelectorAll('.custom-dropdown-trigger');
        const hasAssignment = Array.from(triggers).some(t => t.dataset.value && t.dataset.value !== 'none');
        if (!hasAssignment) {
            alert("All fields are required.");
            return;
        }
    }

    // 4. Concept Map Validation (Optional but recommended to remind)
    const conceptMapImg = document.getElementById('concept-map-preview')?.src;
    if (!conceptMapImg || conceptMapImg.endsWith('undefined') || conceptMapImg === window.location.href) {
        if (!confirm("No Concept Map has been attached. Do you want to proceed anyway?")) {
            return;
        }
    }

    // 5. Force Save to Draft
    saveInfoToSession();
}

function loadInfoFromSession() {
    const key = `syllabus_draft_info_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedData = sessionStorage.getItem(key);
    if (!savedData) return;
    const data = JSON.parse(savedData);

    const setGridText = (rowIdx, itemIdx, val) => {
        const el = document.querySelectorAll('.info-row')[rowIdx]?.querySelectorAll('.course-editable-text')[itemIdx];
        if (el && val) el.innerText = val;
    };

    // 1. Restore Grid & Multilines
    document.querySelector('.info-item.small .course-editable-text').innerText = data.courseCode || "";
    document.querySelector('.info-item.large .course-editable-text').innerText = data.courseTitle || "";
    const ayTermEl = document.getElementById('ay-term-field');
    if (ayTermEl) ayTermEl.innerText = data.ayTerm || "";

    setGridText(1, 0, data.preRequisite);
    setGridText(1, 1, data.coRequisite);
    setGridText(1, 2, data.creditUnits);
    setGridText(2, 0, data.classSchedule);
    setGridText(2, 1, data.courseDesign);
    
    const desc = document.querySelector('.multiline[data-placeholder*="course description"]');
    if (desc) desc.innerText = data.courseDescription || "";
    const txt = document.querySelector('.multiline[data-placeholder*="textbook"]');
    if (txt) txt.innerText = data.textbook || "";
    const ref = document.querySelector('.multiline[data-placeholder*="references"]');
    if (ref) ref.innerText = data.references || "";

    // 2. Restore Outcomes Editor & Mapping Table (Order is critical!)
    const editorBody = document.getElementById('outcomes-editor-body');
    if (editorBody && data.editorRows) {
        editorBody.innerHTML = ''; // Clear default rows [cite: 94]
        data.editorRows.forEach(rowCells => {
            addEditorRow(); // This also triggers syncMappingRows()
            const lastRow = editorBody.lastElementChild;
            const targetCells = lastRow.querySelectorAll('.editable-cell');
            rowCells.forEach((html, i) => { if(targetCells[i]) targetCells[i].innerHTML = html; });
        });
    }

    // 3. Restore Mapping Dropdowns
    const mappingRows = document.querySelectorAll('#mapping-body tr');
    if (data.mappingValues) {
        data.mappingValues.forEach((rowValues, rowIndex) => {
            if (mappingRows[rowIndex]) {
                const triggers = mappingRows[rowIndex].querySelectorAll('.custom-dropdown-trigger');
                rowValues.forEach((val, colIndex) => {
                    if (triggers[colIndex] && val && val !== 'none') {
                        triggers[colIndex].dataset.value = val;
                        triggers[colIndex].textContent = val;
                    }
                });
            }
        });
    }

    // 4. Restore Outcomes Grid
    const outcomesContainer = document.getElementById('outcomes-container');
    if (outcomesContainer && data.outcomesGrid) {
        document.querySelectorAll('#outcomes-container .outcomes-row').forEach(r => r.remove());
        data.outcomesGrid.forEach(item => {
            addCoRow();
            const lastRow = outcomesContainer.lastElementChild;
            if (lastRow) {
                lastRow.querySelector('.outcomes-statement .outcomes-editable-text').innerText = item.statement;
                lastRow.querySelector('.outcomes-skills-side .outcomes-editable-text').innerText = item.skills;
            }
        });
    }

    // 5. Restore Concept Map
    if (data.conceptMap && data.conceptMap !== "" && !data.conceptMap.endsWith('undefined')) {
        const wrapper = document.getElementById('concept-map-wrapper');
        const preview = document.getElementById('concept-map-preview');
        if (wrapper && preview) {
            preview.src = data.conceptMap;
            wrapper.style.display = 'block';
        }
    }

    // 6. Cleanup Placeholders
    refreshPlaceholders();
}

// Force placeholders to update based on current text content
    document.querySelectorAll('[contenteditable][data-placeholder]').forEach(el => {
        if (el.innerText.trim() !== '') {
            el.classList.remove('show-placeholder');
        } else {
            el.classList.add('show-placeholder');
        }
    });

function loadInfoFromServer() {
    if (!window.SERVER_SYLLABUS_DATA) return;
    const { outcomes, mapping, syl } = window.SERVER_SYLLABUS_DATA;

    // 1. Basic Info from the Syllabus document
    if (syl) {
        const courseCodeEl = document.querySelector('.info-item.small .course-editable-text');
        const courseTitleEl = document.querySelector('.info-item.large .course-editable-text');
        if (courseCodeEl && syl.courseCode && !courseCodeEl.innerText.trim()) courseCodeEl.innerText = syl.courseCode;
        if (courseTitleEl && syl.courseTitle && !courseTitleEl.innerText.trim()) courseTitleEl.innerText = syl.courseTitle;

        const ayTermEl = document.getElementById('ay-term-field');
        if (ayTermEl && (syl.academicYear || syl.schoolYear || syl.term) && !ayTermEl.innerText.trim()) {
            ayTermEl.innerText = `${syl.academicYear || syl.schoolYear || ''} / ${syl.term || ''}`;
        }

        // Also fill other basic info fields if available
        const setGridText = (rowIdx, itemIdx, val) => {
            const el = document.querySelectorAll('.info-row')[rowIdx]?.querySelectorAll('.course-editable-text')[itemIdx];
            if (el && val && !el.innerText.trim()) el.innerText = val;
        };
        setGridText(1, 0, syl.preRequisite);
        setGridText(1, 1, syl.coRequisite);
        setGridText(1, 2, syl.creditUnits);
        setGridText(2, 0, syl.classSchedule);
        setGridText(2, 1, syl.courseDesign);

        const desc = document.querySelector('.multiline[data-placeholder*="course description"]');
        if (desc && syl.courseDescription && !desc.innerText.trim()) desc.innerText = syl.courseDescription;
        const txt = document.querySelector('.multiline[data-placeholder*="textbook"]');
        if (txt && syl.textbook && !txt.innerText.trim()) txt.innerText = syl.textbook;
        const ref = document.querySelector('.multiline[data-placeholder*="references"]');
        if (ref && syl.references && !ref.innerText.trim()) ref.innerText = syl.references;
    }

    refreshPlaceholders();

    // 2. Course Outcomes Grid (Simple list)
    const outcomesContainer = document.getElementById('outcomes-container');
    if (outcomesContainer && outcomes && outcomes.length > 0) {
        document.querySelectorAll('#outcomes-container .outcomes-row').forEach(r => r.remove());
        outcomes.forEach((item, i) => {
            addCoRow();
            const lastRow = outcomesContainer.lastElementChild;
            if (lastRow) {
                lastRow.querySelector('.outcomes-statement .outcomes-editable-text').innerText = (item.description && item.description[0]) || "";
                lastRow.querySelector('.outcomes-skills-side .outcomes-editable-text').innerText = (item.thinkingSkills && item.thinkingSkills[0]) || "";
            }
        });
    }

    // 3. Outcomes Editor Table
    const editorBody = document.getElementById('outcomes-editor-body');
    if (editorBody && outcomes && outcomes.length > 0) {
        editorBody.innerHTML = '';
        outcomes.forEach(item => {
            addEditorRow();
            const lastRow = editorBody.lastElementChild;
            const cells = lastRow.querySelectorAll('.editable-cell');
            if (cells.length >= 3) {
                cells[0].innerText = item.coNumber || "";
                cells[1].innerText = (item.description && item.description[0]) || "";
                cells[2].innerText = (item.thinkingSkills && item.thinkingSkills[0]) || "";
            }
        });
    }

    // 4. Mapping Table
    const mappingBody = document.getElementById('mapping-body');
    if (mappingBody && mapping && mapping.length > 0) {
        // mapping is an array of documents, each for one CO
        const mappingRows = mappingBody.querySelectorAll('tr');
        mapping.forEach((item, rowIndex) => {
            if (mappingRows[rowIndex]) {
                const triggers = mappingRows[rowIndex].querySelectorAll('.custom-dropdown-trigger');
                const values = item.fromAtoL || [];
                values.forEach((val, colIndex) => {
                    if (triggers[colIndex] && val && val !== 'none') {
                        triggers[colIndex].dataset.value = val;
                        triggers[colIndex].textContent = val;
                    }
                });
            }
        });
    }

    // 5. Concept Map from server
    if (syl && syl.conceptMap) {
        const wrapper = document.getElementById('concept-map-wrapper');
        const preview = document.getElementById('concept-map-preview');
        if (wrapper && preview) {
            preview.src = syl.conceptMap;
            wrapper.style.display = 'block';
        }
    }

    refreshPlaceholders();
}

function refreshPlaceholders() {
    document.querySelectorAll('[contenteditable][data-placeholder]').forEach(el => {
        if (el.innerText.trim() !== '') {
            el.classList.remove('show-placeholder');
        } else {
            el.classList.add('show-placeholder');
        }
    });
}


/* ── Renumber all CO rows after add/delete ── */
function renumberCoRows() {
  const container = document.getElementById('outcomes-container');
  const rows = container.getElementsByClassName('outcomes-row');
  Array.from(rows).forEach((row, i) => {
    row.querySelector('.outcomes-number').textContent = `CO${i + 1}.`;
  });
}

function addCoRow() {
  const container = document.getElementById('outcomes-container');
  const rowCount = container.getElementsByClassName('outcomes-row').length + 1;

  const newRow = document.createElement('div');
  newRow.className = 'outcomes-row';
  newRow.innerHTML = `
    <div class="outcomes-statement">
      <span class="outcomes-number">CO${rowCount}.</span>
      <div class="outcomes-editable-text" contenteditable="true" data-placeholder="Edit text"></div>
    </div>
    <div class="outcomes-skills-side">
      <div class="outcomes-editable-text" contenteditable="true" data-placeholder="e.g. Creating"></div>
    </div>
    <button class="btn-delete-row" onclick="deleteCoRow(this)" title="Delete row">
      <span class="material-symbols-outlined">remove</span>
    </button>
  `;
  container.appendChild(newRow);
  syncMappingRows();
}

function deleteCoRow(btn) {
  btn.closest('.outcomes-row').remove();
  renumberCoRows();
  syncMappingRows();
}

document.querySelectorAll('.course-info-container .course-editable-text').forEach(box => {
  // Prevent Enter key (stay single-line) only if NOT multiline
  box.addEventListener('keydown', function (e) {
    if (this.classList.contains('multiline')) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    // Allow control/navigation keys
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey) {
      return;
    }
    // Measure if adding one more character would overflow
    const testSpan = document.createElement('span');
    testSpan.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font:' + window.getComputedStyle(this).font;
    testSpan.textContent = (this.innerText || '') + e.key;
    document.body.appendChild(testSpan);
    const wouldOverflow = testSpan.offsetWidth > this.clientWidth - 15;
    document.body.removeChild(testSpan);
    if (wouldOverflow) e.preventDefault();
  });

  // Prevent pasting text that would overflow only if NOT multiline
  box.addEventListener('paste', function (e) {
    if (this.classList.contains('multiline')) return;

    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[\r\n]+/g, ' ');
    const testSpan = document.createElement('span');
    testSpan.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font:' + window.getComputedStyle(this).font;
    testSpan.textContent = (this.innerText || '') + text;
    document.body.appendChild(testSpan);
    if (testSpan.offsetWidth <= this.clientWidth - 15) {
      document.execCommand('insertText', false, text);
    }
    document.body.removeChild(testSpan);
  });
});

/* Course Mapping */
const tableBody = document.getElementById('mapping-body');

const dropdownOptions = [
  { value: 'none', label: 'None' },
  { value: 'I', label: 'I - Introductory' },
  { value: 'E', label: 'E - Enabling' },
  { value: 'D', label: 'D - Demonstrative' },
];


function createCustomDropdown() {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-dropdown';

  const trigger = document.createElement('div');
  trigger.className = 'custom-dropdown-trigger';
  trigger.setAttribute('tabindex', '0');
  trigger.dataset.value = '';

  const panel = document.createElement('div');
  panel.className = 'custom-dropdown-panel';

  dropdownOptions.forEach(opt => {
    if (opt.value === '') return; // skip blank placeholder in panel
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = opt.value;
    item.textContent = opt.label;

    item.addEventListener('click', function (e) {
      e.stopPropagation();
      // 'none' clears the cell display
      trigger.textContent = opt.value === 'none' ? '' : opt.value;
      trigger.dataset.value = opt.value === 'none' ? '' : opt.value;
      closeDropdown(wrapper);
    });

    panel.appendChild(item);
  });

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');
    // Close all other dropdowns first
    document.querySelectorAll('.custom-dropdown.open').forEach(d => closeDropdown(d));
    if (!isOpen) openDropdown(wrapper);
  });

  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger.click();
    } else if (e.key === 'Escape') {
      closeDropdown(wrapper);
    }
  });
  
  
  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);
  return wrapper;
  
  
}

function openDropdown(wrapper) {
  wrapper.classList.add('open');
  const panel = wrapper.querySelector('.custom-dropdown-panel');
  panel.style.display = 'block';
  // Force reflow for animation
  panel.getBoundingClientRect();
  panel.classList.add('visible');
}

function closeDropdown(wrapper) {
  wrapper.classList.remove('open');
  const panel = wrapper.querySelector('.custom-dropdown-panel');
  panel.classList.remove('visible');
  // Wait for transition to finish before hiding
  panel.addEventListener('transitionend', function handler() {
    if (!wrapper.classList.contains('open')) {
      panel.style.display = 'none';
    }
    panel.removeEventListener('transitionend', handler);
  });
}

// Close dropdowns when clicking outside
document.addEventListener('click', function () {
  document.querySelectorAll('.custom-dropdown.open').forEach(d => closeDropdown(d));
});

/* ── Auto-generate mapping rows based on CO outcomes ── */
function buildMappingRow(index, totalRows) {
  const row = document.createElement('tr');
  row.dataset.coIndex = index;

  const coTd = document.createElement('td');
  coTd.textContent = `CO${index}`;
  row.appendChild(coTd);

  if (index === 1) {
    const progTd = document.createElement('td');
    progTd.rowSpan = totalRows;
    progTd.id = 'mapping-program-cell';
    progTd.textContent = 'Engineering Program';
    row.appendChild(progTd);
  }

  for (let j = 0; j < 12; j++) {
    const td = document.createElement('td');
    td.style.position = 'relative';
    td.appendChild(createCustomDropdown());
    row.appendChild(td);
  }

  return row;
}

function syncMappingRows() {
  const container = document.getElementById('outcomes-container');
  if (!container) return;
  const total = container.querySelectorAll('.outcomes-row').length;
  
  const mappingBody = document.getElementById('mapping-body');
  if (!mappingBody) return;

  // Preserve existing selections before wiping to avoid data loss
  const existingValues = {};
  mappingBody.querySelectorAll('tr').forEach(tr => {
      const coIndex = tr.dataset.coIndex;
      const triggers = tr.querySelectorAll('.custom-dropdown-trigger');
      const rowValues = Array.from(triggers).map(t => t.dataset.value || '');
      existingValues[coIndex] = rowValues;
  });

  // Clear existing mapping rows
  mappingBody.innerHTML = '';

  for (let i = 1; i <= total; i++) {
    const row = buildMappingRow(i, total);
    // Restore values if they existed
    if (existingValues[i]) {
        const triggers = row.querySelectorAll('.custom-dropdown-trigger');
        existingValues[i].forEach((val, colIdx) => {
            if (triggers[colIdx] && val && val !== 'none') {
                triggers[colIdx].dataset.value = val;
                triggers[colIdx].textContent = val;
            }
        });
    }
    mappingBody.appendChild(row);
  }

  // Update the program cell rowspan if it exists
  const progCell = document.getElementById('mapping-program-cell');
  if (progCell) progCell.rowSpan = total;
}

// Initial render — based on existing CO rows in the DOM
syncMappingRows();

/* ── Persistent placeholder for all contenteditable fields ── */
function initPersistentPlaceholder(el) {
  function update() {
    if (el.innerText.trim() === '') {
      el.classList.add('show-placeholder');
    } else {
      el.classList.remove('show-placeholder');
    }
  }
  // Hide CSS :empty::before so our class takes over
  el.addEventListener('input', update);
  update(); // run once on page load
}

document.querySelectorAll('[contenteditable][data-placeholder]').forEach(initPersistentPlaceholder);

// Re-init for dynamically added rows
const outcomesMutationObserver = new MutationObserver(() => {
  document.querySelectorAll('[contenteditable][data-placeholder]').forEach(el => {
    if (!el.dataset.placeholderInit) {
      el.dataset.placeholderInit = '1';
      initPersistentPlaceholder(el);
    }
  });
});
outcomesMutationObserver.observe(document.getElementById('outcomes-container'), { childList: true, subtree: true });

/* ── Concept Map image preview ── */
function previewConceptMap(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
      const wrapper = document.getElementById('concept-map-wrapper');
      const preview = document.getElementById('concept-map-preview');
      if (wrapper && preview) {
          preview.src = e.target.result;
          wrapper.style.display = 'block';
          autoSaveInfo(); // Trigger auto-save immediately on upload
      }
  };
  reader.readAsDataURL(file);
}

function deleteConceptMap() {
  const wrapper = document.getElementById('concept-map-wrapper');
  const preview = document.getElementById('concept-map-preview');
  const input = document.getElementById('concept-map-input');
  preview.src = '';
  input.value = '';
  wrapper.style.display = 'none';
}

/* ── Course Outcomes Editor Table Logic ── */

let isSelecting = false;
let startCell = null;
let currentRange = { minR: -1, maxR: -1, minC: -1, maxC: -1 };

function execCmd(command) {
  // Focus the first cell in selection if exists
  const body = document.getElementById('outcomes-editor-body');
  if (body) {
    const first = body.querySelector('tr td.highlighted-cell .editable-cell');
    if (first) first.focus();
  }
  document.execCommand(command, false, null);
}

function renumberEditorRows() {
  const body = document.getElementById('outcomes-editor-body');
  if (!body) return;
  const rows = body.querySelectorAll('tr');
  rows.forEach((tr, i) => {
    tr.dataset.rowIndex = i.toString();
    const tds = tr.querySelectorAll('td');
    tds.forEach((td, j) => {
      td.dataset.colIndex = j.toString();
      
      // Ensure listeners are attached (for static/re-indexed rows)
      if (!td.dataset.listenersInit) {
        td.dataset.listenersInit = '1';
        td.addEventListener('mousedown', (e) => {
          isSelecting = true;
          const box = document.getElementById('table-selection-box');
          if (box) box.classList.add('dragging');
          startCell = td;
          updateRange(td, td);
        });
        td.addEventListener('mouseenter', (e) => {
          if (isSelecting) extendSelection(td);
        });
      }
    });
  });
}

function addEditorRow() {
  const body = document.getElementById('outcomes-editor-body');
  if (!body) return;
  const tr = document.createElement('tr');

  for (let i = 0; i < 3; i++) {
    const td = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'editable-cell';
    div.contentEditable = 'true';
    if (i === 0) {
      div.classList.add('co-cell');
      div.dataset.placeholder = 'e.g. CO1';
      initPersistentPlaceholder(div);
    }
    td.appendChild(div);
    tr.appendChild(td);
  }

  body.appendChild(tr);
  renumberEditorRows();
  syncMappingRows();
}

// Ensure dragging class is removed
document.addEventListener('mouseup', () => {
  isSelecting = false;
  const box = document.getElementById('table-selection-box');
  if (box) box.classList.remove('dragging');
});

function deleteEditorRow() {
  // Deletes rows intersecting with the current selection range
  if (currentRange.minR === -1) return;
  const body = document.getElementById('outcomes-editor-body');
  const rows = Array.from(body.querySelectorAll('tr'));

  // Rows to remove
  for (let i = currentRange.maxR; i >= currentRange.minR; i--) {
    if (rows[i]) rows[i].remove();
  }

  hideSelectionBox();
  renderSelection();
  renumberEditorRows();
  syncMappingRows();
}

function startSelection(td) {
  isSelecting = true;
  startCell = td;
  updateRange(td, td);
}

function extendSelection(td) {
  if (!isSelecting) return;
  updateRange(startCell, td);
}

function updateRange(c1, c2) {
  if (!c1 || !c2) return;
  startCell = c1;
  const r1 = parseInt(c1.closest('tr').dataset.rowIndex);
  const r2 = parseInt(c2.closest('tr').dataset.rowIndex);
  const col1 = parseInt(c1.dataset.colIndex);
  const col2 = parseInt(c2.dataset.colIndex);

  currentRange = {
    minR: Math.min(r1, r2),
    maxR: Math.max(r1, r2),
    minC: Math.min(col1, col2),
    maxC: Math.max(col1, col2)
  };

  renderSelection();
}

function renderSelection() {
  const body = document.getElementById('outcomes-editor-body');
  const container = document.querySelector('.outcomes-table-container');
  if (!body || !container || currentRange.minR === -1) return;

  const rows = body.querySelectorAll('tr');

  // Clear old highlights
  body.querySelectorAll('td.highlighted-cell').forEach(td => td.classList.remove('highlighted-cell'));
  document.querySelectorAll('.index-cell.selected').forEach(cell => cell.classList.remove('selected'));

  let minTop = Infinity, minLeft = Infinity, maxBottom = 0, maxRight = 0;
  let found = false;

  rows.forEach((tr, r) => {
    if (r >= currentRange.minR && r <= currentRange.maxR) {
      const tds = tr.querySelectorAll('td');
      tds.forEach((td, c) => {
        if (c >= currentRange.minC && c <= currentRange.maxC) {
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
  if (found) {
    box.style.display = 'block';
    box.style.top = (minTop - 1) + 'px'; // Sub-pixel nudge for alignment
    box.style.left = (minLeft - 1) + 'px';
    box.style.width = (maxRight - minLeft + 2) + 'px';
    box.style.height = (maxBottom - minTop + 2) + 'px';
  } else {
    box.style.display = 'none';
  }
}

function hideSelectionBox() {
  document.getElementById('table-selection-box').style.display = 'none';
  currentRange = { minR: -1, maxR: -1, minC: -1, maxC: -1 };
}

document.addEventListener('mouseup', () => {
  isSelecting = false;
});

// Initial Rows
document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('outcomes-editor-body');
  if (body && body.querySelectorAll('tr').length === 0) {
    addEditorRow();
  }
});

function toggleMerge() {
  if (currentRange.minR === -1 || currentRange.maxR === -1) {
    alert('Please select a range of cells to merge.');
    return;
  }

  const body = document.getElementById('outcomes-editor-body');
  const rows = body.querySelectorAll('tr');

  // Check if we are UNMERGING
  let isUnmerging = false;
  let targetCell = null;

  for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
    const tr = rows[r];
    if (!tr) continue;
    const tds = tr.querySelectorAll('td');
    for (let c = currentRange.minC; c <= currentRange.maxC; c++) {
      const td = tds[c];
      if (td && (td.rowSpan > 1 || td.colSpan > 1)) {
        isUnmerging = true;
        targetCell = td;
        break;
      }
    }
    if (isUnmerging) break;
  }

  if (isUnmerging && targetCell) {
    // --- UNMERGE LOGIC ---
    const firstR = parseInt(targetCell.closest('tr').dataset.rowIndex);
    const firstC = parseInt(targetCell.dataset.colIndex);
    const rs = targetCell.rowSpan;
    const cs = targetCell.colSpan;

    for (let r = firstR; r < firstR + rs; r++) {
      const tr = rows[r];
      const tds = tr.querySelectorAll('td');
      for (let c = firstC; c < firstC + cs; c++) {
        const td = tds[c];
        if (td) {
          td.style.display = ''; // Restore visibility
          td.rowSpan = 1;
          td.colSpan = 1;
        }
      }
    }
  } else {
    // --- MERGE LOGIC ---
    let combinedHTML = '';
    const colSpan = currentRange.maxC - currentRange.minC + 1;
    const rowSpan = currentRange.maxR - currentRange.minR + 1;

    rows.forEach((tr, r) => {
      const rowIndex = parseInt(tr.dataset.rowIndex);
      if (rowIndex >= currentRange.minR && rowIndex <= currentRange.maxR) {
        const tds = tr.querySelectorAll('td');
        tds.forEach(td => {
          const colIndex = parseInt(td.dataset.colIndex);
          if (colIndex >= currentRange.minC && colIndex <= currentRange.maxC) {
            if (td.style.display === 'none') return;

            const div = td.querySelector('.editable-cell');
            if (rowIndex === currentRange.minR && colIndex === currentRange.minC) {
              targetCell = td;
              combinedHTML = div.innerHTML;
            } else {
              if (div.innerText.trim() !== '') {
                combinedHTML += '<br>' + div.innerHTML;
              }
              td.style.display = 'none';
            }
          }
        });
      }
    });

    if (targetCell) {
      targetCell.rowSpan = rowSpan;
      targetCell.colSpan = colSpan;
      targetCell.querySelector('.editable-cell').innerHTML = combinedHTML;
      targetCell.style.display = '';
    }
  }

  renderSelection();
  renumberEditorRows(); // Re-sync coordinates
}

// Color Picker Logic (Excel Style)
let activeFillColor = '#FFFF00'; // Default Yellow

const THEME_COLORS = [
  '#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47',
  '#f2f2f2', '#7f7f7f', '#d0cece', '#d6dce4', '#d9e1f2', '#fbe4d5', '#ededed', '#fff2cc', '#deeaf6', '#e2efda',
  '#d8d8d8', '#595959', '#afabab', '#acb9ca', '#b4c6e7', '#f7caac', '#dbdbdb', '#fee599', '#bdd7ee', '#c6e0b4',
  '#bfbfbf', '#3f3f3f', '#767171', '#8496b0', '#8ea9db', '#f4b084', '#c9c9c9', '#ffd966', '#9bc2e6', '#a9d08e',
  '#a5a5a5', '#262626', '#3b3838', '#323e4f', '#2f5597', '#c65911', '#aeaeae', '#bf8f00', '#2e75b6', '#548235',
  '#7b7b7b', '#0d0d0d', '#262626', '#222b35', '#1f3763', '#833c0c', '#757575', '#7f6000', '#1f4e78', '#375623'
];

const STANDARD_COLORS = [
  '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'
];

function initColorPalette() {
  const themeGrid = document.getElementById('theme-colors-grid');
  const standardGrid = document.getElementById('standard-colors-grid');
  if (!themeGrid || !standardGrid) return;

  THEME_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = color;
    swatch.onclick = () => selectPaletteColor(color);
    themeGrid.appendChild(swatch);
  });

  STANDARD_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = color;
    swatch.onclick = () => selectPaletteColor(color);
    standardGrid.appendChild(swatch);
  });
}

function toggleColorPalette(event) {
  event.stopPropagation();
  const menu = document.getElementById('color-palette-menu');
  const isActive = menu.classList.contains('active');

  // Close all other dropdowns
  document.querySelectorAll('.color-palette-menu.active').forEach(m => m.classList.remove('active'));

  if (!isActive) {
    menu.classList.add('active');
  }
}

function selectPaletteColor(color) {
  activeFillColor = color;
  updateActiveColorBar();
  applyActiveColor();
  document.getElementById('color-palette-menu').classList.remove('active');
}

function updateActiveColorBar() {
  const bar = document.getElementById('active-color-bar');
  if (bar) {
    bar.style.backgroundColor = activeFillColor === 'transparent' ? '#ccc' : activeFillColor;
  }
}

function applyActiveColor() {
  if (currentRange.minR === -1) return;
  const body = document.getElementById('outcomes-editor-body');
  const rows = body.querySelectorAll('tr');
  for (let r = currentRange.minR; r <= currentRange.maxR; r++) {
    const tr = rows[r];
    if (!tr) continue;
    const tds = tr.querySelectorAll('td');
    for (let c = currentRange.minC; c <= currentRange.maxC; c++) {
      const td = tds[c];
      if (!td || td.style.display === 'none') continue;
      td.style.setProperty('background-color', activeFillColor, 'important');
    }
  }
  renderSelection();
}

// Close color palette when clicking outside
document.addEventListener('click', () => {
  const menu = document.getElementById('color-palette-menu');
  if (menu) menu.classList.remove('active');
});

function toggleWrap() {
  const body = document.getElementById('outcomes-editor-body');
  const highlighted = body.querySelectorAll('td.highlighted-cell .editable-cell');
  highlighted.forEach(div => {
    const isWrapped = div.style.whiteSpace === 'normal';
    div.style.whiteSpace = isWrapped ? 'nowrap' : 'normal';
  });
}



window.onload = () => {
    // 1. Load data
    const key = `syllabus_draft_info_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const savedSessionData = sessionStorage.getItem(key);
    const hasServerData = window.SERVER_SYLLABUS_DATA && 
                          window.SERVER_SYLLABUS_DATA.syl && 
                          Object.keys(window.SERVER_SYLLABUS_DATA.syl).length > 5;

    if (hasServerData && !savedSessionData) {
        // If we have data from database and nothing in session, load from server
        loadInfoFromServer();
    } else if (savedSessionData) {
        // If session draft exists, prioritize it (user's most recent unsaved work)
        loadInfoFromSession();
    } else {
        // Default: Initialize with some empty rows if both are absent
        const body = document.getElementById('outcomes-editor-body');
        if (body && body.querySelectorAll('tr').length === 0) {
            addEditorRow();
        }
    }

    // 2. Re-init the placeholder observers for any new rows
    document.querySelectorAll('[contenteditable][data-placeholder]').forEach(el => {
        if (!el.dataset.placeholderInit) {
            el.dataset.placeholderInit = '1';
            initPersistentPlaceholder(el);
        }
    });
};

window.addEventListener('load', () => {
    // Load server data first (course code, title, outcomes, mapping, etc.)
    loadInfoFromServer();

    // Then overlay any session draft data on top (user edits in progress)
    loadInfoFromSession();

    // Then start watching for changes anywhere on the document
    document.addEventListener('input', (e) => {
        if (e.target.closest('[contenteditable="true"]')) {
            autoSaveInfo();
        }
    });
});

/* ── Form Submission Helper ── */
window.saveInfoToSession = function() {
    const key = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
    const payload = JSON.parse(sessionStorage.getItem(key)) || {};

    try {
        // Helper to get text by row and item index for the grid
        const getGridText = (rowIdx, itemIdx) => {
            return document.querySelectorAll('.info-row')[rowIdx]
                ?.querySelectorAll('.course-editable-text')[itemIdx]?.innerText.trim() || "";
        };

        const ayTermStr = document.getElementById('ay-term-field')?.innerText.trim() || '';
        let termStr = '';
        let schoolYearStr = '';
        if (ayTermStr && ayTermStr.includes('/')) {
            const parts = ayTermStr.split('/');
            schoolYearStr = parts[0].trim();
            termStr = parts[1].trim();
        } else {
            schoolYearStr = ayTermStr;
        }

        payload.basicInfo = {
            courseCode: document.querySelector('.info-item.small .course-editable-text')?.innerText.trim() || '',
            courseTitle: document.querySelector('.info-item.large .course-editable-text')?.innerText.trim() || '',
            preRequisite: getGridText(1, 0),
            coRequisite: getGridText(1, 1),
            units: getGridText(1, 2),
            classSchedule: getGridText(2, 0),
            courseDesign: getGridText(2, 1),
            courseDescription: document.querySelector('.multiline[data-placeholder*="course description"]')?.innerText.trim() || '',
            textbook: document.querySelector('.multiline[data-placeholder*="textbook"]')?.innerText.trim() || '',
            references: document.querySelector('.multiline[data-placeholder*="references"]')?.innerText.trim() || '',
            term: termStr,
            schoolYear: schoolYearStr
        };

        // 2. Program Educational Objectives (PEOs)
        // (Handled by newSyllabus.js previously, preserved since we parse existing draft)

        // 3. Course Outcomes (COs) Main List
        const coRows = document.querySelectorAll('.outcomes-row');
        payload.courseOutcomesList = Array.from(coRows).map((row, index) => {
            const text = row.querySelector('.outcomes-statement .outcomes-editable-text')?.innerText.trim() || '';
            const skills = row.querySelector('.outcomes-skills-side .outcomes-editable-text')?.innerText.trim() || '';
            return {
                coNumber: `CO${index + 1}`,
                text,
                skills
            };
        });

        // 4. Course Mapping Table
        const mappingRows = document.querySelectorAll('#mapping-body tr');
        payload.courseMapping = Array.from(mappingRows).map(row => {
            const tds = row.querySelectorAll('td');
            // Course mapping layout has CO # on tds[0] and then custom dropdowns
            const coLabel = tds[0]?.innerText.trim() || '';
            const dropdowns = row.querySelectorAll('.custom-dropdown-trigger');
            const alignments = Array.from(dropdowns).map(d => d.dataset.value || '');
            return {
                coNumber: coLabel,
                alignments
            };
        });

        // 5. Course Outcomes Editor Table
        const editorRows = document.querySelectorAll('#outcomes-editor-body tr');
        payload.courseOutcomesEditor = Array.from(editorRows)
            .filter(r => r.style.display !== 'none') // ignore hidden rows from merged cells
            .map(row => {
                const cells = row.querySelectorAll('.editable-cell');
                return {
                    coNumber: cells[0]?.innerText.trim() || '',
                    description: cells[1]?.innerText.trim() || '',
                    thinkingSkills: cells[2]?.innerText.trim() || '' 
                };
            });

        // 6. Concept Map
        const conceptMapImg = document.getElementById('concept-map-preview');
        if (conceptMapImg && conceptMapImg.src && conceptMapImg.src.trim() !== "" && !conceptMapImg.src.endsWith('undefined')) {
            payload.conceptMap = conceptMapImg.src;
        }

        // Include Syllabus ID
        console.log("Saving Syllabus ID to Session:", window.CURRENT_SYLLABUS_ID);
        if (window.CURRENT_SYLLABUS_ID) {
            payload.syllabusId = window.CURRENT_SYLLABUS_ID;
        } else {
            console.error("No CURRENT_SYLLABUS_ID found on the page!");
            alert("Warning: Course ID is missing. The draft may not save correctly.");
        }

        // Save to session
        const saveKey = `syllabusFormDraft_${window.CURRENT_SYLLABUS_ID || 'default'}`;
        sessionStorage.setItem(saveKey, JSON.stringify(payload));
        
        // Proceed to schedule
        window.location.href = `/syllabus/schedule/${window.CURRENT_SYLLABUS_ID}`;
    } catch (e) {
        console.error("Error saving syllabus step 1 data:", e);
        alert("There was an error saving your data. Please check the console.");
    }
};
