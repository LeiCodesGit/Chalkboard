/* ═══════════════════════════════════════════════════════════
   TLA Approval Page — Client-side JS
   Updated: Multi-step organizational approval chain
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    function getCurrentSignatureDataUrl() {
        const img = document.querySelector('#signature-box .signature-img');
        return img ? (img.getAttribute('src') || '') : '';
    }

    async function fetchCurrentApprovalPdfBlob() {
        const tlaID = APPROVAL_DATA.tlaID;
        if (!tlaID) throw new Error('No TLA loaded.');

        const data = new URLSearchParams({
            signatureImage: getCurrentSignatureDataUrl(),
            activeStep: APPROVAL_DATA.activeStep || ''
        });

        const res = await fetch(`/tla/approval/${tlaID}/preview-pdf`, { method: 'POST', body: data });
        if (!res.ok) throw new Error('Server returned ' + res.status);
        return res.blob();
    }

    // ─── Status / verdict indicator color sync ─────────────
    const statusSelect = document.getElementById('approval-status');
    const statusDot    = document.getElementById('status-indicator');

    function syncStatusColor() {
        if (!statusSelect || !statusDot) return;
        const val = statusSelect.value;
        statusDot.className = 'status-indicator';
        if (val === 'Approved')  statusDot.classList.add('indicator-approved');
        else if (val === 'Returned') statusDot.classList.add('indicator-returned');
        else if (val === 'Pending')  statusDot.classList.add('indicator-pending');
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', syncStatusColor);
        syncStatusColor();
    }

    // ─── Signature tab switching (Upload ↔ Draw) ──────────
    const tabUpload    = document.getElementById('sig-tab-upload');
    const tabDraw      = document.getElementById('sig-tab-draw');
    const panelUpload  = document.getElementById('sig-panel-upload');
    const panelDraw    = document.getElementById('sig-panel-draw');

    function switchSigTab(active) {
        // active: 'upload' | 'draw'
        const isUpload = active === 'upload';
        tabUpload?.classList.toggle('active', isUpload);
        tabDraw?.classList.toggle('active', !isUpload);
        if (panelUpload) panelUpload.style.display = isUpload ? '' : 'none';
        if (panelDraw)   panelDraw.style.display   = isUpload ? 'none' : '';
    }

    if (tabUpload) tabUpload.addEventListener('click', () => switchSigTab('upload'));
    if (tabDraw)   tabDraw.addEventListener('click',   () => switchSigTab('draw'));

    // ─── Signature upload ──────────────────────────────────
    const sigBox    = document.getElementById('signature-box');
    const sigInput  = document.getElementById('signature-upload');
    const sigRemove = document.getElementById('signature-remove');

    if (sigBox && sigInput) {
        sigBox.addEventListener('click', () => sigInput.click());
        sigInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                sigBox.innerHTML = `<img src="${ev.target.result}" alt="Signature" class="signature-img">`;
                sigBox.appendChild(sigInput);
                if (sigRemove) sigRemove.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }

    if (sigRemove) {
        sigRemove.addEventListener('click', () => {
            sigBox.innerHTML = '<span class="signature-placeholder">Click to upload signature</span>';
            sigBox.appendChild(sigInput);
            if (sigInput) sigInput.value = '';
            sigRemove.style.display = 'none';
        });
        if (sigBox && sigBox.querySelector('.signature-img')) {
            sigRemove.style.display = 'flex';
        }
    }

    // ─── Canvas draw signature ─────────────────────────────
    const canvas  = document.getElementById('sig-canvas');
    const btnClear   = document.getElementById('sig-canvas-clear');
    const btnConfirm = document.getElementById('sig-canvas-confirm');

    if (canvas) {
        const ctx = canvas.getContext('2d');
        let drawing = false;

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const src  = e.touches ? e.touches[0] : e;
            return {
                x: (src.clientX - rect.left) * (canvas.width  / rect.width),
                y: (src.clientY - rect.top)  * (canvas.height / rect.height)
            };
        }

        function startDraw(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
        function doDraw(e)    { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#0a1a3a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
        function stopDraw()   { drawing = false; }

        canvas.addEventListener('mousedown',  startDraw);
        canvas.addEventListener('mousemove',  doDraw);
        canvas.addEventListener('mouseup',    stopDraw);
        canvas.addEventListener('mouseleave', stopDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove',  doDraw,    { passive: false });
        canvas.addEventListener('touchend',   stopDraw);

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
        }

        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                const dataUrl = canvas.toDataURL('image/png');
                // Inject into signature-box so the existing save/submit flow picks it up
                if (sigBox) {
                    sigBox.innerHTML = `<img src="${dataUrl}" alt="Signature" class="signature-img">`;
                    sigBox.appendChild(sigInput);
                    if (sigRemove) sigRemove.style.display = 'flex';
                }
                // Switch back to upload tab to show the preview
                switchSigTab('upload');
            });
        }
    }

    // ─── Save as PDF (download generated PDF) ───────────────
    const btnPdf = document.getElementById('btn-save-pdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', async () => {
            try {
                const blob = await fetchCurrentApprovalPdfBlob();
                const url = URL.createObjectURL(blob);
                const tlaID = APPROVAL_DATA.tlaID || 'TLA';
                const a = document.createElement('a');
                a.href = url;
                a.download = `TLA_Approval_${tlaID}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
                showToast('PDF downloaded successfully.', 'success');
            } catch (err) {
                console.error('Save PDF failed:', err);
                showToast('Could not save PDF: ' + err.message, 'error');
            }
        });
    }

    // ─── Save as Draft ─────────────────────────────────────
    const btnDraft = document.getElementById('btn-save-draft');
    if (btnDraft) {
        btnDraft.addEventListener('click', async () => {
            const tlaID = APPROVAL_DATA.tlaID;
            if (!tlaID) { alert('No TLA loaded.'); return; }

            const payload = {
                comment: document.getElementById('approval-comments')?.value || '',
                signatureImage: getCurrentSignatureDataUrl(),
                action:  'draft'
            };

            try {
                const res = await fetch('/tla/approval/' + tlaID, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Draft saved successfully.', 'success');
                } else {
                    const text = await res.text();
                    showToast('Failed to save draft: ' + text, 'error');
                }
            } catch (err) {
                console.error('Save draft error:', err);
                showToast('An error occurred while saving the draft.', 'error');
            }
        });
    }

    // ─── Submit Verdict ────────────────────────────────────
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            const tlaID  = APPROVAL_DATA.tlaID;
            if (!tlaID) { alert('No TLA loaded.'); return; }

            const verdict  = statusSelect?.value || 'Approved';
            const comment  = document.getElementById('approval-comments')?.value || '';
            const stepLabel = {
                programChair: 'Program Chair Endorsement',
                dean:         "Dean's Approval",
                programChairPost: 'Program Chair Endorsement (Post-Digital)',
                deanPost:         "Dean's Approval (Post-Digital)",
                hr:           'HR/HRMO Review',
                vpaa:         'VPAA Final Approval'
            }[APPROVAL_DATA.activeStep] || 'Verdict';

            if (!confirm(`Submit "${verdict}" for ${stepLabel}?`)) return;

            const payload = {
                comment,
                verdict,
                signatureImage: getCurrentSignatureDataUrl(),
                action: 'submit'
            };

            try {
                const res = await fetch('/tla/approval/' + tlaID, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    showToast('Submitted successfully!', 'success');
                    setTimeout(() => {
                        window.location.href = '/admin/tla';
                    }, 1200);
                } else {
                    const text = await res.text();
                    showToast('Submission failed: ' + text, 'error');
                }
            } catch (err) {
                console.error('Submit error:', err);
                showToast('An error occurred while submitting.', 'error');
            }
        });
    }

    // ─── Toast notification helper ─────────────────────────
    function showToast(message, type = 'info') {
        let toast = document.getElementById('tla-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tla-toast';
            toast.style.cssText = `
                position: fixed; bottom: 24px; right: 24px;
                padding: 12px 22px; border-radius: 8px;
                font-size: 14px; font-weight: 600;
                box-shadow: 0 4px 16px rgba(0,0,0,0.25);
                z-index: 9999; transition: opacity 0.3s;
                color: #fff;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.background = type === 'success' ? '#1a7f4e'
                               : type === 'error'   ? '#a00100'
                               :                      '#002455';
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    }
});

/**
 * buildApprovalPdfPayload()
 * Not needed - we use GET endpoint with tlaID in URL
 */

/**
 * viewTLAApproval()
 * Opens the saved TLA PDF in a new browser tab
 * Uses the GET /tla/form/pdf-approval/:id endpoint which:
 * - Fetches complete faculty-filled TLA data
 * - Fetches all approval signatures (Chair, Dean)
 * - Renders full PDF with all data
 */
function viewTLAApproval() {
    const tlaID = APPROVAL_DATA.tlaID;
    if (!tlaID) {
        alert('No TLA loaded.');
        return;
    }

    const img = document.querySelector('#signature-box .signature-img');
    const signatureImage = img ? (img.getAttribute('src') || '') : '';

    const data = new URLSearchParams({
        signatureImage,
        activeStep: APPROVAL_DATA.activeStep || ''
    });

    fetch(`/tla/approval/${tlaID}/preview-pdf`, { method: 'POST', body: data })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');
            if (!win) {
                alert('Popup blocked. Please allow popups for this site to view the PDF.');
            }
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })
        .catch(err => {
            console.error('Approval preview failed:', err);
            alert('Could not preview document: ' + err.message);
        });
}
