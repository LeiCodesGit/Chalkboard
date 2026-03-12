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
['peo-container', 'so-container'].forEach(id => {
    const container = document.getElementById(id);
    if (container) peoSoObserver.observe(container, { childList: true, subtree: true });
});
