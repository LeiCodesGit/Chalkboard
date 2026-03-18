document.addEventListener('DOMContentLoaded', () => {
    const btnApprove = document.getElementById('btnSmartApprove');
    const btnReturn = document.getElementById('btnReturn');
    
    const justificationInput = document.getElementById('justificationInput');
    const justificationLabel = document.getElementById('justificationLabel');
    
    const currentRole = document.body.getAttribute('data-role');
    const formStatus = document.body.getAttribute('data-status');
    const formId = document.body.getAttribute('data-form-id'); 
    const totalLoad = Number(document.body.getAttribute('data-load')) || 0;
    const facEmployment = document.body.getAttribute('data-fac-employment') || 'Full-Time';
    const hasSignature = document.body.getAttribute('data-has-signature') === 'true';
    
    const hasPracticum = document.body.getAttribute('data-has-practicum') === 'true'; 
    const isPracticumCoord = document.body.getAttribute('data-practicum') === 'true'; 
    
    const overloadLimit = facEmployment === 'Part-Time' ? 11 : 15;
    const isOverloaded = totalLoad > overloadLimit;

    let activeBtnText = "Endorse / Approve"; 
    let actionToSend = "";

    if (formStatus === 'PENDING_PRACTICUM' && isPracticumCoord) {
        activeBtnText = "Validate";
        actionToSend = "VALIDATE";
    } else if (currentRole === 'Program-Chair') {
        activeBtnText = hasPracticum ? "Endorse to Practicum" : "Endorse to Dean";
        actionToSend = "ENDORSE";
    } else if (currentRole === 'Dean') {
        activeBtnText = "Approve";
        actionToSend = "APPROVE";
    } else if (currentRole === 'VPAA') {
        activeBtnText = "Note";
        actionToSend = "NOTE";
    } else if (currentRole === 'HR' || currentRole === 'HRMO') {
        activeBtnText = "Finalize";
        actionToSend = "NOTE"; 
    }

    const updateButtonState = () => {
        if (!hasSignature) {
            btnApprove.style.backgroundColor = '#6c757d'; 
            btnApprove.style.cursor = 'not-allowed';
            btnApprove.innerHTML = `<i class="fas fa-signature"></i> Setup E-Signature First`;
            btnApprove.style.pointerEvents = 'none';
            return; 
        }

        // If Overloaded, display the explicit Justification input box
        if (currentRole === 'Program-Chair' && formStatus === 'PENDING_CHAIR' && isOverloaded) {
            justificationLabel.style.display = 'block';
            justificationInput.style.display = 'block';
            
            if (justificationInput.value.trim().length < 5) {
                btnApprove.style.backgroundColor = '#6c757d'; 
                btnApprove.style.cursor = 'not-allowed';
                btnApprove.innerHTML = `<i class="fas fa-lock"></i> Add Justification to Endorse`;
                btnApprove.style.pointerEvents = 'none'; 
            } else {
                btnApprove.style.backgroundColor = '#28a745'; 
                btnApprove.style.cursor = 'pointer';
                btnApprove.innerHTML = `<i class="fas fa-check"></i> ${activeBtnText}`;
                btnApprove.style.pointerEvents = 'auto'; 
            }
            return; 
        }

        btnApprove.style.backgroundColor = '#28a745';
        btnApprove.style.cursor = 'pointer';
        btnApprove.innerHTML = `<i class="fas fa-check"></i> ${activeBtnText}`;
        btnApprove.style.pointerEvents = 'auto'; 
    };

    updateButtonState();
    if (justificationInput) justificationInput.addEventListener('input', updateButtonState);

    // ==========================================
    // ENDORSE / APPROVE LOGIC
    // ==========================================
    btnApprove.addEventListener('click', async () => {
        if (!actionToSend) return alert("System could not determine the correct action for your role.");

        const origText = btnApprove.innerHTML;
        btnApprove.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btnApprove.style.pointerEvents = 'none';

        let finalRemarks = "Form Endorsed/Approved";
        if (justificationInput && justificationInput.style.display !== 'none' && justificationInput.value.trim() !== '') {
            finalRemarks = justificationInput.value.trim();
        }

        try {
            const response = await fetch(`/ata/approve/${formId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: actionToSend, 
                    remarks: finalRemarks 
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const rawText = await response.text();
                console.error("SERVER RETURNED NON-JSON:", rawText);
                alert("CRITICAL ERROR: Server did not return JSON data. Check the terminal console!");
                btnApprove.innerHTML = origText;
                btnApprove.style.pointerEvents = 'auto';
                return;
            }

            const result = await response.json();

            if (response.ok) {
                if (result.stayOnPage) {
                    alert("Endorsed as Chair!\n\nThe system detected you are also the Practicum Coordinator for this form. The page will now refresh so you can Validate it.");
                    location.reload(); 
                } else {
                    window.location.href = '/ata/pending'; 
                }
            } else {
                alert("Error: " + (result.error || "Failed to process."));
                btnApprove.innerHTML = origText;
                btnApprove.style.pointerEvents = 'auto';
            }
        } catch (error) {
            console.error("FETCH ERROR:", error);
            alert("A fatal network error occurred! Error: " + error.message);
            btnApprove.innerHTML = origText;
            btnApprove.style.pointerEvents = 'auto';
        }
    });

    // ==========================================
    // RETURN LOGIC (Now uses a secure Prompt)
    // ==========================================
    if (btnReturn) {
        btnReturn.addEventListener('click', async () => {
            const reason = prompt("Please enter the reason for returning this form to the faculty:");
            
            if (!reason || reason.trim().length < 5) {
                return alert("Return cancelled: A valid reason is required.");
            }
            
            const origText = btnReturn.innerHTML;
            btnReturn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Returning...';
            btnReturn.style.pointerEvents = 'none';

            try {
                // 👇 TRAP REMOVED: Now uses ${formId} dynamically!
                const response = await fetch(`/ata/approve/${formId}`, {
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'RETURN', remarks: reason, justification: "" })
                });
                if (response.ok) window.location.href = '/ata/pending';
                else alert("Failed to return form.");
            } catch (error) { alert("Network error."); }
            finally { btnReturn.innerHTML = origText; btnReturn.style.pointerEvents = 'auto'; }
        });
    }
});