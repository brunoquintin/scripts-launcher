// main.js — Scripts Launcher (CEP panel client)
// Drives the panel UI: listing, launching, drag-and-drop reordering, shy toggles, theme.
// Author: Bruno Quintin
// Version: 1.0
// Created: July 23, 2026
//
// This extension is "Vibe Coded" and provided without warranty; the user
// therefore assumes full responsibility for its implementation.

(function () {
    'use strict';

    const csInterface = new CSInterface();
    const ICON_SHY     = 'assets/shy.svg';
    const ICON_HIDESHY = 'assets/hideshy.svg';

    let isShyMasterActive = false;
    let dragSrcEl, dragGhostEl;
    let dragOffsetY = 0;
    let dragSrcIndex = -1, dragInsertIndex = -1;

    // --- Init ---

    function init() {
        loadPreferences();
        detectAndApplyTheme();
        csInterface.addEventListener('com.adobe.csxs.events.ThemeColorChanged', detectAndApplyTheme);

        document.getElementById('btn-shy-master').onclick = toggleShyMaster;
        document.getElementById('btn-reset').onclick = resetPreferences;
        document.getElementById('filter-type').addEventListener('change', function () {
            applyFilter(this.value);
        });

        loadLauncher();
    }

    // --- Shy master ---

    function toggleShyMaster() {
        isShyMasterActive = !isShyMasterActive;
        const btn = document.getElementById('btn-shy-master');
        const img = btn.querySelector('img');
        const container = document.getElementById('launcher-view');

        if (isShyMasterActive) {
            btn.classList.add('active');
            container.classList.add('hide-shy-rows');
            img.src = ICON_HIDESHY;
            img.alt = 'Hide shy scripts';
            btn.title = 'Show all scripts';
        } else {
            btn.classList.remove('active');
            container.classList.remove('hide-shy-rows');
            img.src = ICON_SHY;
            img.alt = 'Show all scripts';
            btn.title = 'Hide shy scripts';
        }
        localStorage.setItem('shyMasterActive', isShyMasterActive);
    }

    // --- Theme ---

    function detectAndApplyTheme() {
        try {
            const skin = csInterface.getHostEnvironment().appSkinInfo;
            const bg = skin.panelBackgroundColor.color;
            const luminance = 0.299 * bg.red + 0.587 * bg.green + 0.114 * bg.blue;
            if (luminance < 128) {
                document.body.classList.remove('light-mode');
            } else {
                document.body.classList.add('light-mode');
            }
        } catch (e) {
            console.error('Theme detection error:', e);
        }
    }

    // --- Filter ---

    function applyFilter(val) {
        const container = document.getElementById('launcher-view');
        container.classList.remove('show-panels-only', 'show-scripts-only');
        if (val === 'panel') container.classList.add('show-panels-only');
        else if (val === 'script') container.classList.add('show-scripts-only');
        localStorage.setItem('filterType', val);
    }

    // --- Reset preferences ---

    function resetPreferences() {
        localStorage.removeItem('shyMasterActive');
        localStorage.removeItem('filterType');

        document.getElementById('filter-type').value = 'panel';
        applyFilter('panel');

        if (isShyMasterActive) toggleShyMaster();

        detectAndApplyTheme();

        csInterface.evalScript('resetAllPreferences()', function () {
            loadLauncher();
        });
    }

    // --- Preferences ---

    function loadPreferences() {
        const savedFilter = localStorage.getItem('filterType') || 'panel';
        document.getElementById('filter-type').value = savedFilter;
        applyFilter(savedFilter);

        if (localStorage.getItem('shyMasterActive') === 'true') toggleShyMaster();
    }

    // --- Launcher ---

    function loadLauncher() {
        csInterface.evalScript('getOrderedScriptsJSON()', function (result) {
            try {
                const scripts = JSON.parse(result);
                const container = document.getElementById('launcher-view');
                container.innerHTML = '';

                scripts.forEach(function (s) {
                    const row = document.createElement('div');
                    row.className = 'script-row';
                    if (s.hidden) row.classList.add('is-shy-active');
                    if (s.type === 'script') row.classList.add('script-row-nonui');
                    row.setAttribute('data-id', s.id);

                    const dragHandle = document.createElement('div');
                    dragHandle.className = 'drag-handle';
                    dragHandle.innerHTML = '⋮⋮';

                    const btnShy = document.createElement('button');
                    btnShy.className = 'btn-shy-individual' + (s.hidden ? ' is-shy' : '');
                    const svgImg = document.createElement('img');
                    svgImg.src = s.hidden ? ICON_HIDESHY : ICON_SHY;
                    svgImg.alt = s.hidden ? 'Hidden' : 'Visible';
                    svgImg.className = 'btn-icon-shy';
                    btnShy.appendChild(svgImg);
                    btnShy.onclick = function (e) {
                        e.stopPropagation();
                        toggleIndividualShy(s.id, row, btnShy);
                    };

                    const btnMain = document.createElement('button');
                    btnMain.className = 'btn-main';
                    btnMain.innerText = s.displayName;

                    row.onclick = function () {
                        if (s.type === 'panel') {
                            const safeName = s.file.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            csInterface.evalScript('runAETask("' + safeName + '")');
                        } else {
                            const safePath = s.fullPath.replace(/"/g, '\\"');
                            csInterface.evalScript('runScript("' + safePath + '")');
                        }
                    };

                    row.appendChild(dragHandle);
                    row.appendChild(btnShy);
                    row.appendChild(btnMain);

                    attachDragEvents(row);
                    container.appendChild(row);
                });
            } catch (e) {
                console.error('JSON parse error:', e);
            }
        });
    }

    function attachDragEvents(el) {
        const handle = el.querySelector('.drag-handle');
        handle.addEventListener('mousedown', handleDragMouseDown, false);
    }

    function toggleIndividualShy(scriptId, row, btn) {
        const newState = !row.classList.contains('is-shy-active');
        const svgImg = btn.querySelector('.btn-icon-shy');
        if (newState) {
            row.classList.add('is-shy-active');
            btn.classList.add('is-shy');
            svgImg.src = ICON_HIDESHY;
        } else {
            row.classList.remove('is-shy-active');
            btn.classList.remove('is-shy');
            svgImg.src = ICON_SHY;
        }
        const safeId = scriptId.replace(/"/g, '\\"');
        csInterface.evalScript('setScriptHidden("' + safeId + '", ' + newState + ')');
    }

    // --- Drag & drop ---

    function handleDragMouseDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();

        dragSrcEl = this.closest('.script-row');
        const rect = dragSrcEl.getBoundingClientRect();
        dragOffsetY = e.clientY - rect.top;

        const container = document.getElementById('launcher-view');
        const rows = Array.from(container.querySelectorAll('.script-row'));
        dragSrcIndex    = rows.indexOf(dragSrcEl);
        dragInsertIndex = dragSrcIndex;

        if (dragGhostEl && dragGhostEl.parentNode) {
            dragGhostEl.parentNode.removeChild(dragGhostEl);
        }

        dragGhostEl = dragSrcEl.cloneNode(true);
        dragGhostEl.style.transition    = 'none';
        dragGhostEl.style.position      = 'fixed';
        dragGhostEl.style.width         = rect.width + 'px';
        dragGhostEl.style.left          = rect.left + 'px';
        dragGhostEl.style.top           = rect.top + 'px';
        dragGhostEl.style.opacity       = '0.8';
        dragGhostEl.style.pointerEvents = 'none';
        dragGhostEl.style.zIndex        = '9999';
        dragGhostEl.style.boxShadow     = '0 4px 12px rgba(0,0,0,0.4)';
        document.body.appendChild(dragGhostEl);

        dragSrcEl.classList.add('dragging');
        document.addEventListener('mousemove', handleDragMouseMove, false);
        document.addEventListener('mouseup',   handleDragMouseUp,   false);
    }

    function handleDragMouseMove(e) {
        dragGhostEl.style.top = (e.clientY - dragOffsetY) + 'px';

        const container = document.getElementById('launcher-view');
        const rows      = Array.from(container.querySelectorAll('.script-row'));
        const rowH      = dragSrcEl.offsetHeight + 2;

        var newInsertIndex = rows.length;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i] === dragSrcEl) continue;
            var mid = rows[i].getBoundingClientRect();
            if (e.clientY < mid.top + mid.height / 2) { newInsertIndex = i; break; }
        }

        if (newInsertIndex === dragInsertIndex) return;
        dragInsertIndex = newInsertIndex;

        rows.forEach(function (row, i) {
            if (row === dragSrcEl) return;
            var shift = 0;
            if (dragSrcIndex < dragInsertIndex) {
                if (i > dragSrcIndex && i < dragInsertIndex) shift = -rowH;
            } else if (dragSrcIndex > dragInsertIndex) {
                if (i >= dragInsertIndex && i < dragSrcIndex) shift = rowH;
            }
            row.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
    }

    function handleDragMouseUp(e) {
        document.removeEventListener('mousemove', handleDragMouseMove);
        document.removeEventListener('mouseup',   handleDragMouseUp);

        if (dragGhostEl && dragGhostEl.parentNode) {
            dragGhostEl.parentNode.removeChild(dragGhostEl);
            dragGhostEl = null;
        }

        dragSrcEl.classList.remove('dragging');

        const container = document.getElementById('launcher-view');
        const rows      = Array.from(container.querySelectorAll('.script-row'));

        rows.forEach(function (r) { r.style.transition = 'none'; r.style.transform = ''; });

        var refNode = dragInsertIndex < rows.length ? rows[dragInsertIndex] : null;
        if (refNode !== dragSrcEl) {
            container.insertBefore(dragSrcEl, refNode);
            saveNewOrder();
        }

        requestAnimationFrame(function () {
            container.querySelectorAll('.script-row').forEach(function (r) { r.style.transition = ''; });
        });

        dragSrcEl       = null;
        dragInsertIndex = -1;
        dragSrcIndex    = -1;
    }

    function saveNewOrder() {
        const rows    = Array.from(document.getElementById('launcher-view').querySelectorAll('.script-row'));
        const encoded = rows.map(function (r) {
            return r.getAttribute('data-id').replace(/"/g, '\\"').replace(/\|/g, '%7C');
        });
        csInterface.evalScript('updateFullOrder("' + encoded.join('|') + '")');
    }

    init();

})();
