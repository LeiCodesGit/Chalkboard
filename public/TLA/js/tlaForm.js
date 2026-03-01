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

    document.querySelectorAll('.attach-btn:not([disabled])').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf';
            input.onchange = function (e) {
                const file = e.target.files[0];
                if (file) {
                    btn.textContent = '\uD83D\uDCCE ' + file.name;
                }
            };
            input.click();
        });
    });

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

    const data = new URLSearchParams({
        courseCode:                  v('courseCode'),
        section:                     v('section'),
        dateofDigitalDay:            v('dateofDigitalDay'),
        facultyFacilitating:         v('facultyFacilitating') || v('_name'),
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
