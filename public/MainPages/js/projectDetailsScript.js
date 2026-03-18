<<<<<<< HEAD
document.addEventListener('DOMContentLoaded', () => {
    const modal    = document.getElementById('projectModal');
    const openBtn  = document.querySelector('.btn-proj-overview');
    const closeBtn = document.querySelector('.close-btn');

    if (!modal) return;

    function openModal() {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }

    if (openBtn)  openBtn.addEventListener('click',  e => { e.preventDefault(); openModal(); });
    if (closeBtn) closeBtn.addEventListener('click',  closeModal);

    // Click the dark backdrop to close
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Escape key to close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
});
=======
>>>>>>> 398c390 (Better Text Editor)

(function () {
'use strict';

/* ============================================================
   ELEMENTS
============================================================ */
const editor      = document.getElementById('rteContent');
const hiddenArea  = document.getElementById('messageDetailField');
const wordCountEl = document.getElementById('wordCount');

/* ============================================================
   SELECTION HELPERS
============================================================ */
let savedRange = null;

function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
}

function restoreSelection() {
    editor.focus();
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
}

function getAnchorNode() {
    const sel = window.getSelection();
    return sel ? sel.anchorNode : null;
}

/* Walk up DOM until direct child of editor, or until we hit editor itself */
function getBlockInEditor(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node.parentNode !== editor) {
        if (node === editor) return null;
        node = node.parentNode;
    }
    return node !== editor ? node : null;
}

function getAncestor(node, tagName) {
    while (node && node !== editor) {
        if (node.nodeName === tagName) return node;
        node = node.parentNode;
    }
    return null;
}

/* ============================================================
   WORD COUNT
============================================================ */
function updateWordCount() {
    const text = editor.innerText.replace(/\u200B/g, '').trim();
    wordCountEl.textContent = text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/* ============================================================
   TOOLBAR ACTIVE-STATE REFLECTION
   We read queryCommandState for bold/italic/underline/strike/super/sub
   and check DOM ancestry for code. We do NOT try to set our own
   "state" variables — the browser's execCommand state IS the state.
============================================================ */
function reflectStates() {
    try {
        setActive('btnBold',      document.queryCommandState('bold'));
        setActive('btnItalic',    document.queryCommandState('italic'));
        setActive('btnUnderline', document.queryCommandState('underline'));
        setActive('btnStrike',    document.queryCommandState('strikeThrough'));

<<<<<<< HEAD
    

    /* ============================================================
       DROPDOWN TOGGLE LOGIC
    ============================================================ */
    const allDropdowns = document.querySelectorAll('.rte-dropdown');
=======
        // super/sub: only mark active when BOTH queryCommandState returns true
        // AND the cursor is actually inside a <sup>/<sub> element
        // (queryCommandState alone is unreliable after toggling)
        const inSup = !!getAncestor(getAnchorNode(), 'SUP');
        const inSub = !!getAncestor(getAnchorNode(), 'SUB');
        setActive('btnSuper', inSup);
        setActive('btnSub',   inSub);
>>>>>>> 398c390 (Better Text Editor)

        setActive('btnCode', !!getAncestor(getAnchorNode(), 'CODE'));
    } catch (e) {}
}

function setActive(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!on);
}

editor.addEventListener('keyup',   () => { updateWordCount(); reflectStates(); });
editor.addEventListener('mouseup', reflectStates);
editor.addEventListener('input',   updateWordCount);

/* ============================================================
   DROPDOWN LOGIC
============================================================ */
const allDropdowns = document.querySelectorAll('.rte-dropdown');

function closeAllDropdowns(except) {
    allDropdowns.forEach(dd => {
        const m = dd.querySelector('.rte-dropdown-menu');
        if (m && dd !== except) m.classList.remove('open');
    });
}

allDropdowns.forEach(dd => {
    const btn  = dd.querySelector(':scope > .rte-btn');
    const menu = dd.querySelector('.rte-dropdown-menu');
    if (!btn || !menu) return;
    btn.addEventListener('mousedown', e => {
        e.preventDefault();
        saveSelection();
        const wasOpen = menu.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) menu.classList.add('open');
    });
});

document.addEventListener('mousedown', e => {
    if (!e.target.closest('.rte-dropdown') && !e.target.closest('.tbl-ctx-menu'))
        closeAllDropdowns();
});

/* ============================================================
   execCommand WRAPPER
============================================================ */
function exec(cmd, val) {
    restoreSelection();
    editor.focus();
    document.execCommand(cmd, false, val !== undefined ? val : null);
    reflectStates();
    updateWordCount();
}

/* ============================================================
   PRESET TEXT STYLES
   Title  → rte-style-title  (font-size: 2em, bold)
   Header → rte-style-header (font-size: 1.5em, bold)
   Subhdr → rte-style-subhdr (font-size: 1.17em, bold)
   Para   → plain div, no extra class

   Strategy: find the direct-child-of-editor block that contains
   the cursor. If it's already a div/p/span, toggle the class on it.
   If the cursor is directly in the editor root (text node child of
   editor), wrap it in a new div first.
   This approach means bold/italic/strike all still work freely
   inside because they operate on inline elements inside the block.
============================================================ */
const PRESET_CLS = {
    title:  'rte-style-title',
    header: 'rte-style-header',
    subhdr: 'rte-style-subhdr',
    para:   null,
};
const ALL_PRESET_CLS = Object.values(PRESET_CLS).filter(Boolean);

document.querySelectorAll('[data-preset]').forEach(item => {
    item.addEventListener('mousedown', e => {
        e.preventDefault();
        closeAllDropdowns();
        const preset = item.dataset.preset;
        const newCls = PRESET_CLS[preset];

        restoreSelection();
        editor.focus();

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            // No selection — just insert a new styled div at end
            const div = document.createElement('div');
            if (newCls) div.className = newCls;
            div.innerHTML = '<br>';
            editor.appendChild(div);
            const r = document.createRange();
            r.setStart(div, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }

        const range = sel.getRangeAt(0);
        let block = getBlockInEditor(range.commonAncestorContainer);

        if (!block) {
            // Cursor is a direct text child of editor — wrap it
            const div = document.createElement('div');
            if (newCls) div.className = newCls;
            try {
                range.surroundContents(div);
            } catch {
                div.appendChild(range.extractContents());
                range.insertNode(div);
            }
            // Place cursor inside new div
            const r = document.createRange();
            r.selectNodeContents(div);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }

        // Block exists — strip all preset classes, apply new one
        ALL_PRESET_CLS.forEach(c => block.classList && block.classList.remove(c));
        if (newCls) {
            block.classList.add(newCls);
        }
        // Keep cursor in same block
        const r = document.createRange();
        r.selectNodeContents(block);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
    });
});

/* ============================================================
   FONT / SIZE / COLOR
============================================================ */
document.querySelectorAll('.rte-dropdown-item[data-cmd]').forEach(item => {
    item.addEventListener('mousedown', e => {
        e.preventDefault();
        const cmd = item.dataset.cmd;
        const val = item.dataset.val;
        closeAllDropdowns();
        exec(cmd, val);
        if (cmd === 'foreColor') {
            const bar = document.getElementById('colorBar');
            if (bar) bar.setAttribute('fill', val);
        }
    });
});

/* ============================================================
   ALIGNMENT (regular text AND whole-table alignment)
============================================================ */
document.querySelectorAll('[data-align]').forEach(item => {
    item.addEventListener('mousedown', e => {
        e.preventDefault();
        closeAllDropdowns();
        const align = item.dataset.align;
        restoreSelection();
        editor.focus();

        const tbl = getAncestor(getAnchorNode(), 'TABLE');
        if (tbl) {
            // Wrap table in an alignment div if not already
            let wrapper = tbl.parentNode;
            if (!wrapper || wrapper === editor || !wrapper.dataset || !wrapper.dataset.tblWrap) {
                wrapper = document.createElement('div');
                wrapper.dataset.tblWrap = '1';
                tbl.parentNode.insertBefore(wrapper, tbl);
                wrapper.appendChild(tbl);
            }
            tbl.style.marginLeft  = align === 'right'  ? 'auto' : (align === 'center' ? 'auto' : '0');
            tbl.style.marginRight = align === 'left'   ? 'auto' : (align === 'center' ? 'auto' : '0');
            wrapper.style.textAlign = align;
        } else {
            const map = {
                left:    'justifyLeft',
                center:  'justifyCenter',
                right:   'justifyRight',
                justify: 'justifyFull',
            };
            document.execCommand(map[align], false, null);
        }
    });
});

/* ============================================================
   LINE HEIGHT
============================================================ */
document.querySelectorAll('.lh-item').forEach(item => {
    item.addEventListener('mousedown', e => {
        e.preventDefault();
        closeAllDropdowns();
        document.querySelectorAll('.lh-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        restoreSelection();
        editor.focus();
        const lh  = item.dataset.lh;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        let node = sel.anchorNode;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const block = getBlockInEditor(node);
        if (block) block.style.lineHeight = lh;
    });
});

/* ============================================================
   BOLD / ITALIC / UNDERLINE (toolbar + hotkeys Ctrl+B/I/U)
============================================================ */
document.getElementById('btnBold').addEventListener('mousedown', e => {
    e.preventDefault(); saveSelection(); exec('bold');
});
document.getElementById('btnItalic').addEventListener('mousedown', e => {
    e.preventDefault(); saveSelection(); exec('italic');
});
document.getElementById('btnUnderline').addEventListener('mousedown', e => {
    e.preventDefault(); saveSelection(); exec('underline');
});

/* ============================================================
   STRIKETHROUGH
============================================================ */
document.getElementById('btnStrike').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    exec('strikeThrough');
});

/* ============================================================
   SUPERSCRIPT / SUBSCRIPT (mutually exclusive)
   Fix: we check DOM ancestry (SUP/SUB tags) rather than
   queryCommandState, because qCS is unreliable after toggling.
   To "turn off" we just execCommand again — browser toggles.
   To enforce mutual exclusion we check what's currently active
   and turn it off before applying the new one.
============================================================ */
document.getElementById('btnSuper').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();

    const inSub = !!getAncestor(getAnchorNode(), 'SUB');
    const inSup = !!getAncestor(getAnchorNode(), 'SUP');

    // Turn off subscript first if it's on
    if (inSub) {
        restoreSelection(); editor.focus();
        document.execCommand('subscript', false, null);
        setActive('btnSub', false);
    }

    exec('superscript');
    // After exec, re-check DOM to set correct active state
    const nowInSup = !!getAncestor(getAnchorNode(), 'SUP');
    setActive('btnSuper', nowInSup);
    setActive('btnSub',   false);
});

document.getElementById('btnSub').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();

    const inSup = !!getAncestor(getAnchorNode(), 'SUP');
    const inSub = !!getAncestor(getAnchorNode(), 'SUB');

    // Turn off superscript first if it's on
    if (inSup) {
        restoreSelection(); editor.focus();
        document.execCommand('superscript', false, null);
        setActive('btnSuper', false);
    }

    exec('subscript');
    const nowInSub = !!getAncestor(getAnchorNode(), 'SUB');
    setActive('btnSub',   nowInSub);
    setActive('btnSuper', false);
});

/* ============================================================
   CODE SNIPPET
   - Clicking when inside <code> → unwrap (turn off)
   - Clicking on selection → wrap in <code>
   - Clicking with collapsed cursor → insert <code> placeholder
   - ArrowLeft at start / ArrowRight at end → escape the <code>
============================================================ */
document.getElementById('btnCode').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    restoreSelection();
    editor.focus();

    const sel = window.getSelection();
    if (!sel) return;

    const existing = getAncestor(sel.anchorNode, 'CODE');
    if (existing) {
        // Unwrap
        const frag = document.createDocumentFragment();
        while (existing.firstChild) frag.appendChild(existing.firstChild);
        existing.parentNode.replaceChild(frag, existing);
        setActive('btnCode', false);
        return;
    }

    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const code  = document.createElement('code');
        if (!sel.isCollapsed) {
            code.appendChild(range.extractContents());
        } else {
            code.textContent = '\u200B'; // zero-width space — acts as cursor target
        }
        range.insertNode(code);

        // Move cursor: if empty code, put inside; otherwise put after
        const r = document.createRange();
        if (code.firstChild && code.textContent === '\u200B') {
            r.setStart(code.firstChild, 0);
        } else {
            r.setStartAfter(code);
        }
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        setActive('btnCode', true);
    }
    updateWordCount();
});

editor.addEventListener('keydown', function codeEscape(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const code = getAncestor(sel.anchorNode, 'CODE');
    if (!code) return;

    const range  = sel.getRangeAt(0);
    const offset = range.startOffset;
    const len    = sel.anchorNode.textContent.length;

    if (e.key === 'ArrowLeft' && offset === 0) {
        e.preventDefault();
        const r = document.createRange();
        r.setStartBefore(code);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        setActive('btnCode', false);
    } else if (e.key === 'ArrowRight' && offset >= len) {
        e.preventDefault();
        // Ensure a text node exists after code to land on
        let after = code.nextSibling;
        if (!after || after.nodeType !== Node.TEXT_NODE) {
            after = document.createTextNode('\u200B');
            code.after(after);
        }
        const r = document.createRange();
        r.setStart(after, after.length);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        setActive('btnCode', false);
    }
});

/* ============================================================
   MS WORD HOTKEYS
   Ctrl+B  = Bold
   Ctrl+I  = Italic
   Ctrl+U  = Underline
   Ctrl+Z  = Undo
   Ctrl+Y  = Redo
   Ctrl+K  = Insert Link
   Ctrl+`  = Code snippet (backtick, like many markdown editors)
   Ctrl+1  = Title preset
   Ctrl+2  = Header preset
   Ctrl+3  = Subheader preset
   Ctrl+0  = Paragraph preset
   Ctrl+L  = Align Left
   Ctrl+E  = Align Center
   Ctrl+R  = Align Right
   Ctrl+J  = Justify
   Ctrl+Shift+X = Strikethrough
   Ctrl+Shift+= = Superscript  (same as Word)
   Ctrl+= =      Subscript     (same as Word)
   Tab inside table = move to next cell
   Shift+Tab inside table = move to prev cell
   Delete on selected image/attachment = remove it
============================================================ */
editor.addEventListener('keydown', e => {
    const ctrl  = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    /* --- Tab navigation inside table --- */
    if (e.key === 'Tab') {
        const td = getAncestor(getAnchorNode(), 'TD') || getAncestor(getAnchorNode(), 'TH');
        if (td) {
            e.preventDefault();
            const cells = Array.from(td.closest('table').querySelectorAll('td,th'));
            const idx   = cells.indexOf(td);
            const next  = shift ? cells[idx - 1] : cells[idx + 1];
            if (next) {
                const r = document.createRange();
                r.selectNodeContents(next);
                r.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
            }
            return;
        }
    }

    /* --- Delete/Backspace on non-editable inline elements (images, chips) --- */
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel   = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);

        // If selection is collapsed, check adjacent node
        if (sel.isCollapsed) {
            const container = range.startContainer;
            const offset    = range.startOffset;

            let target = null;
            if (e.key === 'Backspace' && offset > 0 && container.nodeType === Node.TEXT_NODE) {
                // nothing special — browser handles text backspace
            } else if (e.key === 'Backspace' && container.childNodes) {
                target = container.childNodes[offset - 1];
            } else if (e.key === 'Delete' && container.childNodes) {
                target = container.childNodes[offset];
            }

            if (target && target.nodeType === Node.ELEMENT_NODE &&
                (target.classList.contains('rte-img-wrap') ||
                 target.classList.contains('rte-attachment'))) {
                e.preventDefault();
                target.remove();
                updateWordCount();
                return;
            }
        } else {
            // Selection spans non-editable nodes — let browser handle but also
            // manually clean up any rte-img-wrap / rte-attachment in range
        }
    }

    if (!ctrl) return;

    switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); saveSelection(); exec('bold');        break;
        case 'i': e.preventDefault(); saveSelection(); exec('italic');      break;
        case 'u': e.preventDefault(); saveSelection(); exec('underline');   break;
        case 'z': e.preventDefault(); exec('undo');                         break;
        case 'y': e.preventDefault(); exec('redo');                         break;
        case 'k': e.preventDefault(); saveSelection(); openLinkModal();     break;
        case '`': e.preventDefault(); saveSelection(); triggerCodeSnippet(); break;
        case 'l': e.preventDefault(); document.execCommand('justifyLeft',   false, null); break;
        case 'e': e.preventDefault(); document.execCommand('justifyCenter', false, null); break;
        case 'r': e.preventDefault(); document.execCommand('justifyRight',  false, null); break;
        case 'j': e.preventDefault(); document.execCommand('justifyFull',   false, null); break;
        case '0': e.preventDefault(); applyPreset('para');   break;
        case '1': e.preventDefault(); applyPreset('title');  break;
        case '2': e.preventDefault(); applyPreset('header'); break;
        case '3': e.preventDefault(); applyPreset('subhdr'); break;
        case '=':
            if (shift) {
                // Ctrl+Shift+= → Superscript (Word standard)
                e.preventDefault();
                document.getElementById('btnSuper').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            } else {
                // Ctrl+= → Subscript (Word standard)
                e.preventDefault();
                document.getElementById('btnSub').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            }
            break;
        case 'x':
            if (shift) {
                // Ctrl+Shift+X → Strikethrough
                e.preventDefault();
                saveSelection();
                exec('strikeThrough');
            }
            break;
    }
});

/* Trigger code snippet via hotkey */
function triggerCodeSnippet() {
    restoreSelection();
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const existing = getAncestor(sel.anchorNode, 'CODE');
    if (existing) {
        const frag = document.createDocumentFragment();
        while (existing.firstChild) frag.appendChild(existing.firstChild);
        existing.parentNode.replaceChild(frag, existing);
        setActive('btnCode', false);
        return;
    }
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const code  = document.createElement('code');
        if (!sel.isCollapsed) {
            code.appendChild(range.extractContents());
        } else {
            code.textContent = '\u200B';
        }
        range.insertNode(code);
        const r = document.createRange();
        if (code.textContent === '\u200B' && code.firstChild) {
            r.setStart(code.firstChild, 0);
        } else {
            r.setStartAfter(code);
        }
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        setActive('btnCode', true);
    }
    updateWordCount();
}

/* applyPreset via hotkey — shared logic */
function applyPreset(preset) {
    restoreSelection();
    editor.focus();
    const sel    = window.getSelection();
    const newCls = PRESET_CLS[preset];
    if (!sel) return;

    if (sel.rangeCount === 0) {
        const div = document.createElement('div');
        if (newCls) div.className = newCls;
        div.innerHTML = '<br>';
        editor.appendChild(div);
        return;
    }

    const range = sel.getRangeAt(0);
    let block   = getBlockInEditor(range.commonAncestorContainer);

    if (!block) {
        const div = document.createElement('div');
        if (newCls) div.className = newCls;
        try { range.surroundContents(div); }
        catch { div.appendChild(range.extractContents()); range.insertNode(div); }
        const r = document.createRange();
        r.selectNodeContents(div);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
    }

    ALL_PRESET_CLS.forEach(c => block.classList && block.classList.remove(c));
    if (newCls) block.classList.add(newCls);

    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
}

/* ============================================================
   MORE (...) TOGGLE
============================================================ */
document.getElementById('btnMore').addEventListener('click', () => {
    const row = document.getElementById('rteExtraRow');
    row.classList.toggle('visible');
    document.getElementById('btnMore').classList.toggle('active', row.classList.contains('visible'));
});

/* ============================================================
   UNDO / CLEAR FORMAT
============================================================ */
document.getElementById('btnUndo').addEventListener('mousedown', e => {
    e.preventDefault();
    exec('undo');
});

document.getElementById('btnClear').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    exec('removeFormat');
    // Also strip preset style classes from the block
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const block = getBlockInEditor(sel.anchorNode);
    if (block) ALL_PRESET_CLS.forEach(c => block.classList && block.classList.remove(c));
});

/* ============================================================
   TABLE GRID PICKER
   Hover → preview. Click → confirm selection. Insert → build table.
============================================================ */
const gridCells   = document.getElementById('tableGridCells');
const gridLabel   = document.getElementById('tableGridLabel');
const tableInsBtn = document.getElementById('tableInsertBtn');
const G_R = 9, G_C = 10;
let gHover = { r: 1, c: 1 };
let gSel   = { r: 1, c: 1, confirmed: false };

for (let r = 1; r <= G_R; r++) {
    for (let c = 1; c <= G_C; c++) {
        const cell     = document.createElement('div');
        cell.className = 'table-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        gridCells.appendChild(cell);
    }
}

function paintGrid(hr, hc, sr, sc, confirmed) {
    document.querySelectorAll('.table-cell').forEach(cell => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        const inHover     = r <= hr && c <= hc;
        const inConfirmed = confirmed && r <= sr && c <= sc;
        cell.classList.toggle('highlight', inHover && !inConfirmed);
        cell.classList.toggle('confirmed', inConfirmed);
    });
}

gridCells.addEventListener('mouseover', e => {
    const cell = e.target.closest('.table-cell');
    if (!cell) return;
    gHover.r = +cell.dataset.r;
    gHover.c = +cell.dataset.c;
    paintGrid(gHover.r, gHover.c, gSel.r, gSel.c, gSel.confirmed);
    gridLabel.textContent = gSel.confirmed
        ? `${gSel.r} × ${gSel.c} selected`
        : `${gHover.r} × ${gHover.c} Table`;
});

gridCells.addEventListener('mouseleave', () => {
    paintGrid(0, 0, gSel.r, gSel.c, gSel.confirmed);
    gridLabel.textContent = gSel.confirmed
        ? `${gSel.r} × ${gSel.c} selected — click Insert`
        : 'Select table size';
});

gridCells.addEventListener('click', e => {
    const cell = e.target.closest('.table-cell');
    if (!cell) return;
    gSel.r = +cell.dataset.r;
    gSel.c = +cell.dataset.c;
    gSel.confirmed = true;
    paintGrid(gSel.r, gSel.c, gSel.r, gSel.c, true);
    gridLabel.textContent = `${gSel.r} × ${gSel.c} selected — click Insert`;
});

tableInsBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    const rows = gSel.confirmed ? gSel.r : gHover.r;
    const cols = gSel.confirmed ? gSel.c : gHover.c;
    closeAllDropdowns();
    insertTable(rows, cols);
    gSel.confirmed = false;
    paintGrid(0, 0, 0, 0, false);
    gridLabel.textContent = 'Select table size';
});

function insertTable(rows, cols) {
    restoreSelection();
    editor.focus();

    const table            = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width          = '100%';

    for (let r = 0; r < rows; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < cols; c++) tr.appendChild(makeEmptyCell());
        table.appendChild(tr);
    }
    addResizeHandles(table);

    const p          = document.createElement('p');
    p.innerHTML      = '<br>';
    const sel        = window.getSelection();

    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.collapse(true);
        range.insertNode(p);
        p.before(table);
    } else {
        editor.appendChild(table);
        editor.appendChild(p);
    }

    // Move cursor into first cell
    const firstTd = table.rows[0].cells[0];
    const r = document.createRange();
    r.setStart(firstTd, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);

    hookTableCtxMenu(table);
    updateWordCount();
}

/* ============================================================
   TABLE HELPERS — cells, resize handles, context menu
============================================================ */
function makeEmptyCell() {
    const td         = document.createElement('td');
    td.style.border   = '1px solid #ccc';
    td.style.padding  = '6px 10px';
    td.style.minWidth = '40px';
    td.style.position = 'relative';
    td.setAttribute('contenteditable', 'true');
    td.innerHTML      = '<br>';
    return td;
}

function addResizeHandles(table) {
    table.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
    Array.from(table.rows).forEach(row => {
        Array.from(row.cells).forEach(cell => {
            cell.style.position = 'relative';
            const handle        = document.createElement('div');
            handle.className    = 'col-resize-handle';
            cell.appendChild(handle);

            let startX, startW;
            handle.addEventListener('mousedown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                startX = ev.clientX;
                startW = cell.offsetWidth;
                handle.classList.add('dragging');
                const onMove = me => { cell.style.width = Math.max(40, startW + me.clientX - startX) + 'px'; };
                const onUp   = ()  => {
                    handle.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup',   onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup',   onUp);
            });
        });
    });
}

let ctxTbl  = null;
let ctxCell = null;
const tblCtxMenu = document.getElementById('tblCtxMenu');

function hookTableCtxMenu(table) {
    table.addEventListener('contextmenu', e => {
        e.preventDefault();
        ctxTbl  = table;
        ctxCell = e.target.closest('td,th');
        tblCtxMenu.style.left = e.clientX + 'px';
        tblCtxMenu.style.top  = e.clientY + 'px';
        tblCtxMenu.classList.add('open');
    });
}

document.addEventListener('click', e => {
    if (!e.target.closest('#tblCtxMenu')) tblCtxMenu.classList.remove('open');
});

function cloneEmptyRow(template) {
    const tr = document.createElement('tr');
    Array.from(template.cells).forEach(() => tr.appendChild(makeEmptyCell()));
    return tr;
}

document.getElementById('ctxAddRowAbove').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    ctxCell.closest('tr').before(cloneEmptyRow(ctxCell.closest('tr')));
    addResizeHandles(ctxTbl);
});
document.getElementById('ctxAddRowBelow').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    ctxCell.closest('tr').after(cloneEmptyRow(ctxCell.closest('tr')));
    addResizeHandles(ctxTbl);
});
document.getElementById('ctxAddColLeft').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    const idx = ctxCell.cellIndex;
    Array.from(ctxTbl.rows).forEach(row => row.insertBefore(makeEmptyCell(), row.cells[idx]));
    addResizeHandles(ctxTbl);
});
document.getElementById('ctxAddColRight').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    const idx = ctxCell.cellIndex;
    Array.from(ctxTbl.rows).forEach(row => row.insertBefore(makeEmptyCell(), row.cells[idx + 1] || null));
    addResizeHandles(ctxTbl);
});
document.getElementById('ctxDelRow').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    if (ctxTbl.rows.length <= 1) { ctxTbl.remove(); return; }
    ctxCell.closest('tr').remove();
});
document.getElementById('ctxDelCol').addEventListener('click', () => {
    if (!ctxTbl || !ctxCell) return;
    tblCtxMenu.classList.remove('open');
    const idx = ctxCell.cellIndex;
    if (ctxTbl.rows[0].cells.length <= 1) { ctxTbl.remove(); return; }
    Array.from(ctxTbl.rows).forEach(row => row.cells[idx] && row.cells[idx].remove());
});
document.getElementById('ctxDelTable').addEventListener('click', () => {
    if (!ctxTbl) return;
    tblCtxMenu.classList.remove('open');
    ctxTbl.remove();
    updateWordCount();
});

// Hook any tables already present (pre-filled editor)
editor.querySelectorAll('table').forEach(t => { hookTableCtxMenu(t); addResizeHandles(t); });

/* ============================================================
   LINK MODAL
============================================================ */
const linkModal = document.getElementById('linkModal');
const linkText  = document.getElementById('linkText');
const linkUrl   = document.getElementById('linkUrl');

function openLinkModal() {
    restoreSelection();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) linkText.value = sel.toString();
    saveSelection(); // re-save after focus restore
    linkModal.classList.add('open');
    setTimeout(() => linkUrl.focus(), 30);
}

document.getElementById('btnLink').addEventListener('mousedown', e => {
    e.preventDefault();
    saveSelection();
    openLinkModal();
});
document.getElementById('linkCancel').addEventListener('click', () => linkModal.classList.remove('open'));
linkModal.addEventListener('click', e => { if (e.target === linkModal) linkModal.classList.remove('open'); });

document.getElementById('linkInsert').addEventListener('click', () => {
    const url  = linkUrl.value.trim();
    const text = linkText.value.trim() || url;
    if (!url) return;
    restoreSelection();
    editor.focus();
    const a       = document.createElement('a');
    a.href        = url;
    a.target      = '_blank';
    a.textContent = text;
    const sel     = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        const r = document.createRange();
        r.setStartAfter(a);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
    } else {
        editor.appendChild(a);
    }
    linkModal.classList.remove('open');
    linkText.value = '';
    linkUrl.value  = '';
    updateWordCount();
});

/* ============================================================
   FILE & IMAGE ATTACHMENT
   Inserted inline at the cursor. Images show as thumbnails
   with a hover download button and a visible × remove button.
   All other files show as chips with icon, name, download, remove.
   All are keyboard-deletable (Delete/Backspace handled above).
============================================================ */
const fileInput  = document.getElementById('fileInput');
const imageInput = document.getElementById('imageInput');

document.getElementById('btnAttach').addEventListener('click', () => { saveSelection(); fileInput.click(); });
document.getElementById('btnImage').addEventListener('click',  () => { saveSelection(); imageInput.click(); });

fileInput.addEventListener('change',  () => { Array.from(fileInput.files).forEach(insertAttachment);  fileInput.value  = ''; });
imageInput.addEventListener('change', () => { Array.from(imageInput.files).forEach(insertAttachment); imageInput.value = ''; });

function getFileIconSVG(file) {
    const ext  = (file.name.split('.').pop() || '').toLowerCase();
    const type = file.type || '';
    if (type.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext))
        return '<svg viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="1.4" style="width:15px;height:15px;flex-shrink:0"><rect x="1" y="1" width="14" height="12" rx="1.5"/><circle cx="5" cy="5" r="1.2"/><path d="M1 9l3-3 3 3 3-4 4 4"/></svg>';
    if (type === 'application/pdf' || ext === 'pdf')
        return '<svg viewBox="0 0 14 16" fill="none" stroke="#e74c3c" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="12" height="14" rx="2"/><text x="1.5" y="11" font-size="5" fill="#e74c3c" stroke="none" font-weight="bold">PDF</text></svg>';
    if (['doc','docx'].includes(ext) || type.includes('word'))
        return '<svg viewBox="0 0 14 16" fill="none" stroke="#1a56db" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="12" height="14" rx="2"/><text x="1" y="11" font-size="4.5" fill="#1a56db" stroke="none" font-weight="bold">DOC</text></svg>';
    if (['xls','xlsx','csv'].includes(ext))
        return '<svg viewBox="0 0 14 16" fill="none" stroke="#1a7a3c" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="12" height="14" rx="2"/><text x="1" y="11" font-size="4.5" fill="#1a7a3c" stroke="none" font-weight="bold">XLS</text></svg>';
    if (['ppt','pptx'].includes(ext))
        return '<svg viewBox="0 0 14 16" fill="none" stroke="#e67e22" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="12" height="14" rx="2"/><text x="1" y="11" font-size="4.5" fill="#e67e22" stroke="none" font-weight="bold">PPT</text></svg>';
    if (type.startsWith('video/') || ['mp4','mov','avi','mkv','webm'].includes(ext))
        return '<svg viewBox="0 0 16 12" fill="none" stroke="#7b2fa8" stroke-width="1.4" style="width:15px;height:15px;flex-shrink:0"><rect x="1" y="1" width="14" height="10" rx="1.5"/><polygon points="6,3 6,9 11,6" fill="#7b2fa8" stroke="none"/></svg>';
    if (type.startsWith('audio/') || ['mp3','wav','ogg','flac','aac'].includes(ext))
        return '<svg viewBox="0 0 14 14" fill="none" stroke="#c0392b" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><circle cx="7" cy="7" r="6"/><line x1="7" y1="4" x2="7" y2="10"/><line x1="4" y1="6" x2="4" y2="8"/><line x1="10" y1="6" x2="10" y2="8"/></svg>';
    return '<svg viewBox="0 0 14 16" fill="none" stroke="currentColor" stroke-width="1.4" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="12" height="14" rx="2"/><line x1="4" y1="5" x2="10" y2="5"/><line x1="4" y1="8" x2="10" y2="8"/><line x1="4" y1="11" x2="7" y2="11"/></svg>';
}

function insertAttachment(file) {
    const reader    = new FileReader();
    reader.onload   = ev => {
        const dataUrl = ev.target.result;
        restoreSelection();
        editor.focus();
        const sel   = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        let node;

        if (file.type.startsWith('image/')) {
            /* --- Image: thumbnail + hover-download + visible × remove --- */
            node               = document.createElement('span');
            node.contentEditable = 'false';
            node.className     = 'rte-img-wrap';

            const img          = document.createElement('img');
            img.src            = dataUrl;
            img.alt            = file.name;
            img.title          = file.name;

            const dlBtn        = document.createElement('button');
            dlBtn.type         = 'button';
            dlBtn.className    = 'img-dl-btn';
            dlBtn.textContent  = '⬇';
            dlBtn.title        = 'Download ' + file.name;
            dlBtn.addEventListener('click', () => triggerDownload(file.name, dataUrl));

            /* Visible remove button — always shown, top-left of image */
            const rmBtn        = document.createElement('button');
            rmBtn.type         = 'button';
            rmBtn.className    = 'img-rm-btn';
            rmBtn.textContent  = '✕';
            rmBtn.title        = 'Remove image';
            rmBtn.addEventListener('click', () => { node.remove(); updateWordCount(); });

            node.appendChild(img);
            node.appendChild(dlBtn);
            node.appendChild(rmBtn);
        } else {
            /* --- Non-image chip --- */
            node               = document.createElement('span');
            node.contentEditable = 'false';
            node.className     = 'rte-attachment';

            node.innerHTML     =
                getFileIconSVG(file) +
                `<span class="att-name" title="${esc(file.name)}">${esc(file.name)}</span>` +
                `<a class="att-dl" href="#" title="Download">⬇</a>` +
                `<button type="button" class="att-rm" title="Remove">✕</button>`;

            node.querySelector('.att-dl').addEventListener('click', ev => {
                ev.preventDefault();
                triggerDownload(file.name, dataUrl);
            });
            node.querySelector('.att-rm').addEventListener('click', () => {
                node.remove();
                updateWordCount();
            });
        }

        if (range) {
            range.collapse(false);
            range.insertNode(node);
            const r = document.createRange();
            r.setStartAfter(node);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } else {
            editor.appendChild(node);
        }
        updateWordCount();
    };
    reader.readAsDataURL(file);
}

function triggerDownload(name, dataUrl) {
    const a    = document.createElement('a');
    a.href     = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function esc(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ============================================================
   TOAST
============================================================ */
const toast = document.getElementById('rteToast');
function showToast(msg, type) {
    toast.textContent = msg;
    toast.className   = 'rte-toast show ' + (type || '');
    setTimeout(() => toast.className = 'rte-toast', 3200);
}

/* ============================================================
   FORM SUBMIT
============================================================ */
document.getElementById('adminAnnouncementForm').addEventListener('submit', async e => {
    e.preventDefault();
    const html = editor.innerHTML.trim();
    if (!html || html === '<br>') { showToast('Message Detail cannot be empty.', 'error'); return; }

    const encoded        = btoa(unescape(encodeURIComponent(html)));
    hiddenArea.value     = encoded;

    const form    = e.target;
    const payload = {
        department:    form.department.value.trim(),
        category:      form.category.value,
        headline:      form.headline.value.trim(),
        messageDetail: encoded,
    };

    try {
        const res  = await fetch('/admin/announcement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
            showToast('Announcement posted!', 'success');
            form.reset();
            editor.innerHTML = '';
            updateWordCount();
            setTimeout(() => location.reload(), 1300);
        } else {
            showToast('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch { showToast('Network error. Please try again.', 'error'); }
});

/* ============================================================
   DELETE ANNOUNCEMENT
============================================================ */
document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
        const item = btn.closest('.announcement-item');
        const id   = item?.dataset?.id;
        if (!id) return;
        if (!confirm('Delete this announcement?')) return;
        try {
            const res  = await fetch(`/admin/announcement/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { item.remove(); showToast('Deleted.', 'success'); }
            else showToast('Delete failed.', 'error');
        } catch { showToast('Network error.', 'error'); }
    });
});

/* ============================================================
   PROJECT MODAL
============================================================ */
const projModal = document.getElementById('projectModal');
const projBtn   = document.querySelector('.btn-proj-overview');
const closeSpan = document.querySelector('.close-btn');
if (projBtn && projModal) {
    projBtn.addEventListener('click', e => { e.preventDefault(); projModal.style.display = 'block'; });
}
if (closeSpan) closeSpan.addEventListener('click', () => projModal.style.display = 'none');
window.addEventListener('click', ev => { if (ev.target === projModal) projModal.style.display = 'none'; });

})();
