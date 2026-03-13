/* ================================================================
   TLA Overview – Accordion Toggle
   File: public/TLA/js/overview.js
   ================================================================ */

/**
 * Toggles the expand/collapse state of a module accordion card.
 * @param {string} moduleId  - 'syllabus' | 'tla'
 */
function toggleModule(moduleId) {
    const body    = document.getElementById(moduleId + '-body');
    const chevron = document.getElementById(moduleId + '-chevron');

    if (!body || !chevron) return;

    const isExpanded = body.classList.contains('expanded');

    // Toggle body visibility
    body.classList.toggle('expanded', !isExpanded);

    // Rotate chevron when expanded
    chevron.classList.toggle('rotated', !isExpanded);
}
