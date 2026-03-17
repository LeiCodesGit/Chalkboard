/* ═══════════════════════════════════════════════════════════
   TLA Approval Page — Client-side JS
   Updated: Multi-step organizational approval chain
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

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

    // ─── Save as PDF (browser print) ───────────────────────
    const btnPdf = document.getElementById('btn-save-pdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => window.print());
    }

    // ─── Save as Draft ─────────────────────────────────────
    const btnDraft = document.getElementById('btn-save-draft');
    if (btnDraft) {
        btnDraft.addEventListener('click', async () => {
            const tlaID = APPROVAL_DATA.tlaID;
            if (!tlaID) { alert('No TLA loaded.'); return; }

            const payload = {
                comment: document.getElementById('approval-comments')?.value || '',
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
                technical:    'Technical Assessment',
                programChair: 'Program Chair Approval',
                dean:         "Dean's Approval",
                hr:           'HR Archival'
            }[APPROVAL_DATA.activeStep] || 'Verdict';

            if (!confirm(`Submit "${verdict}" for ${stepLabel}?`)) return;

            const payload = {
                comment,
                verdict,
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
                        window.location.href = '/tla/admin-overview';
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


});
