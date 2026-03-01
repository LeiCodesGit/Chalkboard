document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("addCourseModal");
    const openBtn = document.getElementById("openAddModalBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelModalBtn");
    const enterDeleteModeBtn = document.getElementById("enterDeleteMode");
    const deleteToolbar = document.getElementById("deleteToolbar");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const selectedCountEl = document.getElementById("selectedCount");
    const courseGrid = document.querySelector(".course-grid");
    const instructorSelect = document.getElementById("assignedInstructor");
    const instructorHint = document.getElementById("instructorHint");
    const addCourseForm = document.getElementById("addCourseForm");

    // Image upload elements
    const uploadZone = document.getElementById("imageUploadZone");
    const uploadPlaceholder = document.getElementById("uploadPlaceholder");
    const uploadPreview = document.getElementById("uploadPreview");
    const previewImage = document.getElementById("previewImage");
    const removeImageBtn = document.getElementById("removeImageBtn");
    const courseImageInput = document.getElementById("courseImageInput");

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

        // Close when clicking anywhere else
        document.addEventListener('click', (e) => {
            if (!actionsWrapper.contains(e.target)) {
                actionsWrapper.classList.remove('open');
            }
        });
    }

    // =========================================
    // Modal Open — fetch users & display panel
    // =========================================
    if (modal && openBtn) {
        openBtn.onclick = () => {
            // Reset form fields when opening
            if (addCourseForm) addCourseForm.reset();
            resetImageUpload();
            clearFormError();

            // Show modal with unfocused background
            modal.style.display = "flex";

            // Fetch instructor list from database
            fetchInstructors();
        };
    }

    // =========================================
    // Modal Close — multiple close methods
    // =========================================
    function closeModal() {
        modal.style.display = "none";
        clearFormError();
    }

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    // Close on overlay click (outside the panel)
    window.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModal();
        }
    });

    // =========================================
    // Fetch Instructors from Database
    // =========================================
    async function fetchInstructors() {
        if (!instructorSelect || !instructorHint) return;

        // Show loading state
        instructorHint.textContent = "Loading instructors from database...";
        instructorHint.className = "form-hint";

        try {
            const response = await fetch('/syllabus/users');
            const users = await response.json();

            // Clear existing options (keep the default)
            instructorSelect.innerHTML = '<option value="">— Select an Instructor —</option>';

            if (users.length > 0) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user._id;
                    option.textContent = `${user.firstName} ${user.lastName}`;

                    // Show role as additional context if available
                    if (user.role) {
                        option.textContent += ` (${user.role})`;
                    }

                    instructorSelect.appendChild(option);
                });

                instructorHint.textContent = `${users.length} instructor(s) available`;
                instructorHint.className = "form-hint loaded";
            } else {
                instructorHint.textContent = "No instructors found in database — field is optional";
                instructorHint.className = "form-hint empty";
            }
        } catch (error) {
            console.error("Error fetching instructors:", error);
            instructorHint.textContent = "Could not load instructors — field is optional";
            instructorHint.className = "form-hint error";
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
                const response = await fetch(addCourseForm.action, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Success — redirect to the courses page
                    window.location.href = result.redirect;
                } else if (result.error === 'duplicate') {
                    // Show duplicate error in modal
                    showFormError(result.message, result.field);
                } else {
                    showFormError(result.message || 'An error occurred while adding the course.');
                }
            } catch (error) {
                console.error('Form submission error:', error);
                showFormError('An unexpected error occurred. Please try again.');
            }
        });
    }

    function showFormError(message, field) {
        if (formError && formErrorText) {
            formErrorText.textContent = message;
            formError.style.display = 'flex';

            // Re-trigger shake animation
            formError.style.animation = 'none';
            formError.offsetHeight; // force reflow
            formError.style.animation = '';

            // Highlight the offending input field
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

    // Clear error highlight when user starts typing in the errored field
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
    // Image Upload — Click, Drag & Drop, Preview
    // =========================================
    if (uploadZone && courseImageInput) {

        // Click to browse
        uploadZone.addEventListener('click', (e) => {
            // Don't trigger file picker if clicking the remove button
            if (e.target.closest('.remove-image-btn')) return;
            courseImageInput.click();
        });

        // File selected via picker
        courseImageInput.addEventListener('change', () => {
            if (courseImageInput.files && courseImageInput.files[0]) {
                handleImageFile(courseImageInput.files[0]);
            }
        });

        // Drag-and-drop events
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                handleImageFile(file);
            }
        });

        // Remove image button
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetImageUpload();
            });
        }
    }

    function handleImageFile(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please select a valid image file (JPG, PNG, GIF, or WEBP)');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be smaller than 5MB');
            return;
        }

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
    // Delete Selection Mode (Teammate's Code + Your Modal)
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
            // MERGE FIX: Instead of direct navigation, trigger your new Draft Modal logic!
            const courseId = card.dataset.id;
            const hasDraft = card.dataset.hasdraft === 'true'; // parse boolean

            if (courseId) {
                window.openDraftModal(courseId, hasDraft);
            }
            return;
        }

        // Prevent navigation when in delete mode
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

    // Enter delete mode button
    if (enterDeleteModeBtn && courseGrid) {
        enterDeleteModeBtn.onclick = enterDeleteMode;
    }

    // Cancel delete mode
    if (cancelDeleteBtn) {
        cancelDeleteBtn.onclick = exitDeleteMode;
    }

    // Confirm bulk delete
    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = async () => {
            if (selectedCourseIds.size === 0) return;

            const count = selectedCourseIds.size;
            const confirmed = confirm(`Are you sure you want to delete ${count} course${count > 1 ? 's' : ''}? This action cannot be undone.`);
            if (!confirmed) return;

            const searchContainer = document.querySelector('.search-container');
            const userId = searchContainer ? searchContainer.dataset.userid : '';

            try {
                const response = await fetch(`/syllabus/${userId}/delete-bulk`, {
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
                console.error('Delete error:', error);
                alert('An error occurred while deleting courses.');
            }
        };
    }

    // Attach click handlers to initial cards
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
            const response = await fetch(`/syllabus/search?q=${encodeURIComponent(query)}&userId=${encodeURIComponent(userId)}`);
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

        const wasDeleteMode = isDeleteMode;
        const wasListView = courseGrid.classList.contains('list-view');

        if (courses.length > 0) {
            // MERGE FIX: Using dataset attributes so your teammate's click handler can read the Draft status
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

        // Restore list-view state after re-render
        if (wasListView) courseGrid.classList.add('list-view');

        // Preserve delete mode and re-attach handlers
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

/* =====================================================================
   REVIEW SYLLABUS NAVIGATION — close dropdown before leaving
===================================================================== */
window.goToReviewSyllabus = function () {
    // Close the actions dropdown first so it isn't open when user comes back
    const wrapper = document.getElementById('actionsDropdownWrapper');
    if (wrapper) wrapper.classList.remove('open');

    // Small delay so the CSS transition finishes before navigation
    setTimeout(() => {
        window.location.href = '/syllabus/tech-assistant/approve';
    }, 80);
};

/* =====================================================================
   BFCACHE GUARD — force-close dropdown on back navigation
===================================================================== */
window.addEventListener('pageshow', function (event) {
    // event.persisted = true when browser restores from bfcache (back/forward)
    if (event.persisted) {
        const wrapper = document.getElementById('actionsDropdownWrapper');
        if (wrapper) wrapper.classList.remove('open');
    }
});