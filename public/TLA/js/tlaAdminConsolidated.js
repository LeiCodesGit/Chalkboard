document.addEventListener('DOMContentLoaded', () => {
    // ── Tab switching ──
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // ── Review queue: search + status filter ──
    const searchInput  = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const table        = document.getElementById('submissionsTable');
    const noResults    = document.getElementById('noResults');

    function filterQueue() {
        if (!table) return;
        const q = (searchInput?.value || '').toLowerCase();
        const s = (statusFilter?.value || '');
        const rows = table.querySelectorAll('tbody .tbl-row');
        let visible = 0;
        rows.forEach(row => {
            const text   = row.textContent.toLowerCase();
            const status = row.dataset.status || '';
            const show   = (!q || text.includes(q)) && (!s || status === s);
            row.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        if (noResults) noResults.style.display = visible === 0 ? '' : 'none';
        const wrap = table.closest('.table-wrap');
        if (wrap) wrap.style.display = visible === 0 ? 'none' : '';
    }

    if (searchInput)  searchInput.addEventListener('input', filterQueue);
    if (statusFilter) statusFilter.addEventListener('change', filterQueue);

    // ── Archive tab search ──
    const archiveSearch = document.getElementById('archiveSearch');
    const archivedGrid  = document.getElementById('archivedGrid');
    if (archiveSearch && archivedGrid) {
        archiveSearch.addEventListener('input', () => {
            const q = archiveSearch.value.toLowerCase();
            archivedGrid.querySelectorAll('.archive-row').forEach(card => {
                card.style.display = (!q || card.textContent.toLowerCase().includes(q)) ? '' : 'none';
            });
        });
    }
});
