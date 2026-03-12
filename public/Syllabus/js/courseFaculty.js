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
        if (courseId) {
            window.openDraftModal(courseId, hasDraft);
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

    function renderCourseGrid(courses) {
        if (!courseGrid) return;

        const isListView = courseGrid.classList.contains('list-view');

        if (courses.length > 0) {
            courseGrid.innerHTML = courses.map(course => `
                <div class="course-card" data-id="${course.id}" data-hasdraft="${course.hasDraft}">
                    <div class="card-image">
                        <img src="${course.img}" alt="Course Image">
                    </div>
                    <div class="card-content">
                        <span class="course-code">${course.code}</span>
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-status">${course.status || 'No Syllabus Draft'}</p>
                    </div>
                    <div class="card-footer">
                        <span class="instructor">${course.instructor}</span>
                    </div>
                </div>
            `).join('');
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
window.openDraftModal = function (syllabusId, hasDraft) {
    const modal = document.getElementById('draftModal');
    const msg = document.getElementById('draftMessage');
    const btn = document.getElementById('draftActionBtn');

    if (hasDraft) {
        msg.innerText = "A syllabus draft already exists for this course.";
        btn.innerText = "Edit Syllabus Draft";
        btn.onclick = () => window.location.href = `/syllabus/edit/${syllabusId}`;
    } else {
        msg.innerText = "There's no syllabus draft at the moment.";
        btn.innerText = "+ Add Syllabus Draft";
        btn.onclick = () => {
            window.closeDraftModal();
            window.location.href = '/syllabus/create';
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
