document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        if (localStorage.getItem('theme') === 'dark-mode') {
            document.body.classList.add('dark-mode');
            toggleBtn.textContent = 'Light Mode';
        }
        toggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
   
            toggleBtn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
          
            localStorage.setItem('theme', isDark ? 'dark-mode' : 'light-mode');
        });
    }
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.sidebar-menu a');
    
    menuLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.style.opacity = '1';
            link.style.fontWeight = '700';
            link.style.borderLeft = '3px solid white';
            link.style.paddingLeft = '10px';
        }
    });
});