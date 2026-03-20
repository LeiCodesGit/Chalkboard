/* ============================================================
   TLA Courses Page — Client-side JS
   File: public/TLA/js/tlaCourses.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const searchInput  = document.getElementById('course-search');
    const termSelect   = document.getElementById('term-filter');
    const grid         = document.getElementById('courses-grid');
    const resultsCount = document.getElementById('results-count');
    const chipsWrap    = document.getElementById('active-chips');
    const btnList      = document.getElementById('btn-list-view');
    const btnGrid      = document.getElementById('btn-grid-view');

    const cards = Array.from(grid.querySelectorAll('.course-card'));

    // ── Prevent navigation and show toast for locked courses ────────────────────
    cards.forEach(card => {
        const isLocked = card.dataset.isLocked === 'true';
        if (isLocked) {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showToast('Course locked - requires approved course syllabus', 'warning');
                return false;
            });
        }
    });

    // ── Simple toast notification ────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white;
            padding: 16px 24px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 9999;
            font-size: 14px;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ── Filter logic ────────────────────────────────────────────────────
    function applyFilters() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const term  = termSelect.value;

        let visible = 0;

        cards.forEach(card => {
            const code  = (card.dataset.courseCode  || '').toLowerCase();
            const title = (card.dataset.courseTitle || '').toLowerCase();
            const cTerm = card.dataset.term || '';

            const matchSearch = !query || code.includes(query) || title.includes(query);
            const matchTerm   = !term  || cTerm === term;

            if (matchSearch && matchTerm) {
                card.classList.remove('hidden');
                visible++;
            } else {
                card.classList.add('hidden');
            }
        });

        resultsCount.textContent = visible + ' Result' + (visible !== 1 ? 's' : '');
        renderChips(term);
    }

    // ── Filter chips ────────────────────────────────────────────────────
    function renderChips(term) {
        chipsWrap.innerHTML = '';
        if (!term) return;

        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.innerHTML =
            truncate(term, 28) +
            '<button class="chip-remove" title="Remove filter">' +
                '<span class="material-symbols-outlined">cancel</span>' +
            '</button>';

        chip.querySelector('.chip-remove').addEventListener('click', () => {
            termSelect.value = '';
            applyFilters();
        });

        chipsWrap.appendChild(chip);
    }

    function truncate(str, max) {
        return str.length > max ? str.slice(0, max) + '…' : str;
    }

    // ── View toggle ─────────────────────────────────────────────────────
    function setView(mode) {
        if (mode === 'list') {
            grid.classList.add('list-view');
            grid.classList.remove('grid-view');
            btnList.classList.add('active');
            btnGrid.classList.remove('active');
        } else {
            grid.classList.add('grid-view');
            grid.classList.remove('list-view');
            btnGrid.classList.add('active');
            btnList.classList.remove('active');
        }
    }

    // ── Event listeners ─────────────────────────────────────────────────
    searchInput.addEventListener('input', applyFilters);
    termSelect.addEventListener('change', applyFilters);
    btnList.addEventListener('click', () => setView('list'));
    btnGrid.addEventListener('click', () => setView('grid'));

    // Default: grid view
    setView('grid');
});
