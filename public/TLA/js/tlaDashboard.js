function showToast(message, type = 'success') {
    const existing = document.querySelector('.tla-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `tla-toast tla-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('tla-toast--visible'));
    setTimeout(() => {
        toast.classList.remove('tla-toast--visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createTLA() {
    window.location.href = '/tla/form';
}

function openTLA(id) {
    window.location.href = `/tla/form/${id}`;
}

async function updateApprovalStatus(tlaID, newStatus, remarks = '') {
    try {
        const findRes = await fetch(`/api/tla/approval/tla/${tlaID}`);
        if (!findRes.ok) throw new Error('Approval record not found');
        const approval = await findRes.json();

        const res = await fetch(`/api/tla/approval/${approval._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: newStatus,
                remarks,
                approvedBy: '',
                approvalDate: new Date().toISOString()
            })
        });

        if (!res.ok) throw new Error((await res.json()).message || 'Update failed');
        showToast(`Status updated to ${newStatus}`);
        return true;
    } catch (err) {
        showToast(err.message, 'error');
        return false;
    }
}

async function deleteTLA(id, weekLabel) {
    const confirmed = confirm(
        `Delete "${weekLabel}"?\n\nThis will permanently remove the TLA form and all related pre/post-digital session data. This cannot be undone.`
    );
    if (!confirmed) return;

    const card = document.querySelector(`[data-tla-id="${id}"]`);
    if (card) {
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
    }

    try {
        const res = await fetch(`/api/tla/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Delete failed');

        showToast('TLA deleted successfully');

        if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.transform = 'scale(0)';
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                checkEmpty();
            }, 300);
        }
    } catch (err) {
        if (card) {
            card.style.opacity = '';
            card.style.pointerEvents = '';
        }
        showToast(err.message, 'error');
    }
}

function checkEmpty() {
    const wrapper = document.querySelector('.weekly-rpt-wrapper');
    const hasCards = wrapper.querySelectorAll('[data-tla-id]').length > 0;
    let emptyMsg = wrapper.querySelector('.no-tla-msg');

    if (!hasCards && !emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'no-tla-msg';
        emptyMsg.innerHTML = '<p>No TLA forms yet. <a href="/tla/form">Create your first one</a>.</p>';
        wrapper.insertBefore(emptyMsg, wrapper.querySelector('.week-btn--new')?.parentElement);
    }
}

document.addEventListener('DOMContentLoaded', function () {

    document.querySelectorAll('.tla-delete-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const id    = this.dataset.id;
            const label = this.dataset.label;
            deleteTLA(id, label);
        });
    });

    document.querySelectorAll('.tla-edit-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            openTLA(this.dataset.id);
        });
    });

});
