document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("projectModal");
    const btn = document.querySelector(".btn-proj-overview");
    const closeSpan = document.querySelector(".close-btn");

    if (btn && modal) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = "block";
        });
    }

    if (closeSpan) {
        closeSpan.addEventListener('click', () => {
            modal.style.display = "none";
        });
    }

    // Close via clicking the dark background overlay
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });
});