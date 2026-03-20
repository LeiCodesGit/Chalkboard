document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('input[placeholder="Filter by Name or ID..."]');
    const getRows = () => document.querySelectorAll('tbody tr');

    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            getRows().forEach(row => {
                if (row.cells.length > 1) {
                    const text = row.innerText.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                }
            });
        });
    }
});