document.addEventListener('DOMContentLoaded', () => {
    const courseGrid = document.querySelector('.course-grid');

    // =========================================
    // View Toggle — List / Grid
    // =========================================
    const listViewBtn = document.querySelector('.toggle-btn.list-view');
    const gridViewBtn = document.querySelector('.toggle-btn.grid-view');

    if (listViewBtn && gridViewBtn && courseGrid) {
        listViewBtn.addEventListener('click', () => {
            courseGrid.classList.add('list-view');
            listViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
        });

        gridViewBtn.addEventListener('click', () => {
            courseGrid.classList.remove('list-view');
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
        });
    }

    // =========================================
    // Card Click — open draft modal
    // =========================================
    function attachCardClickHandlers() {
        document.querySelectorAll('.course-card').forEach(card => {
            card.removeEventListener('click', handleCardClick);
            card.addEventListener('click', handleCardClick);
        });
    }

    function handleCardClick(e) {
        const card = e.currentTarget;
        const courseId = card.dataset.id;
        const hasDraft = card.dataset.hasdraft === 'true';
        const status = card.dataset.status || 'No Syllabus Draft';
        const title = card.dataset.title || '';
        if (courseId) {
            window.openDraftModal(courseId, hasDraft, status, title);
        }
    }

    attachCardClickHandlers();

    // =========================================
    // Live Search — keystroke by keystroke
    // =========================================
    const searchInput = document.getElementById('searchInput');
    const searchContainer = document.querySelector('.search-container');
    const resultCount = document.getElementById('resultCount');
    const userId = searchContainer ? searchContainer.dataset.userid : '';

    let searchTimeout = null;

    if (searchInput && courseGrid) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetchCourses(query);
            }, 200);
        });
    }

    async function fetchCourses(query) {
        try {
            // No userId — faculty can search across all courses
            const response = await fetch(`/syllabus/search?q=${encodeURIComponent(query)}`);
            const courses = await response.json();

            if (resultCount) {
                resultCount.textContent = `${courses.length} Results`;
            }
            renderCourseGrid(courses);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    function getStatusInfo(status) {
        switch(status) {
            case 'Pending': return { cssClass: 'status-pending', label: 'Pending' };
            case 'Endorsed': return { cssClass: 'status-endorsed', label: 'Endorsed' };
            case 'Approved': return { cssClass: 'status-approved', label: 'Approved by Dean' };
            case 'Archived': return { cssClass: 'status-archived', label: 'Verified by HR' };
            case 'Rejected': case 'Returned': return { cssClass: 'status-rejected', label: status };
            case 'Returned to PC': return { cssClass: 'status-returned', label: 'Returned to PC' };
            default: return { cssClass: 'status-no-draft', label: status || 'No Syllabus Draft' };
        }
    }

    function renderCourseGrid(courses) {
        if (!courseGrid) return;

        const isListView = courseGrid.classList.contains('list-view');

        if (courses.length > 0) {
            courseGrid.innerHTML = courses.map(course => {
                const si = getStatusInfo(course.status);
                return `
                <div class="course-card" data-id="${course.id}" data-hasdraft="${course.hasDraft}" data-status="${course.status || 'No Syllabus Draft'}" data-title="${course.title}">
                    <div class="card-image">
                        <img src="${course.img}" alt="Course Image">
                    </div>
                    <div class="card-content">
                        <span class="course-code">${course.code}</span>
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-status ${si.cssClass}">${si.label}</p>
                    </div>
                    <div class="card-footer">
                        <span class="instructor">${course.instructor}</span>
                    </div>
                </div>
            `}).join('');
        } else {
            courseGrid.innerHTML = '<p style="text-align: center; color: #777; grid-column: 1 / -1; padding: 40px 0;">No courses found.</p>';
        }

        // Preserve list/grid view after re-render
        if (isListView) courseGrid.classList.add('list-view');

        attachCardClickHandlers();
    }
});

/* =====================================================================
   DRAFT STATUS MODAL LOGIC (GLOBAL SCOPE)
===================================================================== */
window.openDraftModal = function (syllabusId, hasDraft, status, courseTitle) {
    const modal = document.getElementById('draftModal');
    const msg = document.getElementById('draftMessage');
    const btn = document.getElementById('draftActionBtn');
    const downloadBtn = document.getElementById('draftDownloadBtn');
    const modalTitle = document.getElementById('draftModalTitle');

    const RestrictedStatuses = ['Approved', 'Pending', 'Archived', 'Endorsed'];
    const isRestricted = RestrictedStatuses.includes(status);
    const isVerified = status === 'Archived';

    // Update modal title based on verification status
    if (modalTitle) {
        modalTitle.textContent = isVerified ? 'Syllabus' : 'Syllabus Draft';
    }

    // Hide download button by default
    if (downloadBtn) downloadBtn.style.display = 'none';

    if (hasDraft) {
        if (isVerified) {
            const syllabusName = courseTitle ? `${courseTitle} Syllabus` : 'Syllabus';
            msg.innerText = syllabusName;
            btn.innerText = 'View Syllabus';
            btn.onclick = () => window.location.href = `/syllabus/preview/${syllabusId}`;

            // Show Download PDF button
            if (downloadBtn) {
                downloadBtn.style.display = 'flex';
                downloadBtn.onclick = () => {
                    window.open(`/syllabus/preview/${syllabusId}?print=true`, '_blank');
                };
            }
        } else if (isRestricted) {
            msg.innerText = `This syllabus is currently ${status}. Editing is disabled.`;
            btn.innerText = 'View Syllabus Draft';
            btn.onclick = () => window.location.href = `/syllabus/preview/${syllabusId}`;
        } else {
            msg.innerText = 'A syllabus draft already exists for this course.';
            btn.innerText = 'Edit Syllabus Draft';
            btn.onclick = () => window.location.href = `/syllabus/create/${syllabusId}`;
        }
    } else {
        msg.innerText = "There's no syllabus draft at the moment.";
        btn.innerText = '+ Add Syllabus Draft';
        btn.onclick = () => {
            window.closeDraftModal();
            window.location.href = `/syllabus/create/${syllabusId}`;
        };
    }

    if (modal) modal.style.display = 'flex';
};

window.closeDraftModal = function () {
    const modal = document.getElementById('draftModal');
    if (modal) modal.style.display = 'none';
};

window.addEventListener('click', function (event) {
    const draftModal = document.getElementById('draftModal');
    if (event.target === draftModal) {
        draftModal.style.display = "none";
    }
});
