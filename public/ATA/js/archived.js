const bbColors = ['#00bcd4', '#ffc107', '#20c997', '#9c27b0', '#007bff', '#e83e8c', '#fd7e14', '#28a745'];

function toggleFolder(folderId) {
    const body = document.getElementById(folderId);
    const icon = document.getElementById('icon-' + folderId);
    let openFolders = JSON.parse(localStorage.getItem('ata_open_folders') || '[]');

    if (body.classList.contains('open')) {
        body.classList.remove('open');
        icon.style.transform = 'rotate(0deg)'; // Arrow points down
        openFolders = openFolders.filter(id => id !== folderId);
    } else {
        body.classList.add('open');
        icon.style.transform = 'rotate(180deg)'; // Arrow points up
        if (!openFolders.includes(folderId)) openFolders.push(folderId);
    }
    
    localStorage.setItem('ata_open_folders', JSON.stringify(openFolders));
}

function renderAccordion(formsToRender) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';

    if (formsToRender.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #888; width: 100%;">
                <i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 15px; color: #ccc;"></i>
                <p style="font-size: 16px;">No archived records match your search.</p>
            </div>
        `;
        return;
    }

    const groupedData = {};
    formsToRender.forEach(form => {
        const groupName = form.program ? form.program : (form.college ? form.college : "Uncategorized");
        if (!groupedData[groupName]) {
            groupedData[groupName] = [];
        }
        groupedData[groupName].push(form);
    });

    const openFolders = JSON.parse(localStorage.getItem('ata_open_folders') || '[]');
    let colorIndex = 0;

    Object.keys(groupedData).sort().forEach((groupName) => {
        const formsInGroup = groupedData[groupName];
        const folderId = `folder-${groupName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        const isOpen = openFolders.includes(folderId);
        const folderClass = isOpen ? 'folder-body open' : 'folder-body';
        const iconTransform = isOpen ? 'transform: rotate(180deg);' : 'transform: rotate(0deg);';
        
        const cardColor = bbColors[colorIndex % bbColors.length];
        colorIndex++;

        const rowsHtml = formsInGroup.map(form => {
            const dateArchived = new Date(form.archivedAt || form.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const safeName = (form.facultyName || "Faculty").replace(/\s+/g, '_');
            
            return `
                <tr>
                    <td style="font-weight: 600; color: #222;">${form.facultyName}</td>
                    <td>${form.term} <span style="color:#777; font-size: 12px; margin-left: 5px;">(${form.academicYear})</span></td>
                    <td style="color: #555;">${dateArchived}</td>
                    <td>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <a href="/ata/view-submission/${form._id}" class="btn-view">
                                View
                            </a>
                            <button data-form-id="${form._id}" data-safe-name="${safeName}" class="btn-outline smart-download-btn">
                                <i class="fas fa-download"></i> <span>Download</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Card HTML with Chevron instead of Star
        const folderHtml = `
            <div class="bb-course-card" style="border-left-color: ${cardColor};">
                <div class="bb-card-header" onclick="toggleFolder('${folderId}')">
                    <div>
                        <div style="font-size: 11px; color: #666; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left;">Mapúa MCM | ${groupName}</div>
                        <div class="bb-card-title">${groupName} Archived Records</div>
                        <div class="bb-card-subtitle">
                            <span class="status">Open</span>
                            <span class="divider">|</span>
                            <span>Total Forms: ${formsInGroup.length}</span>
                            <span class="divider">|</span>
                            <span>Click to expand</span>
                        </div>
                    </div>
                    <div class="bb-card-icon">
                        <i id="icon-${folderId}" class="fas fa-chevron-down" style="${iconTransform}"></i>
                    </div>
                </div>
                
                <div id="${folderId}" class="${folderClass}">
                    <div style="padding: 0 20px 20px 20px;">
                        <table class="bb-table">
                            <thead>
                                <tr>
                                    <th style="width: 35%">Faculty Name</th>
                                    <th style="width: 25%">Term & Year</th>
                                    <th style="width: 20%">Date Archived</th>
                                    <th style="width: 20%">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += folderHtml;
    });
}

function populateFilterDropdowns() {
    const yearSelect = document.getElementById('yearFilter');
    const uniqueYears = new Set();
    
    window.__FORMS__.forEach(form => {
        if (form.academicYear && form.academicYear.trim() !== "") {
            uniqueYears.add(form.academicYear);
        }
    });

    const sortedYears = Array.from(uniqueYears).sort().reverse();
    yearSelect.innerHTML = '<option value="">All Academic Years</option>';
    sortedYears.forEach(year => {
        yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const yearInput = document.getElementById('yearFilter');
    const termInput = document.getElementById('termFilter');
    const programInput = document.getElementById('programFilter'); 

    const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const year = yearInput ? yearInput.value : '';
    const term = termInput ? termInput.value : '';
    const program = programInput ? programInput.value : ''; 

    localStorage.setItem('ata_archive_search', search);
    localStorage.setItem('ata_archive_year', year);
    localStorage.setItem('ata_archive_term', term);
    localStorage.setItem('ata_archive_program', program); 

    const filtered = window.__FORMS__.filter(f => {
        const nameMatch = !search || (f.facultyName || '').toLowerCase().includes(search);
        const yearMatch = !year   || f.academicYear === year;
        const termMatch = !term   || (f.term || '').includes(term);
        const formProgram = f.program || f.college || '';
        const programMatch = !program || formProgram === program; 

        return nameMatch && yearMatch && termMatch && programMatch;
    });

    document.getElementById('totalCountBadge').innerText = filtered.length;
    document.getElementById('resultsCountText').innerText = filtered.length;
    
    renderAccordion(filtered);
}

document.addEventListener('DOMContentLoaded', () => {
    populateFilterDropdowns(); 
    
    const savedSearch = localStorage.getItem('ata_archive_search');
    const savedYear = localStorage.getItem('ata_archive_year');
    const savedTerm = localStorage.getItem('ata_archive_term');
    const savedProgram = localStorage.getItem('ata_archive_program'); 
    
    if (savedSearch) document.getElementById('searchInput').value = savedSearch;
    if (savedYear) document.getElementById('yearFilter').value = savedYear;
    if (savedTerm) document.getElementById('termFilter').value = savedTerm;
    if (savedProgram) document.getElementById('programFilter').value = savedProgram; 

    applyFilters(); 
    
    setTimeout(() => {
        const savedScroll = localStorage.getItem('ata_archive_scroll');
        const scrollContainer = document.getElementById('accordionContainer'); 
        if (savedScroll && scrollContainer) {
            scrollContainer.scrollTop = parseInt(savedScroll); 
        }
    }, 50);
});

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.smart-download-btn');
    if (!btn) return; 

    const icon = btn.querySelector('i');
    const text = btn.querySelector('span');
    const formId = btn.getAttribute('data-form-id');
    const safeName = btn.getAttribute('data-safe-name');

    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    icon.className = 'fas fa-spinner fa-spin';
    text.innerText = 'Wait...';

    try {
        const response = await fetch(`/ata/pdf/${formId}`);
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `ATA_${safeName}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        alert("Failed to download PDF. Please check your connection and try again.");
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        icon.className = 'fas fa-download';
        text.innerText = 'Download';
    }
});

const scrollContainer = document.getElementById('accordionContainer');
if (scrollContainer) {
    scrollContainer.addEventListener('scroll', () => {
        localStorage.setItem('ata_archive_scroll', scrollContainer.scrollTop);
    });
}