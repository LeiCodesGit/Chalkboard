/* =====================================================================
   endorseSyllabus.js
   JS for Program Chair Course Overview + Endorsement Queue pages
   Mirrors courseOverview.js — all functions scoped here for PC views
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('addCourseModal');
    const openBtn = document.getElementById('openAddModalBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const enterDeleteModeBtn = document.getElementById('enterDeleteMode');
    const deleteToolbar = document.getElementById('deleteToolbar');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const selectedCountEl = document.getElementById('selectedCount');
    const courseGrid = document.querySelector('.course-grid');
    const instructorSelect = document.getElementById('assignedInstructor');
    const instructorHint = document.getElementById('instructorHint');
    const addCourseForm = document.getElementById('addCourseForm');

    // Image upload elements
    const uploadZone = document.getElementById('imageUploadZone');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const uploadPreview = document.getElementById('uploadPreview');
    const previewImage = document.getElementById('previewImage');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const courseImageInput = document.getElementById('courseImageInput');

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
    // Actions Dropdown Toggle
    // =========================================
    const actionsWrapper = document.getElementById('actionsDropdownWrapper');
    const actionsToggle = document.getElementById('actionsToggleBtn');

    if (actionsToggle && actionsWrapper) {
        actionsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            actionsWrapper.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!actionsWrapper.contains(e.target)) {
                actionsWrapper.classList.remove('open');
            }
        });
    }

    // =========================================
    // Modal Open
    // =========================================
    if (modal && openBtn) {
        openBtn.onclick = () => {
            if (addCourseForm) addCourseForm.reset();
            resetImageUpload();
            clearFormError();
            modal.style.display = 'flex';
            fetchInstructors();
        };
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
        clearFormError();
    }

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    window.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') closeModal();
    });

    // =========================================
    // Fetch Instructors
    // =========================================
    async function fetchInstructors() {
        if (!instructorSelect || !instructorHint) return;
        instructorHint.textContent = 'Loading instructors from database...';
        instructorHint.className = 'form-hint';

        try {
            const response = await fetch('/syllabus/users');
            const users = await response.json();
            instructorSelect.innerHTML = '<option value="">— Select an Instructor —</option>';

            if (users.length > 0) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user._id;
                    option.textContent = `${user.firstName} ${user.lastName}`;
                    if (user.role) option.textContent += ` (${user.role})`;
                    instructorSelect.appendChild(option);
                });
                instructorHint.textContent = `${users.length} instructor(s) available`;
                instructorHint.className = 'form-hint loaded';
            } else {
                instructorHint.textContent = 'No instructors found — field is optional';
                instructorHint.className = 'form-hint empty';
            }
        } catch (error) {
            console.error('Error fetching instructors:', error);
            instructorHint.textContent = 'Could not load instructors — field is optional';
            instructorHint.className = 'form-hint error';
        }
    }

    // =========================================
    // Form Submit — AJAX with duplicate check
    // =========================================
    const formError = document.getElementById('formError');
    const formErrorText = document.getElementById('formErrorText');
    const courseTitleInput = document.getElementById('courseTitle');
    const courseCodeInput = document.getElementById('courseCode');

    if (addCourseForm) {
        addCourseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFormError();
            const formData = new FormData(addCourseForm);
            try {
                const response = await fetch(addCourseForm.action, { method: 'POST', body: formData });
                const result = await response.json();
                if (response.ok && result.success) {
                    window.location.href = result.redirect;
                } else if (result.error === 'duplicate') {
                    showFormError(result.message, result.field);
                } else {
                    showFormError(result.message || 'An error occurred.');
                }
            } catch (error) {
                showFormError('An unexpected error occurred. Please try again.');
            }
        });
    }

    function showFormError(message, field) {
        if (formError && formErrorText) {
            formErrorText.textContent = message;
            formError.style.display = 'flex';
            formError.style.animation = 'none';
            formError.offsetHeight;
            formError.style.animation = '';
            if (field === 'courseCode' && courseCodeInput) {
                courseCodeInput.classList.add('input-error');
                courseCodeInput.focus();
            } else if (field === 'courseTitle' && courseTitleInput) {
                courseTitleInput.classList.add('input-error');
                courseTitleInput.focus();
            }
        }
    }

    function clearFormError() {
        if (formError) formError.style.display = 'none';
        if (courseTitleInput) courseTitleInput.classList.remove('input-error');
        if (courseCodeInput) courseCodeInput.classList.remove('input-error');
    }

    if (courseTitleInput) {
        courseTitleInput.addEventListener('input', () => {
            courseTitleInput.classList.remove('input-error');
            if (formError && formError.style.display !== 'none') clearFormError();
        });
    }
    if (courseCodeInput) {
        courseCodeInput.addEventListener('input', () => {
            courseCodeInput.classList.remove('input-error');
            if (formError && formError.style.display !== 'none') clearFormError();
        });
    }

    // =========================================
    // Image Upload
    // =========================================
    if (uploadZone && courseImageInput) {
        uploadZone.addEventListener('click', (e) => {
            if (e.target.closest('.remove-image-btn')) return;
            courseImageInput.click();
        });

        courseImageInput.addEventListener('change', () => {
            if (courseImageInput.files && courseImageInput.files[0]) {
                handleImageFile(courseImageInput.files[0]);
            }
        });

        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
        uploadZone.addEventListener('dragleave', (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleImageFile(file);
        });

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => { e.stopPropagation(); resetImageUpload(); });
        }
    }

    function handleImageFile(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) { alert('Please select a valid image file (JPG, PNG, GIF, or WEBP)'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('Image must be smaller than 5MB'); return; }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        courseImageInput.files = dataTransfer.files;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImage) previewImage.src = e.target.result;
            if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
            if (uploadPreview) uploadPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    function resetImageUpload() {
        if (courseImageInput) courseImageInput.value = '';
        if (previewImage) previewImage.src = '';
        if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
        if (uploadPreview) uploadPreview.style.display = 'none';
    }

    // =========================================
    // Delete Mode
    // =========================================
    let isDeleteMode = false;
    let selectedCourseIds = new Set();

    function enterDeleteMode() {
        isDeleteMode = true;
        courseGrid.classList.add('delete-mode');
        if (actionsWrapper) actionsWrapper.style.display = 'none';
        deleteToolbar.style.display = 'flex';
        selectedCourseIds.clear();
        updateSelectedCount();
        attachCardClickHandlers();
    }

    function exitDeleteMode() {
        isDeleteMode = false;
        courseGrid.classList.remove('delete-mode');
        if (actionsWrapper) actionsWrapper.style.display = '';
        deleteToolbar.style.display = 'none';
        selectedCourseIds.clear();
        document.querySelectorAll('.course-card.selected').forEach(c => c.classList.remove('selected'));
    }

    function updateSelectedCount() {
        const count = selectedCourseIds.size;
        if (selectedCountEl) selectedCountEl.textContent = `${count} selected`;
        if (confirmDeleteBtn) confirmDeleteBtn.disabled = count === 0;
    }

    function attachCardClickHandlers() {
        document.querySelectorAll('.course-card').forEach(card => {
            card.removeEventListener('click', handleCardClick);
            card.addEventListener('click', handleCardClick);
        });
    }

    function handleCardClick(e) {
        const card = e.currentTarget;

        if (!isDeleteMode) {
            const courseId = card.dataset.id;
            const hasDraft = card.dataset.hasdraft === 'true';
            if (courseId) window.openDraftModal(courseId, hasDraft);
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const courseId = card.dataset.id;
        if (!courseId) return;

        if (selectedCourseIds.has(courseId)) {
            selectedCourseIds.delete(courseId);
            card.classList.remove('selected');
        } else {
            selectedCourseIds.add(courseId);
            card.classList.add('selected');
        }
        updateSelectedCount();
    }

    if (enterDeleteModeBtn && courseGrid) enterDeleteModeBtn.onclick = enterDeleteMode;
    if (cancelDeleteBtn) cancelDeleteBtn.onclick = exitDeleteMode;

    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = async () => {
            if (selectedCourseIds.size === 0) return;
            const count = selectedCourseIds.size;
            const confirmed = confirm(`Delete ${count} course${count > 1 ? 's' : ''}? This cannot be undone.`);
            if (!confirmed) return;

            const searchContainer = document.querySelector('.search-container');
            const userId = searchContainer ? searchContainer.dataset.userid : '';

            try {
                const response = await fetch(`/syllabus/prog-chair/${userId}/delete-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ courseIds: Array.from(selectedCourseIds) })
                });
                const result = await response.json();
                if (result.success) {
                    window.location.href = result.redirect;
                } else {
                    alert(result.error || 'Error deleting courses.');
                }
            } catch (error) {
                alert('An error occurred while deleting courses.');
            }
        };
    }

    attachCardClickHandlers();

    // =========================================
    // Live Search
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
            searchTimeout = setTimeout(() => fetchCourses(query), 200);
        });
    }

    async function fetchCourses(query) {
        try {
            const response = await fetch(`/syllabus/prog-chair/search?q=${encodeURIComponent(query)}&userId=${encodeURIComponent(userId)}`);
            const courses = await response.json();
            if (resultCount) resultCount.textContent = `${courses.length} Results`;
            renderCourseGrid(courses);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    function renderCourseGrid(courses) {
        if (!courseGrid) return;
        const wasDeleteMode = isDeleteMode;
        const wasListView = courseGrid.classList.contains('list-view');

        if (courses.length > 0) {
            courseGrid.innerHTML = courses.map(course => `
                <div class="course-card" data-id="${course.id}" data-hasdraft="${course.hasDraft}">
                    <div class="card-image"><img src="${course.img}" alt="Course Image"></div>
                    <div class="card-content">
                        <span class="course-code">${course.code}</span>
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-status">${course.status || 'No Syllabus Draft'}</p>
                    </div>
                    <div class="card-footer"><span class="instructor">${course.instructor}</span></div>
                </div>
            `).join('');
        } else {
            courseGrid.innerHTML = '<p style="text-align:center;color:#777;grid-column:1/-1;padding:40px 0;">No courses found.</p>';
        }

        if (wasListView) courseGrid.classList.add('list-view');
        if (wasDeleteMode) {
            courseGrid.classList.add('delete-mode');
            attachCardClickHandlers();
            selectedCourseIds.forEach(id => {
                const card = courseGrid.querySelector(`[data-id="${id}"]`);
                if (card) card.classList.add('selected');
            });
        } else {
            attachCardClickHandlers();
        }
    }
});

/* =====================================================================
   DRAFT MODAL (Global scope — PC version)
   ===================================================================== */
window.openDraftModal = function (syllabusId, hasDraft) {
    const modal = document.getElementById('draftModal');
    const msg = document.getElementById('draftMessage');
    const btn = document.getElementById('draftActionBtn');

    if (hasDraft) {
        msg.innerText = 'A syllabus draft already exists for this course.';
        btn.innerText = 'Edit Syllabus Draft';
        btn.onclick = () => window.location.href = `/syllabus/edit/${syllabusId}`;
    } else {
        msg.innerText = "There's no syllabus draft at the moment.";
        btn.innerText = '+ Add Syllabus Draft';
        btn.onclick = () => { window.closeDraftModal(); window.location.href = '/syllabus/create'; };
    }

    if (modal) modal.style.display = 'flex';
};

window.closeDraftModal = function () {
    const modal = document.getElementById('draftModal');
    if (modal) modal.style.display = 'none';
};

window.addEventListener('click', function (event) {
    const draftModal = document.getElementById('draftModal');
    if (event.target === draftModal) draftModal.style.display = 'none';
});

/* =====================================================================
   ENDORSE QUEUE NAVIGATION — close dropdown before leaving
   ===================================================================== */
window.goToEndorseQueue = function () {
    const wrapper = document.getElementById('actionsDropdownWrapper');
    if (wrapper) wrapper.classList.remove('open');
    setTimeout(() => {
        window.location.href = '/syllabus/prog-chair/endorse';
    }, 80);
};

/* =====================================================================
   BFCACHE GUARD — force-close dropdown on back navigation
   ===================================================================== */
window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        const wrapper = document.getElementById('actionsDropdownWrapper');
        if (wrapper) wrapper.classList.remove('open');
    }
});
