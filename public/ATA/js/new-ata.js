document.addEventListener('DOMContentLoaded', () => {
  // ====================================================================
  // 1. STRICT PRE-SUBMISSION VALIDATION
  // ====================================================================
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
      // 'true' ensures we intercept the click BEFORE ata_client.js does!
      nextBtn.addEventListener('click', (e) => {
          
          if (nextBtn.innerText.toLowerCase().includes('submit')) {
              
              // Gather required fields
              const name = document.getElementById('facultyName')?.value.trim();
              const address = document.getElementById('address')?.value.trim();
              const empStatus = document.getElementById('employmentStatus')?.value;
              const term = document.getElementById('term')?.value;
              const year = document.getElementById('academicYear')?.value.trim();
              const totalUnits = parseFloat(document.getElementById('grandTotalUnits')?.innerText || "0");
              const remedialUnits = parseFloat(document.getElementById('sumEffG')?.innerText || "0");
              
              const isPartTime = document.getElementById('radioPartTime')?.checked;

              let errors = [];
              if (!name) errors.push("Name");
              if (!address) errors.push("Address");
              if (!empStatus) errors.push("Employment Status");
              if (!term) errors.push("Academic Term");
              if (!year) errors.push("Academic Year");

              // 👇 STRICT VALIDATION: Require Outside Employment if Part-Time
              if (isPartTime) {
                  let hasEmployment = false;
                  // Uses #form4 directly to guarantee it finds the rows
                  document.querySelectorAll('#form4 .employment-row').forEach(row => {
                      const inputs = row.querySelectorAll('input');
                      if (inputs[0] && inputs[0].value.trim() !== '') hasEmployment = true;
                      if (inputs[1] && inputs[1].value.trim() !== '') hasEmployment = true;
                  });
                  if (!hasEmployment) {
                      errors.push("Outside Employment Details (Required for Part-Time Faculty)");
                  }
              }

              // Trigger Error Alert
              if (errors.length > 0) {
                  alert("Submission Blocked: Please fill out the following required fields:\n- " + errors.join('\n- '));
                  e.stopImmediatePropagation(); // Kills the submission event instantly
                  return false;
              }

              // 👇 UPDATED: Block 0 Units (Unless they have Remedial Modules!)
              if (totalUnits === 0 && remedialUnits === 0) {
                  alert("Submission Blocked: You must assign at least one regular course or remedial module before submitting.");
                  e.stopImmediatePropagation(); 
                  return false;
              }
              
              // If everything passes, clear the auto-save so a fresh form loads next time!
              localStorage.removeItem('ata_auto_save');
          }
      }, true); 
  }
  // ====================================================================
  // 2. BULLETPROOF DOM-ARRAY AUTO-SAVE ENGINE
  // ====================================================================
  const storageKey = 'ata_auto_save';

  function saveToLocal() {
      const data = { inputs: [], radios: {}, rowCounts: {} };
      
      // 1. Memorize exactly how many rows exist in every single section based on DOM structure
      data.rowCounts.B = document.querySelectorAll('#form2 .form-row:nth-child(1) .course-row').length || 1;
      data.rowCounts.C = document.querySelectorAll('#form2 .form-row:nth-child(2) .course-row').length || 1;
      data.rowCounts.D = document.querySelectorAll('#form3 .form-row:nth-child(1) .admin-row').length || 1;
      data.rowCounts.E = document.querySelectorAll('#form3 .form-row:nth-child(2) .practicum-row').length || 1;
      data.rowCounts.F = document.querySelectorAll('#form4 .employment-row').length || 1;
      data.rowCounts.G = document.querySelectorAll('#form5 .remedial-row').length || 1;

      // 2. Serialize all inputs dynamically in exact top-to-bottom DOM order
      document.querySelectorAll('.form-input, .table-input, textarea').forEach((input) => {
          if (input.type !== 'password' && input.type !== 'file') {
              data.inputs.push(input.value);
          }
      });
      
      // 3. Save Radios
      document.querySelectorAll('input[type="radio"]').forEach((radio) => {
          if (radio.checked) {
              data.radios[radio.name] = radio.value;
          }
      });

      localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function restoreFromLocal() {
      // Abort auto-save restore if they are editing a formal Draft from the database
      if (document.getElementById('existingDraftId')) return;

      const saved = localStorage.getItem(storageKey);
      if (saved) {
          try {
              const data = JSON.parse(saved);
              
              // 1. Ghost click "+ Add" buttons to rebuild HTML structure FIRST
              const rebuildRows = (containerSelector, rowSelector, targetCount) => {
                  const container = document.querySelector(containerSelector);
                  if(!container) return;
                  let currentCount = container.querySelectorAll(rowSelector).length;
                  const addBtn = container.querySelector('.secondary-btn');
                  while(currentCount < targetCount && addBtn) {
                      addBtn.click();
                      currentCount++;
                  }
              };

              if (data.rowCounts) {
                  rebuildRows('#form2 .form-row:nth-child(1)', '.course-row', data.rowCounts.B);
                  rebuildRows('#form2 .form-row:nth-child(2)', '.course-row', data.rowCounts.C);
                  rebuildRows('#form3 .form-row:nth-child(1)', '.admin-row', data.rowCounts.D);
                  rebuildRows('#form3 .form-row:nth-child(2)', '.practicum-row', data.rowCounts.E);
                  rebuildRows('#form4', '.employment-row', data.rowCounts.F);
                  rebuildRows('#form5', '.remedial-row', data.rowCounts.G);
              }

              // 2. Pour the data back into the exact identical boxes
              if (data.inputs && data.inputs.length > 0) {
                  const allInputs = document.querySelectorAll('.form-input, .table-input, textarea');
                  allInputs.forEach((input, index) => {
                      if (data.inputs[index] !== undefined) {
                          input.value = data.inputs[index];
                      }
                  });
              }

              // 3. Restore Radios and WAKE UP the Part-Time UI
              if (data.radios) {
                  document.querySelectorAll('input[type="radio"]').forEach((radio) => {
                      if (data.radios[radio.name] === radio.value) {
                          // 🔥 Instead of just setting true, we forcefully CLICK it to wake up ata_client.js!
                          radio.click(); 
                      }
                  });
              }
              
              // 4. Force Math Engine Recalculation
              setTimeout(() => {
                  document.querySelectorAll('.table-input').forEach(el => {
                      if(el.value) el.dispatchEvent(new Event('input', { bubbles: true }));
                  });
              }, 300);

          } catch (err) {
              console.error('Failed to parse saved ATA auto-save data.', err);
          }
      }
  }

    // Save on literally any input or change event
    document.addEventListener('input', saveToLocal);
    document.addEventListener('change', saveToLocal);
    document.addEventListener('click', (e) => {
        if (e.target.closest('.secondary-btn') || e.target.closest('.remove-btn')) {
            setTimeout(saveToLocal, 100); // Save state when rows are added/removed
        }
    });

    // Run the restorer on page load
    restoreFromLocal();
});

document.addEventListener('DOMContentLoaded', () => {
    // Force remove "ATA form:" from the main title dynamically
    const titleH1 = document.querySelector('#formTitle h1');
    if (titleH1) {
        const stripTitle = () => {
            if (titleH1.innerText.includes('ATA form:')) {
                titleH1.innerText = titleH1.innerText.replace('ATA form:', '').trim();
            }
        };
        stripTitle(); 
        const observer = new MutationObserver(stripTitle);
        observer.observe(titleH1, { childList: true, characterData: true, subtree: true });
    }

    // Eradicate the ugly native browser tooltips injected by ata_client.js
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach(dot => {
          dot.removeAttribute('title'); 
          const dotObserver = new MutationObserver((mutations) => {
              mutations.forEach(mutation => {
                  if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
                      dot.removeAttribute('title');
                  }
              });
          });
        dotObserver.observe(dot, { attributes: true });
    });
});