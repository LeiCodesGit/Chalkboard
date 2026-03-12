/* ═══════════════════════════════════════════════════════════
   HR Admin Overview — Client-side JS
   Tab filtering, search, archive/unarchive actions
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    const tabs = document.querySelectorAll('.tab-btn');
    const rows = document.querySelectorAll('.item-row');
    const searchInput = document.getElementById('hrSearch');

    // ─── Tab filtering ─────────────────────────────────────
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filterRows();
        });
    });

    // ─── Search filtering ──────────────────────────────────
    if (searchInput) {
        searchInput.addEventListener('input', filterRows);
    }

    function filterRows() {
        const activeFilter = document.querySelector('.tab-btn.active').dataset.filter;
        const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

        rows.forEach(row => {
            const statusMatch = activeFilter === 'all' || row.dataset.status === activeFilter;
            const searchMatch = !query
                || row.dataset.title.includes(query)
                || row.dataset.code.includes(query);
            row.style.display = (statusMatch && searchMatch) ? '' : 'none';
        });
    }

    // ─── Archive button ────────────────────────────────────
    document.querySelectorAll('.archive-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const syllabusId = btn.dataset.id;
            if (!confirm('Archive this syllabus? It will be moved to the archived list.')) return;

            try {
                const res = await fetch(`/syllabus/hr/archive/${syllabusId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ archivedBy: 'HR Admin' })
                });

                if (res.ok) {
                    alert('Syllabus archived successfully.');
                    window.location.reload();
                } else {
                    const data = await res.json();
                    alert('Failed to archive: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                console.error('Archive error:', err);
                alert('An error occurred while archiving.');
            }
        });
    });

    // ─── Unarchive button ──────────────────────────────────
    document.querySelectorAll('.unarchive-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const syllabusId = btn.dataset.id;
            if (!confirm('Restore this syllabus? It will be moved back to the approved list.')) return;

            try {
                const res = await fetch(`/syllabus/hr/unarchive/${syllabusId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    alert('Syllabus unarchived successfully.');
                    window.location.reload();
                } else {
                    const data = await res.json();
                    alert('Failed to unarchive: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                console.error('Unarchive error:', err);
                alert('An error occurred while unarchiving.');
            }
        });
    });

});
