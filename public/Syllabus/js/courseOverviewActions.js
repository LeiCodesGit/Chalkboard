document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("addCourseModal");
    const openBtn = document.getElementById("openAddModalBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelModalBtn");
    const toggleDeleteBtn = document.getElementById("toggleDeleteBtn");
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
    // Modal Open — fetch users & display panel
    // =========================================
    if (modal && openBtn) {
        openBtn.onclick = () => {
            // Reset form fields when opening
            if (addCourseForm) addCourseForm.reset();
            resetImageUpload();

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
            const response = await fetch('/courses/api/users');
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

    /**
     * Validate and preview the selected image file
     */
    function handleImageFile(file) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please select a valid image file (JPG, PNG, GIF, or WEBP)');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be smaller than 5MB');
            return;
        }

        // Set the file to the input (for drag-and-drop files)
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        courseImageInput.files = dataTransfer.files;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImage) previewImage.src = e.target.result;
            if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
            if (uploadPreview) uploadPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    /**
     * Reset the image upload to its default state
     */
    function resetImageUpload() {
        if (courseImageInput) courseImageInput.value = '';
        if (previewImage) previewImage.src = '';
        if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
        if (uploadPreview) uploadPreview.style.display = 'none';
    }

    // =========================================
    // Toggle Delete UI
    // =========================================
    if (toggleDeleteBtn && courseGrid) {
        toggleDeleteBtn.onclick = () => {
            courseGrid.classList.toggle("delete-mode");
            if (courseGrid.classList.contains("delete-mode")) {
                toggleDeleteBtn.style.background = "#c0392b";
                toggleDeleteBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Delete';
            } else {
                toggleDeleteBtn.style.background = "#e74c3c";
                toggleDeleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Course';
            }
        };
    }
});
