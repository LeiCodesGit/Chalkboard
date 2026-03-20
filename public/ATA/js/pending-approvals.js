document.addEventListener('DOMContentLoaded', () => {
    // --- Live Search Logic ---
    const searchInput = document.getElementById('facultySearchInput');
    const tableRows = document.querySelectorAll('#approvalsTable tbody .data-row');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            
            tableRows.forEach(row => {
                const nameCell = row.querySelector('.searchable-name');
                if (nameCell) {
                    const nameText = nameCell.textContent.toLowerCase().trim();
                    if (nameText.includes(query)) {
                        row.style.display = ''; 
                    } else {
                        row.style.display = 'none'; 
                    }
                }
            });
        });
    }

    // --- Signature Modal Logic ---
    const overlay = document.getElementById('sigModalOverlay');
    const openBtn = document.getElementById('openSignatureModal');
    const closeBtn = document.getElementById('closeVipSigBtn');
    const clearBtn = document.getElementById('clearVipSigBtn');
    const saveBtn = document.getElementById('saveVipSigBtn');
    const previewBtn = document.getElementById('previewVipSigBtn');
    const canvas = document.getElementById('vipSignatureCanvas');
    const deleteBtn = document.getElementById('deleteVipSigBtn');
    
    let signaturePad;
    
    // 👇 EJS TRAPS REMOVED! Now securely reading from HTML data attributes
    let effectiveRole = document.body.getAttribute('data-role') || 'Admin';
    const isPracticumCoord = document.body.getAttribute('data-practicum') === 'true';
    const userSig = document.body.getAttribute('data-user-sig') || '';
    
    if (isPracticumCoord && !['Program-Chair', 'Dean', 'VPAA'].includes(effectiveRole)) {
        effectiveRole = 'Practicum-Coordinator';
    }

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            overlay.style.display = 'flex';
            if (!signaturePad && typeof SignaturePad !== 'undefined') {
                signaturePad = new SignaturePad(canvas, { penColor: "rgb(0, 0, 0)", backgroundColor: "rgba(0,0,0,0)" });
            }
        });
    }

    if(closeBtn) closeBtn.addEventListener('click', () => overlay.style.display = 'none');
    if(clearBtn) clearBtn.addEventListener('click', () => { if (signaturePad) signaturePad.clear(); });
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to completely delete your saved e-signature?")) return;
            
            const origText = deleteBtn.innerHTML;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            deleteBtn.disabled = true;

            try {
                const response = await fetch('/ata/settings/signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signatureImage: "" }) 
                });

                if (response.ok) {
                    alert("Signature successfully deleted from your Vault.");
                    location.reload(); 
                } else {
                    alert("Failed to delete signature.");
                    deleteBtn.innerHTML = origText;
                    deleteBtn.disabled = false;
                }
            } catch (error) {
                alert("Network error occurred.");
                deleteBtn.innerHTML = origText;
                deleteBtn.disabled = false;
            }
        });
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', async () => {
            // 👇 Safe userSig variable used here
            const sigToPreview = (signaturePad && !signaturePad.isEmpty()) ? signaturePad.toDataURL("image/png") : userSig;
            
            if (!sigToPreview) {
                alert("Please draw a signature first to preview it!");
                return;
            }

            const origText = previewBtn.innerHTML;
            previewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            previewBtn.disabled = true;

            try {
                const response = await fetch('/ata/preview-vip-signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signatureImage: sigToPreview, role: effectiveRole })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    window.open(URL.createObjectURL(blob), '_blank');
                } else {
                    const errorMsg = await response.text();
                    alert("Preview failed: " + errorMsg);
                }
            } catch (error) {
                alert("Network error occurred.");
            } finally {
                previewBtn.innerHTML = origText;
                previewBtn.disabled = false;
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!signaturePad || signaturePad.isEmpty()) {
                alert("Please draw a signature before saving!");
                return;
            }

            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const response = await fetch('/ata/settings/signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signatureImage: signaturePad.toDataURL("image/png") })
                });

                const responseData = await response.json().catch(() => ({})); 

                if (response.ok) {
                    alert("Signature saved securely to your Vault!");
                    location.reload(); 
                } else {
                    alert("Server Rejected Save:\n" + (responseData.error || response.statusText || "Unknown Error"));
                }
            } catch (error) {
                alert("Network error occurred.");
            } finally {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Signature';
                saveBtn.disabled = false;
            }
        });
    }

    const mainPreviewBtn = document.getElementById('mainPreviewSigBtn');
    const mainDeleteBtn = document.getElementById('mainDeleteSigBtn');

    if (mainPreviewBtn) {
        mainPreviewBtn.addEventListener('click', async () => {
            const origText = mainPreviewBtn.innerHTML;
            mainPreviewBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            mainPreviewBtn.disabled = true;

            try {
                // 👇 Safe userSig variable used here again
                const response = await fetch('/ata/preview-vip-signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signatureImage: userSig, role: effectiveRole })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    window.open(URL.createObjectURL(blob), '_blank');
                } else {
                    alert("Preview failed: " + await response.text());
                }
            } catch (error) {
                alert("Network error occurred.");
            } finally {
                mainPreviewBtn.innerHTML = origText;
                mainPreviewBtn.disabled = false;
            }
        });
    }

    if (mainDeleteBtn) {
        mainDeleteBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to completely delete your saved e-signature?")) return;
            
            const origText = mainDeleteBtn.innerHTML;
            mainDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            mainDeleteBtn.disabled = true;

            try {
                const response = await fetch('/ata/settings/signature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signatureImage: "" }) 
                });

                if (response.ok) {
                    alert("Signature successfully deleted from your Vault.");
                    location.reload(); 
                } else {
                    alert("Failed to delete signature.");
                    mainDeleteBtn.innerHTML = origText;
                    mainDeleteBtn.disabled = false;
                }
            } catch (error) {
                alert("Network error occurred.");
                mainDeleteBtn.innerHTML = origText;
                mainDeleteBtn.disabled = false;
            }
        });
    }
});

function toggleHistory(btn) {
    const td = btn.closest('td');
    const hiddenItems = td.querySelectorAll('.hidden-track');
    const textSpan = btn.querySelector('.toggle-txt');
    const icon = btn.querySelector('i');

    const isHidden = hiddenItems[0].style.display === 'none';

    hiddenItems.forEach(item => {
        item.style.display = isHidden ? 'flex' : 'none';
    });

    if (isHidden) {
        textSpan.innerText = 'Show Less';
        icon.className = 'fas fa-chevron-up';
    } else {
        textSpan.innerText = `View ${hiddenItems.length} older actions`;
        icon.className = 'fas fa-chevron-down';
    }
}