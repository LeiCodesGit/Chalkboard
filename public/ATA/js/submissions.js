document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('dateSearchInput');
  const tableRows = document.querySelectorAll('#submissionsTable tbody .data-row');

  if (searchInput) {
      searchInput.addEventListener('input', function() {
          const query = this.value.toLowerCase().trim();
          
          tableRows.forEach(row => {
              const dateCell = row.querySelector('.searchable-date');
              
              if (dateCell) {
                  const dateText = dateCell.textContent.toLowerCase().trim();
                  if (dateText.includes(query)) {
                      row.style.display = ''; 
                  } else {
                      row.style.display = 'none'; 
                  }
              }
          });
      });
  }
});

function toggleHistory(btn) {
    const td = btn.closest('td');
    const hiddenItems = td.querySelectorAll('.hidden-track');
    const textSpan = btn.querySelector('.toggle-txt');
    const icon = btn.querySelector('i');

    const isHidden = hiddenItems[0].style.display === 'none';

    hiddenItems.forEach(item => {
        item.style.display = isHidden ? 'flex' : 'none';
    });

    if (isHidden) {
        textSpan.innerText = 'Show Less';
        icon.className = 'fas fa-chevron-up';
    } else {
        textSpan.innerText = `View ${hiddenItems.length} older actions`;
        icon.className = 'fas fa-chevron-down';
    }
}