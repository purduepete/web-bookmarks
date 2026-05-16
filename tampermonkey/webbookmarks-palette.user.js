// ==UserScript==
// @name         WebBookmarks Command Palette
// @namespace    https://webbookmarksapi.azurewebsites.net
// @version      1.0
// @description  Press Ctrl+/ on any page to open the WebBookmarks command palette
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_openInTab
// @connect      webbookmarksapi.azurewebsites.net
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = 'https://webbookmarksapi.azurewebsites.net/api/bookmarks';

    // ── CSS ──────────────────────────────────────────
    GM_addStyle(`
        .wbp-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.7);
            display: flex;
            align-items: flex-start;
            justify-content: center;
            z-index: 2147483647;
            padding-top: 12vh;
            font-family: 'Segoe UI', 'Rubik', -apple-system, sans-serif;
            font-size: 15px;
            color: #b2bac2;
        }
        .wbp-container {
            width: 560px;
            max-width: 94vw;
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 6px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .wbp-input {
            width: 100%;
            padding: 12px 16px;
            font-size: 15px;
            font-family: inherit;
            font-weight: 500;
            color: #e0e6ed;
            background: #020617;
            border: none;
            border-bottom: 1px solid #1e293b;
            outline: none;
            caret-color: #3b82f6;
            box-sizing: border-box;
        }
        .wbp-input::placeholder { color: #475569; }
        .wbp-list {
            max-height: 380px;
            overflow-y: auto;
            padding: 4px 0;
        }
        .wbp-list::-webkit-scrollbar { width: 6px; }
        .wbp-list::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        .wbp-empty {
            padding: 20px 16px;
            text-align: center;
            color: #475569;
            font-size: 13px;
        }
        .wbp-item {
            display: grid;
            grid-template-columns: 28px 22px 1fr 70px 120px;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            color: #b2bac2;
            transition: background 0.08s;
        }
        .wbp-item-active { background: #1e293b; color: #e0e6ed; }
        .wbp-item-selected { background: #172554; color: #93c5fd; }
        .wbp-item-selected.wbp-item-active { background: #1e3a5f; }
        .wbp-item-multi { background: #172554; color: #93c5fd; }
        .wbp-item-multi.wbp-item-active { background: #1e3a5f; }
        .wbp-item-num {
            text-align: right;
            font-size: 11px;
            color: #475569;
            font-variant-numeric: tabular-nums;
        }
        .wbp-item-kind {
            font-size: 14px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .wbp-item-label {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 500;
        }
        .wbp-item-secondary {
            font-size: 11px;
            color: #475569;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: right;
        }
        .wbp-item-alias {
            font-size: 10px;
            color: #3b82f6;
            background: #172554;
            padding: 1px 6px;
            border-radius: 3px;
            font-family: monospace;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            justify-self: center;
        }
        .wbp-item-alias-empty { background: none; }
        .wbp-preview {
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 11px;
            color: #3b82f6;
            margin-bottom: 4px;
        }
        .wbp-footer {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 8px 16px;
            border-top: 1px solid #1e293b;
            font-size: 12px;
            color: #475569;
            text-align: center;
        }
        .wbp-footer kbd {
            display: inline-block;
            padding: 1px 5px;
            font-size: 11px;
            font-family: inherit;
            color: #94a3b8;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 3px;
        }
        .wbp-footer-hint { font-style: italic; }
        @media (max-width: 768px) {
            .wbp-backdrop { padding-top: 6vh; }
            .wbp-container { max-width: 96vw; }
            .wbp-input { font-size: 16px; padding: 10px 14px; }
            .wbp-item {
                grid-template-columns: 20px 20px 1fr auto;
                gap: 6px; padding: 8px 10px; font-size: 14px;
            }
            .wbp-item-secondary { display: none; }
            .wbp-item-alias { font-size: 9px; padding: 1px 4px; }
            .wbp-item-num { font-size: 10px; }
        }
    `);

    // ── SVG icons ────────────────────────────────────
    const FOLDER_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    const BOOKMARK_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

    // ── Helpers ──────────────────────────────────────
    function wildcardMatch(text, pattern) {
        const lower = text.toLowerCase();
        if (!pattern.includes('*')) return lower.includes(pattern.toLowerCase());
        const parts = pattern.toLowerCase().split('*');
        let pos = 0;
        for (const part of parts) {
            if (!part) continue;
            const idx = lower.indexOf(part, pos);
            if (idx === -1) return false;
            pos = idx + part.length;
        }
        return true;
    }

    function parseNumberSelection(input) {
        const nums = new Set();
        const parts = input.split(',').map((s) => s.trim());
        for (const p of parts) {
            if (!p) continue;
            const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) {
                const lo = +m[1],
                    hi = +m[2];
                if (isNaN(lo) || isNaN(hi)) return null;
                for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) nums.add(i);
            } else if (/^\d+$/.test(p)) {
                nums.add(+p);
            } else {
                return null;
            }
        }
        return nums.size > 0 ? nums : null;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function openUrls(items) {
        if (items.length === 0) return;
        // Use Tampermonkey's GM_openInTab — it has elevated privileges and
        // is not subject to the browser's popup blocker.
        for (let i = 0; i < items.length - 1; i++) {
            GM_openInTab(items[i].url, { active: false, insert: true });
        }
        // Navigate current tab to the last URL
        window.location.href = items[items.length - 1].url;
    }

    // ── Data ─────────────────────────────────────────
    let cachedGroups = null;
    let lastFetch = 0;
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    function fetchBookmarks() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: API_BASE,
                onload(res) {
                    if (res.status !== 200) return reject(new Error('HTTP ' + res.status));
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror(e) {
                    reject(e);
                },
            });
        });
    }

    async function getGroups() {
        if (cachedGroups && Date.now() - lastFetch < CACHE_TTL) return cachedGroups;
        const items = await fetchBookmarks();
        const map = new Map();
        for (const b of items) {
            if (!b.isVisible) continue;
            const g = b.bookmarkGroup || 'Ungrouped';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(b);
        }
        cachedGroups = [...map.entries()].map(([name, items]) => ({ name, items }));
        lastFetch = Date.now();
        return cachedGroups;
    }

    // ── Palette ──────────────────────────────────────
    let paletteOpen = false;

    function buildEntries(groups) {
        const entries = [];
        for (const g of groups) {
            entries.push({
                kind: 'group',
                label: g.name,
                secondary: g.items.length + ' bookmark' + (g.items.length !== 1 ? 's' : ''),
                alias: '',
                group: g,
            });
        }
        for (const g of groups) {
            for (const b of g.items) {
                entries.push({
                    kind: 'bookmark',
                    label: b.name,
                    secondary: b.bookmarkGroup,
                    alias: b.shortcut || '',
                    bookmark: b,
                });
            }
        }
        return entries;
    }

    function openPalette(groups) {
        if (paletteOpen) return;
        paletteOpen = true;

        const allEntries = buildEntries(groups);
        let query = '';
        let activeIndex = 0;
        let multiSelected = new Set();

        // ── DOM ──
        const backdrop = document.createElement('div');
        backdrop.className = 'wbp-backdrop';

        const container = document.createElement('div');
        container.className = 'wbp-container';
        backdrop.appendChild(container);

        const form = document.createElement('form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit();
        });
        container.appendChild(form);

        const input = document.createElement('input');
        input.className = 'wbp-input';
        input.placeholder = 'Search bookmarks and groups\u2026';
        input.type = 'text';
        form.appendChild(input);

        const listEl = document.createElement('div');
        listEl.className = 'wbp-list';
        container.appendChild(listEl);

        const footer = document.createElement('div');
        footer.className = 'wbp-footer';
        container.appendChild(footer);

        const previewEl = document.createElement('div');
        previewEl.className = 'wbp-preview';
        footer.appendChild(previewEl);

        const hintsEl = document.createElement('span');
        hintsEl.innerHTML =
            '<kbd>\u2191\u2193</kbd> navigate &nbsp; <kbd>\u2192</kbd> expand group &nbsp; <kbd>\u2190</kbd> back &nbsp; <kbd>Ctrl+Space</kbd> select &nbsp; <kbd>Enter</kbd> open &nbsp; <kbd>Esc</kbd> close';
        footer.appendChild(hintsEl);

        const hintExtra = document.createElement('span');
        hintExtra.className = 'wbp-footer-hint';
        hintExtra.textContent = 'Type a number range to open multiple (e.g. 1-5)';
        footer.appendChild(hintExtra);

        // ── State helpers ──
        function getFiltered() {
            const match = query.match(/^(.*?)\s+([\d,\s\-]+)$/);
            const searchPart = match ? match[1] : query;
            const numberSelection = match ? parseNumberSelection(match[2]) : null;
            const q = searchPart.trim();
            const filtered = q
                ? allEntries.filter(
                      (e) => wildcardMatch(e.label, q) || wildcardMatch(e.secondary, q) || wildcardMatch(e.alias, q),
                  )
                : allEntries;
            return { filtered, numberSelection };
        }

        function getBookmarkNumbers(list) {
            const map = new Map();
            let seq = 1;
            for (let i = 0; i < list.length; i++) {
                if (list[i].kind === 'bookmark') map.set(i, seq++);
            }
            return map;
        }

        function render() {
            const { filtered, numberSelection } = getFiltered();
            const bookmarkNumbers = getBookmarkNumbers(filtered);
            if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1);

            listEl.innerHTML = '';
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'wbp-empty';
                empty.textContent = 'No matches';
                listEl.appendChild(empty);
            } else {
                for (let i = 0; i < filtered.length; i++) {
                    const entry = filtered[i];
                    const isActive = i === activeIndex;
                    const seq = bookmarkNumbers.get(i);
                    const isNumberSelected = seq != null && numberSelection?.has(seq);
                    const isMultiSelected = multiSelected.has(i);

                    const row = document.createElement('div');
                    let cls = 'wbp-item';
                    if (isActive) cls += ' wbp-item-active';
                    if (isNumberSelected) cls += ' wbp-item-selected';
                    if (isMultiSelected) cls += ' wbp-item-multi';
                    row.className = cls;

                    row.innerHTML =
                        `<span class="wbp-item-num">${isMultiSelected ? '\u2713' : seq != null ? seq : ''}</span>` +
                        `<span class="wbp-item-kind">${entry.kind === 'group' ? FOLDER_SVG : BOOKMARK_SVG}</span>` +
                        `<span class="wbp-item-label">${escapeHtml(entry.label)}</span>` +
                        `<span class="wbp-item-alias${entry.alias ? '' : ' wbp-item-alias-empty'}">${escapeHtml(entry.alias)}</span>` +
                        `<span class="wbp-item-secondary">${escapeHtml(entry.secondary)}</span>`;

                    row.addEventListener('mouseenter', () => {
                        activeIndex = i;
                        render();
                    });
                    row.addEventListener('click', () => {
                        if (multiSelected.size > 0) {
                            if (multiSelected.has(i)) multiSelected.delete(i);
                            else multiSelected.add(i);
                            render();
                        } else if (numberSelection) {
                            openByNumbers(filtered, bookmarkNumbers, numberSelection);
                        } else {
                            activateEntry(entry);
                        }
                    });
                    listEl.appendChild(row);
                }
            }

            // Scroll active into view
            const activeEl = listEl.children[activeIndex];
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });

            // Preview
            const entry = filtered[activeIndex];
            if (entry?.kind === 'bookmark' && entry.bookmark) {
                previewEl.textContent = entry.bookmark.url;
            } else if (entry?.kind === 'group' && entry.group) {
                previewEl.textContent = entry.group.items.length + ' bookmarks \u2014 Enter to open all';
            } else {
                previewEl.textContent = '';
            }
        }

        function activateEntry(entry) {
            if (entry.kind === 'group' && entry.group) {
                openUrls(entry.group.items.map((b) => ({ name: b.name, url: b.url })));
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                window.location.href = entry.bookmark.url;
            }
            close();
        }

        function openByNumbers(filtered, bookmarkNumbers, nums) {
            const toOpen = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && filtered[idx]?.bookmark) {
                    const bm = filtered[idx].bookmark;
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen);
                close();
            }
        }

        function openMultiSelected(filtered) {
            const toOpen = [];
            for (const idx of multiSelected) {
                const entry = filtered[idx];
                if (entry?.kind === 'bookmark' && entry.bookmark) {
                    toOpen.push({ name: entry.bookmark.name, url: entry.bookmark.url });
                } else if (entry?.kind === 'group' && entry.group) {
                    for (const b of entry.group.items) toOpen.push({ name: b.name, url: b.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen);
                close();
            }
        }

        function handleSubmit() {
            const { filtered, numberSelection } = getFiltered();
            const bookmarkNumbers = getBookmarkNumbers(filtered);
            if (multiSelected.size > 0) {
                openMultiSelected(filtered);
            } else if (numberSelection) {
                openByNumbers(filtered, bookmarkNumbers, numberSelection);
            } else if (filtered[activeIndex]) {
                activateEntry(filtered[activeIndex]);
            }
        }

        function close() {
            backdrop.remove();
            paletteOpen = false;
        }

        // ── Events ──
        backdrop.addEventListener('mousedown', (e) => {
            if (e.target === backdrop) close();
        });
        container.addEventListener('mousedown', (e) => e.stopPropagation());

        input.addEventListener('input', () => {
            query = input.value;
            activeIndex = 0;
            multiSelected = new Set();
            render();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
            }
            if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
                e.preventDefault();
                const { filtered } = getFiltered();
                activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
                render();
                return;
            }
            if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
                render();
                return;
            }
            if (e.key === 'ArrowRight') {
                const { filtered } = getFiltered();
                const entry = filtered[activeIndex];
                if (entry?.kind === 'group' && entry.group) {
                    e.preventDefault();
                    query = entry.group.name;
                    input.value = query;
                    activeIndex = 0;
                    multiSelected = new Set();
                    render();
                }
                return;
            }
            if (e.key === 'ArrowLeft') {
                if (query) {
                    e.preventDefault();
                    query = '';
                    input.value = '';
                    activeIndex = 0;
                    multiSelected = new Set();
                    render();
                }
                return;
            }
            if (e.key === ' ' && e.ctrlKey) {
                e.preventDefault();
                if (multiSelected.has(activeIndex)) multiSelected.delete(activeIndex);
                else multiSelected.add(activeIndex);
                render();
                return;
            }
        });

        // ── Mount ──
        document.body.appendChild(backdrop);
        input.focus();
        render();

        // Global Escape listener — closes palette even when input doesn't have focus
        function onDocKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                close();
            }
        }
        document.addEventListener('keydown', onDocKeyDown, true);

        const origClose = close;
        close = function () {
            document.removeEventListener('keydown', onDocKeyDown, true);
            origClose();
        };
    }

    // ── Global hotkey: Ctrl + / ──────────────────────
    document.addEventListener(
        'keydown',
        async (e) => {
            const isSlash = e.code === 'Slash' || e.key === '/' || e.key === '\u00F7';
            if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && isSlash) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (paletteOpen) return;
                try {
                    const groups = await getGroups();
                    openPalette(groups);
                } catch (err) {
                    console.error('[WebBookmarks] Failed to fetch bookmarks:', err);
                    alert('[WebBookmarks] Failed to load bookmarks: ' + err.message);
                }
            }
        },
        true,
    );
})();
