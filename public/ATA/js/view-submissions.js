document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('smartDownloadBtn');
  
  if (downloadBtn) {
      downloadBtn.addEventListener('click', async function() {
          const btn = this;
          const icon = document.getElementById('downloadIcon');
          const text = document.getElementById('downloadText');
          const formId = btn.getAttribute('data-form-id');
          const safeName = btn.getAttribute('data-safe-name');

          // 1. Turn on the loading state
          btn.disabled = true;
          btn.style.opacity = '0.7';
          btn.style.cursor = 'not-allowed';
          icon.className = 'fas fa-spinner fa-spin';
          text.innerText = 'Generating...';

          try {
              // 2. Fetch the PDF in the background
              const response = await fetch(`/ata/pdf/${formId}`);
              if (!response.ok) throw new Error('Download failed');
              
              // 3. Convert it to a blob and force the browser to save it
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = url;
              a.download = `ATA_${safeName}.pdf`;
              document.body.appendChild(a);
              a.click();
              
              // Clean up memory
              window.URL.revokeObjectURL(url);
              a.remove();
              
          } catch (error) {
              console.error("Error downloading PDF:", error);
              alert("Failed to download PDF. Please check your connection and try again.");
          } finally {
              // 4. Turn the loading state back off!
              btn.disabled = false;
              btn.style.opacity = '1';
              btn.style.cursor = 'pointer';
              icon.className = 'fas fa-download';
              text.innerText = 'Download PDF';
          }
      });
  }
});