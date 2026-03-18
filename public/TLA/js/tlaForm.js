document.addEventListener('DOMContentLoaded', function () {

    const form = document.getElementById('tla-form');
    if (form) {
        form.addEventListener('submit', function (e) {
            const clickedBtn = document.activeElement;
            const action = clickedBtn?.value || '';

            if (action === 'submit') {
                if (!confirm('Submit this TLA for approval? You will not be able to edit the pre-digital section while it is pending.')) {
                    e.preventDefault();
                }
            } else if (action === 'submit-post') {
                if (!confirm('Submit the post-digital session data?')) {
                    e.preventDefault();
                }
            }
        });
    }

    // ─── Signature upload handling (PNG only) ────────────────
    function setupSignatureBlock(prefix) {
        const input   = document.getElementById(prefix + '-sig-input');
        const area    = document.getElementById(prefix + '-sig-area');
        const errEl   = document.getElementById(prefix + '-sig-error');
        const removeBtn = document.getElementById(prefix + '-sig-remove');
        const sigFieldId = prefix === 'post' ? 'professorPostSignature' : 'professorPreSignature';

        if (!input || !area) return;

        // Clicking the area also opens the file picker
        area.addEventListener('click', function () {
            if (!input.disabled) input.click();
        });

        input.addEventListener('change', function () {
            const file = input.files[0];
            if (!file) return;

            // Validate PNG only
            if (file.type !== 'image/png') {
                if (errEl) {
                    errEl.textContent = 'Only PNG files are accepted for signatures.';
                    errEl.style.display = 'block';
                }
                input.value = '';
                return;
            }

            // Validate size (2 MB max)
            if (file.size > 2 * 1024 * 1024) {
                if (errEl) {
                    errEl.textContent = 'File too large. Maximum 2 MB.';
                    errEl.style.display = 'block';
                }
                input.value = '';
                return;
            }

            if (errEl) errEl.style.display = 'none';

            const reader = new FileReader();
            reader.onload = function (ev) {
                const dataUrl = ev.target.result;

                // Show preview
                area.innerHTML = '';
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = 'Signature';
                img.className = 'sig-preview-img';
                img.id = prefix + '-sig-preview';
                area.appendChild(img);
                area.appendChild(input); // re-attach hidden input

                if (removeBtn) removeBtn.style.display = 'inline-flex';

                const sigField = document.getElementById(sigFieldId);
                if (sigField) sigField.value = dataUrl;
                // Backward compatibility hidden field mirrors pre-signature
                const legacyField = document.getElementById('professorSignature');
                if (legacyField && prefix !== 'post') legacyField.value = dataUrl;

                // Upload PNG file to server via multipart endpoint
                const tlaId = document.querySelector('[name="_tlaId"]');
                if (tlaId && tlaId.value) {
                    var formData = new FormData();
                    formData.append('signatureFile', file);
                    formData.append('signatureType', prefix);

                    fetch('/tla/form/' + tlaId.value + '/signature-file', {
                        method: 'POST',
                        body: formData
                    })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (!data.success && errEl) {
                            errEl.textContent = data.error || 'Upload failed';
                            errEl.style.display = 'block';
                        }
                    })
                    .catch(function (err) {
                        console.error('Signature upload error:', err);
                    });
                }
            };
            reader.readAsDataURL(file);
        });

        // Remove button
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
            area.innerHTML = '<span class="sig-placeholder" id="' + prefix + '-sig-placeholder">Click to upload PNG signature</span>';
                area.appendChild(input);
                input.value = '';
                const sigField = document.getElementById(sigFieldId);
                if (sigField) sigField.value = '';
                const legacyField = document.getElementById('professorSignature');
                if (legacyField && prefix !== 'post') legacyField.value = '';
                removeBtn.style.display = 'none';
            });
        }
    }

    setupSignatureBlock('pre');
    setupSignatureBlock('post');

});


/**
 * printTLAForm()
 * POSTs the form values to the server, which fills the official .docx template
 * and returns it as a download. Open in Word and print to PDF for a
 * pixel-perfect copy of the real TLA document.
 */
function printTLAForm() {
    const v = (name) => {
        const el = document.querySelector(`[name="${name}"]`);
        return el ? (el.value || '').trim() : '';
    };

    const signaturePayload = {
        professorPreSignature: v('professorPreSignature'),
        professorPostSignature: v('professorPostSignature'),
        professorSignature: v('professorSignature')
    };

    const data = new URLSearchParams({
        _tlaId:                      v('_tlaId'),
        courseCode:                  v('courseCode'),
        section:                     v('section'),
        dateofDigitalDay:            v('dateofDigitalDay'),
        facultyFacilitating:         v('facultyFacilitating') || v('_name'),
        ...signaturePayload,
        courseOutcomes:              v('courseOutcomes'),
        mediatingOutcomes:           v('mediatingOutcomes'),
        pre_moIloCode:               v('pre_moIloCode'),
        pre_teacherLearningActivity: v('pre_teacherLearningActivity'),
        pre_lmsDigitalTool:          v('pre_lmsDigitalTool'),
        pre_assessment:              v('pre_assessment'),
        post_moIloCode:              v('post_moIloCode'),
        post_participantTurnout:     v('post_participantTurnout'),
        post_assessmentResults:      v('post_assessmentResults'),
        post_remarks:                v('post_remarks'),
    });

    fetch('/tla/form/generate-docx', { method: 'POST', body: data })
        .then(res => {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = 'TLA_Report.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })
        .catch(err => {
            console.error('Download failed:', err);
            alert('Could not download document: ' + err.message);
        });
}

function buildPdfPayload() {
    const v = (name) => {
        const el = document.querySelector(`[name="${name}"]`);
        return el ? (el.value || '').trim() : '';
    };

    const signaturePayload = {
        professorPreSignature: v('professorPreSignature'),
        professorPostSignature: v('professorPostSignature'),
        professorSignature: v('professorSignature')
    };

    return new URLSearchParams({
        _tlaId:                      v('_tlaId'),
        courseCode:                  v('courseCode'),
        section:                     v('section'),
        dateofDigitalDay:            v('dateofDigitalDay'),
        facultyFacilitating:         v('facultyFacilitating') || v('_name'),
        ...signaturePayload,
        courseOutcomes:              v('courseOutcomes'),
        mediatingOutcomes:           v('mediatingOutcomes'),
        pre_moIloCode:               v('pre_moIloCode'),
        pre_teacherLearningActivity: v('pre_teacherLearningActivity'),
        pre_lmsDigitalTool:          v('pre_lmsDigitalTool'),
        pre_assessment:              v('pre_assessment'),
        post_moIloCode:              v('post_moIloCode'),
        post_participantTurnout:     v('post_participantTurnout'),
        post_assessmentResults:      v('post_assessmentResults'),
        post_remarks:                v('post_remarks')
    });
}

/**
 * viewTLAForm()
 * Builds an inline PDF preview in a new browser tab, similar to ATA preview flow.
 */
function viewTLAForm() {
    const data = buildPdfPayload();

    fetch('/tla/form/preview-pdf', { method: 'POST', body: data })
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
            console.error('Preview failed:', err);
            alert('Could not preview document: ' + err.message);
        });
}
