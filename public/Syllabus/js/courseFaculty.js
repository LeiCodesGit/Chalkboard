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

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function buildRemarksHtml(status, pcRemarks, deanRemarks, hrRemarks) {
        const strStatus = status || 'No Syllabus Draft';
        const isEndorsedOrHigher = ['Endorsed', 'Approved', 'Archived', 'Rejected'].includes(strStatus);
        const isApprovedOrHigher = ['Approved', 'Archived', 'Returned to PC', 'Returned to Dean'].includes(strStatus);
        const isArchived = strStatus === 'Archived';

        if (!isEndorsedOrHigher && !isApprovedOrHigher && !isArchived) return '';

        let html = '<div style="margin-top: 6px; font-size: 11px; color: #555; border-top: 1px dashed #e0e0e0; padding-top: 6px;">';
        if (isEndorsedOrHigher) {
            html += `<div style="margin-bottom: 3px;">
                <i class="fas fa-comment-dots" style="color: #1565c0; margin-right: 3px;"></i>
                <strong style="color: #1565c0;">Endorsed:</strong>
                <span style="font-style: italic;">${pcRemarks ? escapeHtml(pcRemarks) : 'No comments.'}</span>
            </div>`;
        }
        if (isApprovedOrHigher) {
            html += `<div style="margin-bottom: 3px;">
                <i class="fas fa-comment-dots" style="color: #2e7d32; margin-right: 3px;"></i>
                <strong style="color: #2e7d32;">Approved:</strong>
                <span style="font-style: italic;">${deanRemarks ? escapeHtml(deanRemarks) : 'No comments.'}</span>
            </div>`;
        }
        if (isArchived) {
            html += `<div style="margin-bottom: 3px;">
                <i class="fas fa-comment-dots" style="color: #6a1b9a; margin-right: 3px;"></i>
                <strong style="color: #6a1b9a;">Verified:</strong>
                <span style="font-style: italic;">${hrRemarks ? escapeHtml(hrRemarks) : 'No comments.'}</span>
            </div>`;
        }
        html += '</div>';
        return html;
    }

    function renderCourseGrid(courses) {
        if (!courseGrid) return;

        const isListView = courseGrid.classList.contains('list-view');

        if (courses.length > 0) {
            courseGrid.innerHTML = courses.map(course => {
                const si = getStatusInfo(course.status);
                const remarksHtml = buildRemarksHtml(course.status, course.pcRemarks || '', course.deanRemarks || '', course.hrRemarks || '');
                return `
                <div class="course-card" data-id="${course.id}" data-hasdraft="${course.hasDraft}" data-status="${course.status || 'No Syllabus Draft'}" data-title="${escapeHtml(course.title)}" data-pcremarks="${escapeHtml(course.pcRemarks || '')}" data-deanremarks="${escapeHtml(course.deanRemarks || '')}" data-hrremarks="${escapeHtml(course.hrRemarks || '')}">
                    <div class="card-image">
                        <img src="${course.img}" alt="Course Image">
                    </div>
                    <div class="card-content">
                        <span class="course-code">${course.code}</span>
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-status ${si.cssClass}">${si.label}</p>
                        ${remarksHtml}
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
window.openDraftModal = async function (syllabusId, hasDraft, status, courseTitle) {
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

            // Check if faculty has already signed
            let hasSigned = false;
            try {
                const sigRes = await fetch(`/faculty/check-signature/${syllabusId}`);
                const sigData = await sigRes.json();
                hasSigned = sigData.hasSigned;
            } catch (e) {
                console.error('Error checking signature:', e);
            }

            if (downloadBtn) {
                downloadBtn.style.display = 'flex';

                if (hasSigned) {
                    // Already signed — show "Download PDF" that downloads directly
                    downloadBtn.innerHTML = '<i class="fas fa-download" style="margin-right: 6px;"></i> Download PDF';
                    downloadBtn.style.background = '#2e7d32';
                    downloadBtn.onclick = () => {
                        window.open(`/syllabus/preview/generate-pdf/${syllabusId}`, '_blank');
                    };
                } else {
                    // Not signed — show "Sign PDF" that opens signature modal
                    downloadBtn.innerHTML = '<i class="fas fa-pen-nib" style="margin-right: 6px;"></i> Sign PDF';
                    downloadBtn.style.background = '#b30000';
                    downloadBtn.onclick = () => {
                        window.closeDraftModal();
                        window.openSignatureModal(syllabusId);
                    };
                }
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
    const sigModal = document.getElementById('signatureModal');
    if (event.target === sigModal) {
        sigModal.style.display = "none";
    }
});


/* =====================================================================
   FACULTY SIGNATURE MODAL LOGIC (GLOBAL SCOPE)
===================================================================== */
(function () {
    let sigCanvas, sigCtx, sigDrawing = false, sigHasStroke = false;
    let currentSyllabusId = null;

    function initCanvas() {
        sigCanvas = document.getElementById('facultySigCanvas');
        if (!sigCanvas) return;
        sigCtx = sigCanvas.getContext('2d');

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = sigCanvas.getBoundingClientRect();
        sigCanvas.width = rect.width * ratio;
        sigCanvas.height = rect.height * ratio;
        sigCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        sigCtx.lineWidth = 2.2;
        sigCtx.lineCap = 'round';
        sigCtx.lineJoin = 'round';
        sigCtx.strokeStyle = '#111';
        repaintGuide();
    }

    function repaintGuide() {
        if (!sigCtx || !sigCanvas) return;
        const ratio = window.devicePixelRatio || 1;
        const w = sigCanvas.width / ratio;
        const h = sigCanvas.height / ratio;
        sigCtx.fillStyle = '#fff';
        sigCtx.fillRect(0, 0, w, h);
        sigCtx.strokeStyle = '#111';
    }

    function getPos(evt) {
        const rect = sigCanvas.getBoundingClientRect();
        const point = evt.touches ? evt.touches[0] : evt;
        return { x: point.clientX - rect.left, y: point.clientY - rect.top };
    }

    function startDraw(evt) {
        evt.preventDefault();
        sigDrawing = true;
        const pos = getPos(evt);
        sigCtx.beginPath();
        sigCtx.moveTo(pos.x, pos.y);
    }

    function draw(evt) {
        if (!sigDrawing) return;
        evt.preventDefault();
        const pos = getPos(evt);
        sigCtx.lineTo(pos.x, pos.y);
        sigCtx.stroke();
        sigHasStroke = true;
    }

    function endDraw(evt) {
        if (evt) evt.preventDefault();
        sigDrawing = false;
    }

    function setStatusMsg(text, isError) {
        const el = document.getElementById('sigStatusMsg');
        if (!el) return;
        el.textContent = text || '';
        el.style.color = isError ? '#b30000' : '#2e7d32';
    }

    // ---- Public: Open signature modal ----
    window.openSignatureModal = async function (syllabusId) {
        currentSyllabusId = syllabusId;
        const modal = document.getElementById('signatureModal');
        if (!modal) return;

        // Reset UI
        const canvasArea = sigCanvas ? sigCanvas.parentElement : null;
        const alreadySigned = document.getElementById('sigAlreadySigned');
        setStatusMsg('');
        sigHasStroke = false;

        // Check if faculty already signed
        try {
            const res = await fetch(`/faculty/check-signature/${syllabusId}`);
            const data = await res.json();

            if (data.hasSigned && data.signatureImage) {
                // Already signed — show preview with direct download
                if (canvasArea) canvasArea.style.display = 'none';
                if (alreadySigned) {
                    alreadySigned.style.display = 'block';
                    const previewImg = document.getElementById('sigPreviewImg');
                    if (previewImg) previewImg.src = data.signatureImage;
                }
            } else {
                // Not signed yet — show canvas
                if (canvasArea) canvasArea.style.display = 'block';
                if (alreadySigned) alreadySigned.style.display = 'none';
            }
        } catch (err) {
            console.error('Error checking signature:', err);
            if (canvasArea) canvasArea.style.display = 'block';
            if (alreadySigned) alreadySigned.style.display = 'none';
        }

        // Show modal FIRST so canvas gets real dimensions
        modal.style.display = 'flex';

        // Init canvas on next frame (after layout) so getBoundingClientRect works
        requestAnimationFrame(() => {
            initCanvas();
        });
    };

    window.closeSignatureModal = function () {
        const modal = document.getElementById('signatureModal');
        if (modal) modal.style.display = 'none';
    };

    // Wait for DOM
    document.addEventListener('DOMContentLoaded', () => {
        sigCanvas = document.getElementById('facultySigCanvas');
        if (!sigCanvas) return;
        sigCtx = sigCanvas.getContext('2d');

        // Canvas drawing events
        sigCanvas.addEventListener('mousedown', startDraw);
        sigCanvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', endDraw);
        sigCanvas.addEventListener('touchstart', startDraw, { passive: false });
        sigCanvas.addEventListener('touchmove', draw, { passive: false });
        sigCanvas.addEventListener('touchend', endDraw, { passive: false });

        // Clear button
        const clearBtn = document.getElementById('sigClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                sigHasStroke = false;
                repaintGuide();
                setStatusMsg('Canvas cleared.', false);
            });
        }

        // Sign & Download button
        const saveBtn = document.getElementById('sigSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (!sigHasStroke) {
                    setStatusMsg('Please draw your signature first.', true);
                    return;
                }
                if (!currentSyllabusId) {
                    setStatusMsg('No syllabus selected.', true);
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                try {
                    const signatureImage = sigCanvas.toDataURL('image/png');
                    const res = await fetch(`/faculty/sign-faculty/${currentSyllabusId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ signatureImage })
                    });
                    const data = await res.json();

                    if (!res.ok || !data.success) {
                        setStatusMsg(data.message || 'Failed to save signature.', true);
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 6px;"></i> Sign & Download PDF';
                        return;
                    }

                    setStatusMsg('Signature saved! Generating PDF...', false);

                    // Now trigger PDF download
                    window.open(`/syllabus/preview/generate-pdf/${currentSyllabusId}`, '_blank');

                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 6px;"></i> Sign & Download PDF';

                    // Close modal after short delay
                    setTimeout(() => {
                        window.closeSignatureModal();
                    }, 800);
                } catch (err) {
                    console.error('Signature save error:', err);
                    setStatusMsg('Something went wrong while saving.', true);
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 6px;"></i> Sign & Download PDF';
                }
            });
        }

        // Direct download button (already signed)
        const downloadDirectBtn = document.getElementById('sigDownloadDirectBtn');
        if (downloadDirectBtn) {
            downloadDirectBtn.addEventListener('click', () => {
                if (currentSyllabusId) {
                    window.open(`/syllabus/preview/generate-pdf/${currentSyllabusId}`, '_blank');
                    setTimeout(() => window.closeSignatureModal(), 500);
                }
            });
        }

        // Re-sign button
        const resignBtn = document.getElementById('sigResignBtn');
        if (resignBtn) {
            resignBtn.addEventListener('click', () => {
                const canvasArea = sigCanvas ? sigCanvas.parentElement : null;
                const alreadySigned = document.getElementById('sigAlreadySigned');
                if (canvasArea) canvasArea.style.display = 'block';
                if (alreadySigned) alreadySigned.style.display = 'none';
                initCanvas();
                setStatusMsg('');
            });
        }
    });
})();
