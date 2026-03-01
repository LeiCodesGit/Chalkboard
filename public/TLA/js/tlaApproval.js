/* ═══════════════════════════════════════════════════════════
   TLA Approval Page — Client-side JS
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ─── Status indicator color sync ───────────────────────
    const statusSelect = document.getElementById('approval-status');
    const statusDot    = document.getElementById('status-indicator');

    function syncStatusColor() {
        if (!statusSelect || !statusDot) return;
        const val = statusSelect.value;
        statusDot.className = 'status-indicator'; // reset
        if (val === 'Approved')  statusDot.classList.add('indicator-approved');
        else if (val === 'Returned') statusDot.classList.add('indicator-returned');
        else if (val === 'Pending')  statusDot.classList.add('indicator-pending');
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', syncStatusColor);
        syncStatusColor(); // set initial
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
                sigBox.appendChild(sigInput); // keep the hidden input in the DOM
                if (sigRemove) sigRemove.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }

    // ─── Signature remove ──────────────────────────────────────────
    if (sigRemove) {
        sigRemove.addEventListener('click', () => {
            sigBox.innerHTML = '<span class="signature-placeholder">Click to upload signature</span>';
            sigBox.appendChild(sigInput); // keep the hidden input in the DOM
            sigInput.value = ''; // clear file selection
            sigRemove.style.display = 'none';
        });

        // Show remove button if a signature is already loaded
        if (sigBox && sigBox.querySelector('.signature-img')) {
            sigRemove.style.display = 'flex';
        }
    }

    // ─── Save as PDF ───────────────────────────────────────
    const btnPdf = document.getElementById('btn-save-pdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            // For now, use the browser print-to-PDF
            // Future: POST to a server endpoint to generate a proper PDF
            window.print();
        });
    }

    // ─── Save as Draft ─────────────────────────────────────
    const btnDraft = document.getElementById('btn-save-draft');
    if (btnDraft) {
        btnDraft.addEventListener('click', async () => {
            const tlaID = APPROVAL_DATA.tlaID;
            if (!tlaID) {
                alert('No TLA loaded to save.');
                return;
            }

            const payload = {
                tlaID,
                comment: document.getElementById('approval-comments')?.value || '',
                status:  statusSelect?.value || 'Pending',
                action:  'draft'
            };

            try {
                const res = await fetch('/tla/approval/' + tlaID, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert('Draft saved successfully.');
                } else {
                    const text = await res.text();
                    alert('Failed to save draft: ' + text);
                }
            } catch (err) {
                console.error('Save draft error:', err);
                alert('An error occurred while saving the draft.');
            }
        });
    }

    // ─── Submit ────────────────────────────────────────────
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            const tlaID = APPROVAL_DATA.tlaID;
            if (!tlaID) {
                alert('No TLA loaded to submit.');
                return;
            }

            const status  = statusSelect?.value || 'Pending';
            const comment = document.getElementById('approval-comments')?.value || '';

            if (!confirm(`Are you sure you want to submit this TLA as "${status}"?`)) return;

            const payload = {
                tlaID,
                comment,
                status,
                action: 'submit'
            };

            try {
                const res = await fetch('/tla/approval/' + tlaID, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert('Submitted successfully.');
                    window.location.href = '/tla/overview';
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
