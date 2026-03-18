/* ═══════════════════════════════════════════════════════════
   Syllabus Approval Detail — Client-side JS
   Shared across TA Review, PC Endorsement, and Dean Approval
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ─── Status indicator color sync ───────────────────────
    const statusSelect = document.getElementById('approval-status');
    const statusDot = document.getElementById('status-indicator');
    // ─── E-Signature Validation Logic ───────────────────────
    const sigBox = document.getElementById('signature-box');
    const sigInput = document.getElementById('signature-upload');
    const sigRemove = document.getElementById('signature-remove');
    const sigSection = document.getElementById('signature-section');
    const btnSubmit = document.getElementById('btn-submit');
    const workflowStep = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? SYLLABUS_APPROVAL_DATA.workflowStep : '';

    function syncStatusColor() {
        if (!statusSelect || !statusDot) return;
        const val = statusSelect.value;
        statusDot.className = 'ad-status-indicator'; // reset
        
        if (val === 'Approved' || val === 'PC_Approved') {
            statusDot.classList.add('indicator-approved');
        } else if (val === 'Endorsed') {
            statusDot.classList.add('indicator-endorsed');
        } else if (val === 'Reject' || val === 'Returned') {
            statusDot.classList.add('indicator-returned');
        } else {
            statusDot.classList.add('indicator-pending');
        }

        // Conditional Logic for Program Chair Endorsement, Dean Approval, or HR Archiving
        if (btnSubmit && (workflowStep === 'endorsement' || workflowStep === 'approval' || workflowStep === 'archiving')) {
            const approveVal = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? (SYLLABUS_APPROVAL_DATA.optionApproveValue || 'PC_Approved') : 'PC_Approved';
            
            // Reset button styles initially
            btnSubmit.style.backgroundColor = '';
            btnSubmit.style.color = '';
            btnSubmit.textContent = workflowStep === 'endorsement' ? 'Endorse Syllabus' : 
                                    (workflowStep === 'archiving' ? 'Archive Syllabus' : 'Submit Approval');

            if (val === approveVal) {
                // APPROVE SYLLABUS CASE
                btnSubmit.style.backgroundColor = '#00875a'; // Green
                btnSubmit.style.color = '#ffffff';
                
                if (sigSection) sigSection.style.display = 'block';
                const hasFile = sigInput && sigInput.files && sigInput.files.length > 0;
                btnSubmit.disabled = !hasFile;
                btnSubmit.style.opacity = hasFile ? '1' : '0.5';
                btnSubmit.style.cursor = hasFile ? 'pointer' : 'not-allowed';

            } else if (val === 'Reject' || val === 'Rejected' || val === 'Returned' || val === 'Returned to PC') {
                // REJECT SYLLABUS CASE
                btnSubmit.textContent = val === 'Returned to PC' ? 'Return to PC' : 'Return to Faculty';
                btnSubmit.style.backgroundColor = '#d93025'; // Red
                btnSubmit.style.color = '#ffffff';

                if (sigSection) sigSection.style.display = 'none';
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = '1';
                btnSubmit.style.cursor = 'pointer';

            } else {
                // SELECT STATUS CASE (Default/Empty)
                if (sigSection) sigSection.style.display = 'none';
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = '0.5';
                btnSubmit.style.cursor = 'not-allowed';
            }
        }
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', syncStatusColor);
        syncStatusColor(); // set initial
    }



    if (sigBox && sigInput) {
        sigBox.addEventListener('click', () => sigInput.click());

        sigInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                 if (workflowStep === 'endorsement' && btnSubmit) {
                     const approveVal = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? (SYLLABUS_APPROVAL_DATA.optionApproveValue || 'PC_Approved') : 'PC_Approved';
                     if (statusSelect.value === approveVal) {
                         btnSubmit.disabled = true;
                         btnSubmit.style.opacity = '0.5';
                         btnSubmit.style.cursor = 'not-allowed';
                     }
                 }
                 const previewSection = document.getElementById('document-signature-section');
                 if (previewSection) previewSection.style.display = 'none';
                 return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                sigBox.innerHTML = `<img src="${ev.target.result}" alt="Signature" class="ad-signature-img">`;
                sigBox.appendChild(sigInput); // keep the hidden input in the DOM
                if (sigRemove) sigRemove.style.display = 'flex';
                
                // Update PDF Preview
                const previewSection = document.getElementById('document-signature-section');
                const previewImgContainer = document.getElementById('preview-signature-img-container');
                if (previewSection && previewImgContainer) {
                    previewImgContainer.innerHTML = `<img src="${ev.target.result}" alt="Signature" style="max-height: 100%; max-width: 100%; object-fit: contain;">`;
                    previewSection.style.display = 'block';
                }

                if ((workflowStep === 'endorsement' || workflowStep === 'approval') && btnSubmit) {
                    const approveVal = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? (SYLLABUS_APPROVAL_DATA.optionApproveValue || 'PC_Approved') : 'PC_Approved';
                    if (statusSelect.value === approveVal) {
                        btnSubmit.disabled = false;
                        btnSubmit.style.opacity = '1';
                        btnSubmit.style.cursor = 'pointer';
                    }
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // ─── Signature remove ──────────────────────────────────────────
    if (sigRemove) {
        sigRemove.addEventListener('click', () => {
            sigBox.innerHTML = '<span class="ad-signature-placeholder">Click to upload signature</span>';
            sigBox.appendChild(sigInput); // keep the hidden input in the DOM
            sigInput.value = ''; // clear file selection
            sigRemove.style.display = 'none';
            
            // Clear PDF Preview
            const previewSection = document.getElementById('document-signature-section');
            const previewImgContainer = document.getElementById('preview-signature-img-container');
            if (previewImgContainer) previewImgContainer.innerHTML = '';
            if (previewSection) previewSection.style.display = 'none';
            
            if ((workflowStep === 'endorsement' || workflowStep === 'approval') && btnSubmit) {
                const approveVal = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? (SYLLABUS_APPROVAL_DATA.optionApproveValue || 'PC_Approved') : 'PC_Approved';
                if (statusSelect.value === approveVal) {
                    btnSubmit.disabled = true;
                    btnSubmit.style.opacity = '0.5';
                    btnSubmit.style.cursor = 'not-allowed';
                }
            }
        });
    }

    // ─── Signatory Name Mirroring ──────────────────────────────────
    const signatoryInput = document.getElementById('signatory-name-input');
    const signatoryPreview = document.getElementById('preview-signatory-name');
    const userRole = typeof SYLLABUS_APPROVAL_DATA !== 'undefined' ? (SYLLABUS_APPROVAL_DATA.userRole || '') : '';

    if (signatoryPreview && (signatoryPreview.textContent.trim() === 'DEAN' || signatoryPreview.textContent.trim() === 'PROGRAM CHAIR' || signatoryPreview.textContent.trim() === 'HR ADMIN' || !signatoryPreview.textContent.trim())) {
        if (userRole === 'dean') signatoryPreview.textContent = 'DEAN';
        else if (userRole === 'hr') signatoryPreview.textContent = 'HR ADMIN';
        else signatoryPreview.textContent = 'PROGRAM CHAIR';
    }

    if (signatoryInput && signatoryPreview) {
        signatoryInput.addEventListener('input', (e) => {
            let defaultText = 'PROGRAM CHAIR';
            if (userRole === 'dean') defaultText = 'DEAN';
            else if (userRole === 'hr') defaultText = 'HR ADMIN';
            
            signatoryPreview.textContent = e.target.value.trim().toUpperCase() || defaultText;
        });
    }

    // ─── Save as PDF ───────────────────────────────────────
    const btnPdf = document.getElementById('btn-save-pdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            window.print();
        });
    }

    // ─── Save Draft ──────────────────────────────────────────
    const btnDraft = document.getElementById('btn-save-draft');
    if (btnDraft) {
        btnDraft.addEventListener('click', async () => {
            const syllabusId = SYLLABUS_APPROVAL_DATA.syllabusId;
            if (!syllabusId) {
                alert('No Syllabus loaded to save.');
                return;
            }

            const payload = {
                syllabusId,
                comment: document.getElementById('approval-comments')?.value || '',
                status: statusSelect?.value || 'Pending',
                action: 'draft'
            };

            try {
                const res = await fetch(SYLLABUS_APPROVAL_DATA.postUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert('Draft saved.');
                } else {
                    const text = await res.text();
                    alert('Draft save failed: ' + text);
                }
            } catch (err) {
                console.error('Draft error:', err);
                alert('An error occurred.');
            }
        });
    }

    // ─── Submit ────────────────────────────────────────────
    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            const syllabusId = SYLLABUS_APPROVAL_DATA.syllabusId;
            if (!syllabusId) {
                alert('No Syllabus loaded to submit.');
                return;
            }

            const status = statusSelect?.value || 'Pending';
            const comment = document.getElementById('approval-comments')?.value || '';
            const actionLabel = SYLLABUS_APPROVAL_DATA.actionLabel || 'submission';
            const signatoryName = document.getElementById('signatory-name-input')?.value || '';
            const signatureImg = document.querySelector('.ad-signature-img');

            // ─── Submission Confirmation ────────────────────────
            if (!confirm(`Are you sure you want to submit this ${actionLabel} as "${status}"?`)) return;

            const payload = {
                syllabusId,
                comment,
                status,
                signatoryName,
                signature: signatureImg ? signatureImg.src : null,
                action: 'submit'
            };

            try {
                const res = await fetch(SYLLABUS_APPROVAL_DATA.postUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert('Submitted successfully.');
                    window.location.href = SYLLABUS_APPROVAL_DATA.backUrl || '/syllabus';
                } else {
                    const text = await res.text();
                    alert('Submission failed: ' + text);
                }
            } catch (err) {
                console.error('Submit error:', err);
                alert('An error occurred while submitting.');
            }
        });
    }

});
