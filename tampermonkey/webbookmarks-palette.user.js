// ==UserScript==
// @name         WebBookmarks Command Palette
// @namespace    https://webbookmarksapi.azurewebsites.net
// @version      4.6
// @description  Press Ctrl+/ on any page to open the WebBookmarks command palette
// @match        *://*/*
// @exclude      http://192.168.50.100:3002/*
// @exclude      https://192.168.50.100:3000/*
// @exclude      http://192.168.50.101:3002/*
// @exclude      https://192.168.50.101:3000/*
// @exclude      https://www.jimlertech.net/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      webbookmarksapi.azurewebsites.net
// @run-at       document-idle
// @updateURL    https://gist.githubusercontent.com/purduepete/7e7bb1d0855d688bf683069e786ac524/raw/webbookmarks-palette.user.js
// @downloadURL  https://gist.githubusercontent.com/purduepete/7e7bb1d0855d688bf683069e786ac524/raw/webbookmarks-palette.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Don't show palette on the web app (it has its own)
    if (location.origin === 'https://witty-hill-00503bc10.7.azurestaticapps.net') return;

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
            font-family: 'Rubik', sans-serif;
            font-size: 15px;
            color: #b2bac2;
        }
        .wbp-container {
            width: 900px;
            max-width: 94vw;
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 6px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .wbp-search-row {
            display: flex;
            align-items: stretch;
            background: #020617;
            border-bottom: 1px solid #1e293b;
        }
        .wbp-search-row .wbp-input {
            border-bottom: none;
        }
        .wbp-close-btn {
            background: #0f172a;
            border: none;
            border-left: 1px solid #1e293b;
            color: #64748b;
            font-size: 16px;
            padding: 0 14px;
            cursor: pointer;
            margin-left: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .wbp-close-btn:hover {
            color: #e0e6ed;
            background: #1e293b;
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
            font-size: 14px;
        }
        .wbp-loading {
            padding: 20px 16px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
        }
        @keyframes wbp-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        .wbp-loading { animation: wbp-pulse 1.2s ease-in-out infinite; }
        .wbp-item {
            display: grid;
            grid-template-columns: 28px 22px 1fr 70px 120px;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 15px;
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
            font-size: 12px;
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
            font-size: 12px;
            color: #475569;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: right;
        }
        .wbp-item-alias {
            font-size: 11px;
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
        .wbp-divider {
            height: 1px;
            background-color: #1e293b;
            margin: 4px 12px;
        }
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
            gap: 6px;
            padding: 8px 16px;
            border-top: 1px solid #1e293b;
            font-size: 12px;
            color: #475569;
            text-align: center;
        }
        .wbp-shortcuts {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px 12px;
        }
        .wbp-footer kbd {
            display: inline-block;
            padding: 1px 5px;
            font-size: 11px;
            font-family: 'Rubik', sans-serif;
            color: #94a3b8;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 3px;
        }

        .wbp-newtab-toggle {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 12px;
            font-size: 13px;
            font-family: inherit;
            font-weight: 500;
            color: #94a3b8;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 4px;
            cursor: pointer;
        }
        .wbp-newtab-toggle-active {
            color: #3b82f6;
            background: #172554;
            border-color: #3b82f6;
        }
        .wbp-profile-tabs {
            display: flex;
            border-bottom: 1px solid #1e293b;
            background: #020617;
        }
        .wbp-profile-tab {
            padding: 6px 16px;
            font-size: 12px;
            font-weight: 500;
            color: #64748b;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            text-transform: capitalize;
            font-family: inherit;
        }
        .wbp-profile-tab:hover { color: #e0e6ed; }
        .wbp-profile-tab-active { color: #3b82f6; border-bottom-color: #3b82f6; }
        @media (max-width: 768px) {
            .wbp-backdrop { padding: 2.5vh 2.5vw 15vh; align-items: stretch; }
            .wbp-container { max-width: none; width: auto; flex: 1; }
            .wbp-list { flex: 1; max-height: none; }
            .wbp-input { font-size: 16px; padding: 10px 14px; }
            .wbp-footer { flex-direction: column; gap: 4px; text-align: center; }
            .wbp-item {
                grid-template-columns: 20px 20px 1fr auto;
                gap: 6px; padding: 8px 10px; font-size: 16px;
            }
            .wbp-item-secondary { display: none; }
            .wbp-item-alias { font-size: 9px; padding: 1px 4px; }
            .wbp-item-num { font-size: 10px; }
        }
        /* iPad-sized touch devices: make palette fill viewport with custom padding */
        @media (hover: none) and (min-width: 768px) {
            .wbp-backdrop { padding: 5vh 20vw 30vh; align-items: stretch; }
            .wbp-container { width: auto; max-width: none; flex: 1; max-height: none; }
            .wbp-list { flex: 1; max-height: none; }
        }
    `);

    // ── SVG icons ────────────────────────────────────
    const FOLDER_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    const BOOKMARK_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    const BOLT_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    const HEART_SVG =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" style="color:#64748b;vertical-align:middle;margin-right:6px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

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

    // ── MRU ──────────────────────────────────────────────────
    const MRU_LIMIT = 5;
    const MRU_MAX_ENTRIES = 50;
    function mruKey(profile) {
        return 'mru_' + profile;
    }
    function getMru(profile) {
        return GM_getValue(mruKey(profile), []) || [];
    }
    function recordMru(profile, id) {
        if (!id) return;
        const list = getMru(profile);
        const idx = list.findIndex((e) => e.id === id);
        const now = Date.now();
        if (idx >= 0) {
            list[idx].count += 1;
            list[idx].ts = now;
        } else {
            list.push({ id, count: 1, ts: now });
        }
        list.sort((a, b) => b.ts - a.ts || b.count - a.count);
        if (list.length > MRU_MAX_ENTRIES) list.length = MRU_MAX_ENTRIES;
        GM_setValue(mruKey(profile), list);
    }

    // ── Google search ─────────────────────────────────────────
    const GOOGLE_URL = 'https://www.google.com/search?q=';

    // ── Clipboard ───────────────────────────────────────────────
    function copyText(text) {
        return new Promise((resolve) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(
                    () => resolve(true),
                    () => fallback(),
                );
            } else {
                fallback();
            }
            function fallback() {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    resolve(true);
                } catch (_e) {
                    resolve(false);
                }
            }
        });
    }

    // ── Quick-add current page ────────────────────────────────────────────
    function quickAddCurrentPage(profile) {
        const item = {
            name: (document.title || location.hostname).slice(0, 100),
            shortcut: '',
            description: '',
            url: location.href,
            urls: '',
            isVisible: true,
            bookmarkGroup: 'Quick Adds',
            sortOrder: 0,
            profile: profile,
            isFavorite: false,
        };
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_BASE,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(item),
                onload(res) {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            resolve(JSON.parse(res.responseText));
                        } catch (e) {
                            resolve(item);
                        }
                    } else {
                        reject(new Error('HTTP ' + res.status));
                    }
                },
                onerror(e) {
                    reject(e);
                },
            });
        });
    }

    function openUrls(items, newTab) {
        if (items.length === 0) return;
        if (newTab) {
            for (const item of items) {
                GM_openInTab(item.url, { active: true, insert: true });
            }
        } else {
            // Use Tampermonkey's GM_openInTab — it has elevated privileges and
            // is not subject to the browser's popup blocker.
            for (let i = 0; i < items.length - 1; i++) {
                GM_openInTab(items[i].url, { active: false, insert: true });
            }
            // Navigate current tab to the last URL
            window.location.href = items[items.length - 1].url;
        }
    }

    // ── Data ─────────────────────────────────────────
    let cachedGroups = null;
    let cachedProfile = null;
    let cachedProfiles = GM_getValue('cachedProfiles', null);
    let lastFetch = 0;
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    function getActiveProfile() {
        return GM_getValue('activeProfile', 'home');
    }

    function setActiveProfile(profile) {
        GM_setValue('activeProfile', profile);
        // Invalidate in-memory cache when profile changes
        cachedGroups = null;
        cachedProfile = null;
    }

    function getDisabledProfiles() {
        return new Set(GM_getValue('disabledProfiles', []));
    }

    function getLocalBookmarks(profile) {
        return GM_getValue('bookmarks_' + profile, null);
    }

    function setLocalBookmarks(profile, items) {
        GM_setValue('bookmarks_' + profile, items);
    }

    function itemsToGroups(items) {
        const map = new Map();
        for (const b of items) {
            if (!b.isVisible) continue;
            const g = b.bookmarkGroup || 'Ungrouped';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(b);
        }
        return [...map.entries()].map(([name, items]) => ({ name, items }));
    }

    function fetchBookmarks(profile) {
        const url = profile ? API_BASE + '?profile=' + encodeURIComponent(profile) : API_BASE;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
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

    function fetchProfiles() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: API_BASE + '/profiles',
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
        const profile = getActiveProfile();
        if (cachedGroups && cachedProfile === profile && Date.now() - lastFetch < CACHE_TTL) return cachedGroups;
        const items = await fetchBookmarks(profile);
        setLocalBookmarks(profile, items);
        cachedGroups = itemsToGroups(items);
        cachedProfile = profile;
        lastFetch = Date.now();
        // Also fetch profiles in background and persist
        fetchProfiles()
            .then((p) => {
                cachedProfiles = p;
                GM_setValue('cachedProfiles', p);
            })
            .catch(() => {});
        return cachedGroups;
    }

    // ── Palette ──────────────────────────────────────
    let paletteOpen = false;

    // Pre-fetch bookmarks on page load so palette opens instantly
    getGroups().catch(() => {});

    function buildEntries(groups, profiles) {
        const entries = [];
        // Recents (only visible when query is empty; getFiltered strips them otherwise)
        {
            const profile = getActiveProfile();
            const mru = getMru(profile);
            const bmById = new Map();
            for (const g of groups) for (const b of g.items) bmById.set(b.id, b);
            let added = 0;
            for (const m of mru) {
                const b = bmById.get(m.id);
                if (!b) continue;
                entries.push({
                    kind: 'bookmark',
                    label: b.name || '',
                    secondary: b.bookmarkGroup || '',
                    alias: b.shortcut || '',
                    bookmark: b,
                    isRecent: true,
                });
                added++;
                if (added >= MRU_LIMIT) break;
            }
        }
        for (const g of groups) {
            entries.push({
                kind: 'group',
                label: g.name || '',
                secondary: g.items.length + ' bookmark' + (g.items.length !== 1 ? 's' : ''),
                alias: '',
                group: g,
            });
        }
        for (const g of groups) {
            for (const b of g.items) {
                entries.push({
                    kind: 'bookmark',
                    label: b.name || '',
                    secondary: b.bookmarkGroup || '',
                    alias: b.shortcut || '',
                    bookmark: b,
                });
            }
        }
        // Actions (at the bottom)
        entries.push({
            kind: 'action',
            label: 'Add Current Page',
            secondary: (document.title || location.hostname).slice(0, 60),
            alias: 'add new save +',
            action: 'quick-add',
        });
        entries.push({
            kind: 'action',
            label: 'Remove Paywall',
            secondary: '',
            alias: '',
            action: 'remove-paywall',
        });
        entries.push({
            kind: 'action',
            label: 'Reload Bookmarks',
            secondary: '',
            alias: '',
            action: 'reload',
        });
        entries.push({
            kind: 'action',
            label: 'Keyboard Shortcuts',
            secondary: 'press F1',
            alias: 'help ? shortcuts',
            action: 'cheatsheet',
        });
        if (profiles && profiles.length > 1) {
            const current = getActiveProfile();
            const disabled = getDisabledProfiles();
            for (const p of profiles) {
                if (p === 'all' || p === current || disabled.has(p)) continue;
                entries.push({
                    kind: 'action',
                    label: 'Profile: ' + p,
                    secondary: '',
                    alias: '',
                    action: 'select-profile',
                    actionPayload: p,
                });
            }
            for (const p of profiles) {
                if (p === 'all') continue;
                entries.push({
                    kind: 'action',
                    label: disabled.has(p) ? 'Show Profile: ' + p : 'Hide Profile: ' + p,
                    secondary: disabled.has(p) ? 'hidden' : 'visible',
                    alias: '',
                    action: 'toggle-profile-visibility',
                    actionPayload: p,
                });
            }
        }
        return entries;
    }

    function openPalette(groups, profiles, isLoading) {
        if (paletteOpen) return;
        paletteOpen = true;

        let allEntries = groups ? buildEntries(groups, profiles) : [];
        let loading = isLoading || false;
        let query = '';
        let activeIndex = 0;
        let multiSelected = new Set();

        // ── DOM ──
        const backdrop = document.createElement('div');
        backdrop.className = 'wbp-backdrop';

        const container = document.createElement('div');
        container.className = 'wbp-container';
        backdrop.appendChild(container);

        let newTabMode = false;
        const isTouchDevice = window.matchMedia('(hover: none)').matches;

        // Search row (input + close button) — above profile tabs
        const searchRow = document.createElement('div');
        searchRow.className = 'wbp-search-row';
        container.appendChild(searchRow);

        const form = document.createElement('form');
        form.style.display = 'contents';
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSubmit(isTouchDevice ? newTabMode : false);
        });
        searchRow.appendChild(form);

        const input = document.createElement('input');
        input.className = 'wbp-input';
        input.placeholder = 'Search\u2026 (> actions, / bookmarks, @ groups, * favorites)';
        input.type = 'text';
        form.appendChild(input);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'wbp-close-btn';
        closeBtn.type = 'button';
        closeBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeBtn.addEventListener('click', close);
        searchRow.appendChild(closeBtn);

        // Profile tabs (only if more than 1 profile) — below search row
        let tabsEl = null;
        if (profiles && profiles.length > 1) {
            tabsEl = document.createElement('div');
            tabsEl.className = 'wbp-profile-tabs';
            container.appendChild(tabsEl);
            renderTabs();
        }

        function renderTabs() {
            if (!tabsEl) return;
            tabsEl.innerHTML = '';
            const current = getActiveProfile();
            const disabled = getDisabledProfiles();
            for (const p of profiles) {
                if (p === 'all' || disabled.has(p)) continue;
                const btn = document.createElement('button');
                btn.className = 'wbp-profile-tab' + (p === current ? ' wbp-profile-tab-active' : '');
                btn.textContent = p;
                btn.addEventListener('click', async () => {
                    setActiveProfile(p);
                    try {
                        const newGroups = await getGroups();
                        allEntries = buildEntries(newGroups, profiles);
                        query = '';
                        input.value = '';
                        activeIndex = 0;
                        multiSelected = new Set();
                        renderTabs();
                        render();
                    } catch (err) {
                        console.error('[WebBookmarks] Failed to switch profile:', err);
                    }
                });
                tabsEl.appendChild(btn);
            }
        }

        const listEl = document.createElement('div');
        listEl.className = 'wbp-list';
        container.appendChild(listEl);

        const footer = document.createElement('div');
        footer.className = 'wbp-footer';
        container.appendChild(footer);

        const previewEl = document.createElement('div');
        previewEl.className = 'wbp-preview';
        footer.appendChild(previewEl);

        if (isTouchDevice) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'wbp-newtab-toggle';
            toggleBtn.textContent = '\u2192 Same tab';
            toggleBtn.addEventListener('click', () => {
                newTabMode = !newTabMode;
                toggleBtn.textContent = newTabMode ? '\u2197 New tab' : '\u2192 Same tab';
                toggleBtn.className = 'wbp-newtab-toggle' + (newTabMode ? ' wbp-newtab-toggle-active' : '');
            });
            footer.appendChild(toggleBtn);
        } else {
            const hintsEl = document.createElement('div');
            hintsEl.className = 'wbp-shortcuts';
            hintsEl.innerHTML = [
                '<span><kbd>\u2191\u2193</kbd> navigate</span>',
                '<span><kbd>\u2192</kbd> expand group</span>',
                '<span><kbd>\u2190</kbd> back/clear</span>',
                '<span><kbd>Ctrl+Space</kbd> select</span>',
                '<span><kbd>Enter</kbd> open</span>',
                '<span><kbd>Ctrl+Enter</kbd> new tab</span>',
                '<span><kbd>Esc</kbd> close</span>',
                '<span><kbd>1-5</kbd> open by number</span>',
            ].join('');
            footer.appendChild(hintsEl);
        }

        // ── State helpers ──
        function getFiltered() {
            const match = query.match(/^(.*?)\s+([\d,\s\-]+)$/);
            const searchPart = match ? match[1] : query;
            const numberSelection = match ? parseNumberSelection(match[2]) : null;
            const q = searchPart.trim();
            // Recents only show on empty query
            const source = q ? allEntries.filter((e) => !e.isRecent) : allEntries;
            let filtered;
            // Google explicit search: prefix "?"
            if (q.startsWith('?')) {
                const sub = q.slice(1).trim();
                if (!sub) return { filtered: source, numberSelection };
                return {
                    filtered: [
                        {
                            kind: 'action',
                            label: 'Search Google: ' + sub,
                            secondary: 'Google',
                            alias: '',
                            action: 'google-search',
                            actionPayload: sub,
                        },
                    ],
                    numberSelection,
                };
            }
            if (q === '>') {
                filtered = source.filter((e) => e.kind === 'action');
            } else if (q === '/') {
                filtered = source.filter((e) => e.kind === 'bookmark');
            } else if (q === '@') {
                filtered = source.filter((e) => e.kind === 'group');
            } else if (q === '*') {
                filtered = source.filter((e) => e.kind === 'bookmark' && e.bookmark && e.bookmark.isFavorite);
            } else if (q.startsWith('>')) {
                const sub = q.slice(1).trim();
                filtered = source.filter(
                    (e) => e.kind === 'action' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
                );
            } else if (q.startsWith('/')) {
                const sub = q.slice(1).trim();
                filtered = source.filter(
                    (e) =>
                        e.kind === 'bookmark' &&
                        (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
                );
            } else if (q.startsWith('@')) {
                const sub = q.slice(1).trim();
                filtered = source.filter(
                    (e) => e.kind === 'group' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
                );
            } else if (q.startsWith('*')) {
                const sub = q.slice(1).trim();
                filtered = source.filter(
                    (e) =>
                        e.kind === 'bookmark' &&
                        e.bookmark &&
                        e.bookmark.isFavorite &&
                        (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
                );
            } else {
                filtered = q
                    ? source.filter(
                          (e) =>
                              wildcardMatch(e.label, q) || wildcardMatch(e.secondary, q) || wildcardMatch(e.alias, q),
                      )
                    : source;
                // Also include bookmarks with search URLs when the first word matches alias or name (e.g. "g hello world", "seek msft")
                if (q && q.includes(' ')) {
                    var shortcutPart = q.split(/\s+/)[0].toLowerCase();
                    for (var ei = 0; ei < source.length; ei++) {
                        var ent = source[ei];
                        if (
                            ent.kind === 'bookmark' &&
                            ent.bookmark &&
                            ent.bookmark.urls &&
                            ((ent.alias || '').toLowerCase() === shortcutPart ||
                                ent.label.toLowerCase().startsWith(shortcutPart)) &&
                            filtered.indexOf(ent) === -1
                        ) {
                            filtered.push(ent);
                        }
                    }
                }
            }
            // Google fallback when nothing matched
            if (q && filtered.length === 0) {
                filtered = [
                    {
                        kind: 'action',
                        label: 'Search Google: ' + q,
                        secondary: 'No bookmark matches \u2014 search the web',
                        alias: '',
                        action: 'google-search',
                        actionPayload: q,
                    },
                ];
            }
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
            if (loading) {
                const loadingEl = document.createElement('div');
                loadingEl.className = 'wbp-loading';
                loadingEl.textContent = 'Loading bookmarks\u2026';
                listEl.appendChild(loadingEl);
            } else if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'wbp-empty';
                empty.textContent = 'No matches';
                listEl.appendChild(empty);
            } else {
                let prevKind = null;
                for (let i = 0; i < filtered.length; i++) {
                    const entry = filtered[i];

                    // Divider between kind transitions
                    if (prevKind !== null && prevKind !== entry.kind) {
                        const divider = document.createElement('div');
                        divider.className = 'wbp-divider';
                        listEl.appendChild(divider);
                    }
                    prevKind = entry.kind;

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

                    const icon =
                        entry.kind === 'group' ? FOLDER_SVG : entry.kind === 'action' ? BOLT_SVG : BOOKMARK_SVG;
                    const favIcon = entry.bookmark && entry.bookmark.isFavorite ? HEART_SVG : '';
                    row.innerHTML =
                        `<span class="wbp-item-num">${isMultiSelected ? '\u2713' : seq != null ? seq : ''}</span>` +
                        `<span class="wbp-item-kind">${icon}</span>` +
                        `<span class="wbp-item-label">${favIcon}${escapeHtml(entry.label)}</span>` +
                        `<span class="wbp-item-alias${entry.alias ? '' : ' wbp-item-alias-empty'}">${escapeHtml(entry.alias)}</span>` +
                        `<span class="wbp-item-secondary">${escapeHtml(entry.secondary)}</span>`;

                    row.addEventListener('mouseenter', () => {
                        activeIndex = i;
                        render();
                    });
                    row.addEventListener('click', (ev) => {
                        const nt = isTouchDevice ? newTabMode : ev.ctrlKey || ev.metaKey;
                        if (multiSelected.size > 0) {
                            if (multiSelected.has(i)) multiSelected.delete(i);
                            else multiSelected.add(i);
                            render();
                        } else if (numberSelection) {
                            openByNumbers(filtered, bookmarkNumbers, numberSelection, nt);
                        } else {
                            activateEntry(entry, nt);
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
                var previewUrl = entry.bookmark.url;
                if (entry.bookmark.urls) {
                    var pq = query.trim();
                    var pparts = pq.split(/\s+/);
                    var palias = (entry.bookmark.shortcut || '').trim().toLowerCase();
                    var pfirstWord = pparts[0].toLowerCase();
                    if (
                        pparts.length > 1 &&
                        ((palias && pfirstWord === palias) ||
                            (entry.bookmark.name || '').toLowerCase().startsWith(pfirstWord))
                    ) {
                        previewUrl = entry.bookmark.urls.replace('{q}', encodeURIComponent(pparts.slice(1).join(' ')));
                    }
                }
                previewEl.textContent = previewUrl;
            } else if (entry?.kind === 'group' && entry.group) {
                previewEl.textContent = entry.group.items.length + ' bookmarks \u2014 Enter to open all';
            } else if (entry?.kind === 'action') {
                previewEl.textContent = 'Action \u2014 Enter to execute';
            } else {
                previewEl.textContent = '';
            }
        }

        function activateEntry(entry, newTab) {
            const currentProfile = getActiveProfile();
            if (entry.kind === 'group' && entry.group) {
                for (const b of entry.group.items) recordMru(currentProfile, b.id);
                openUrls(
                    entry.group.items.map((b) => ({ name: b.name, url: b.url })),
                    newTab,
                );
                if (!newTab) close();
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                var targetUrl = entry.bookmark.url;
                if (entry.bookmark.urls) {
                    var bq = query.trim();
                    var bparts = bq.split(/\s+/);
                    var balias = (entry.bookmark.shortcut || '').trim().toLowerCase();
                    var bfirstWord = bparts[0].toLowerCase();
                    if (
                        bparts.length > 1 &&
                        ((balias && bfirstWord === balias) ||
                            (entry.bookmark.name || '').toLowerCase().startsWith(bfirstWord))
                    ) {
                        targetUrl = entry.bookmark.urls.replace('{q}', encodeURIComponent(bparts.slice(1).join(' ')));
                    }
                }
                recordMru(currentProfile, entry.bookmark.id);
                if (newTab) {
                    GM_openInTab(targetUrl, { active: true, insert: true });
                } else {
                    window.location.href = targetUrl;
                }
                if (!newTab) close();
            } else if (entry.kind === 'action' && entry.action === 'google-search') {
                const u = GOOGLE_URL + encodeURIComponent(entry.actionPayload || '');
                if (newTab) GM_openInTab(u, { active: true, insert: true });
                else window.location.href = u;
                if (!newTab) close();
            } else if (entry.kind === 'action' && entry.action === 'quick-add') {
                showToast('Saving…');
                quickAddCurrentPage(currentProfile)
                    .then((saved) => {
                        showToast('Saved to ' + currentProfile + ' / Quick Adds');
                        // Invalidate cache so next palette open reflects the new bookmark
                        cachedGroups = null;
                        cachedProfile = null;
                        lastFetch = 0;
                    })
                    .catch((err) => {
                        console.error('[WebBookmarks] Quick-add failed:', err);
                        showToast('Save failed: ' + (err && err.message ? err.message : 'unknown'));
                    });
            } else if (entry.kind === 'action' && entry.action === 'cheatsheet') {
                showCheatsheet();
            } else if (entry.kind === 'action' && entry.action === 'remove-paywall') {
                window.location.href = 'https://removepaywalls.com/' + window.location.href;
                close();
            } else if (entry.kind === 'action' && entry.action === 'reload') {
                cachedGroups = null;
                cachedProfile = null;
                lastFetch = 0;
                getGroups()
                    .then((newGroups) => {
                        allEntries = buildEntries(newGroups, profiles);
                        query = '';
                        input.value = '';
                        activeIndex = 0;
                        multiSelected = new Set();
                        render();
                    })
                    .catch((err) => {
                        console.error('[WebBookmarks] Failed to reload bookmarks:', err);
                    });
            } else if (entry.kind === 'action' && entry.action === 'select-profile') {
                setActiveProfile(entry.actionPayload);
                getGroups()
                    .then((newGroups) => {
                        allEntries = buildEntries(newGroups, profiles);
                        query = '';
                        input.value = '';
                        activeIndex = 0;
                        multiSelected = new Set();
                        renderTabs();
                        render();
                    })
                    .catch((err) => {
                        console.error('[WebBookmarks] Failed to switch profile:', err);
                    });
            } else if (entry.kind === 'action' && entry.action === 'toggle-profile-visibility') {
                const disabled = getDisabledProfiles();
                if (disabled.has(entry.actionPayload)) disabled.delete(entry.actionPayload);
                else disabled.add(entry.actionPayload);
                GM_setValue('disabledProfiles', [...disabled]);
                allEntries = buildEntries(cachedGroups || [], profiles);
                query = '';
                input.value = '';
                activeIndex = 0;
                multiSelected = new Set();
                renderTabs();
                render();
            }
        }

        function openByNumbers(filtered, bookmarkNumbers, nums, newTab) {
            const currentProfile = getActiveProfile();
            const toOpen = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && filtered[idx]?.bookmark) {
                    const bm = filtered[idx].bookmark;
                    recordMru(currentProfile, bm.id);
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                if (!newTab) close();
                else {
                    query = '';
                    input.value = '';
                    activeIndex = 0;
                    multiSelected = new Set();
                    render();
                }
            }
        }

        function openMultiSelected(filtered, newTab) {
            const currentProfile = getActiveProfile();
            const toOpen = [];
            for (const idx of multiSelected) {
                const entry = filtered[idx];
                if (entry?.kind === 'bookmark' && entry.bookmark) {
                    recordMru(currentProfile, entry.bookmark.id);
                    toOpen.push({ name: entry.bookmark.name, url: entry.bookmark.url });
                } else if (entry?.kind === 'group' && entry.group) {
                    for (const b of entry.group.items) {
                        recordMru(currentProfile, b.id);
                        toOpen.push({ name: b.name, url: b.url });
                    }
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                if (!newTab) close();
                else {
                    query = '';
                    input.value = '';
                    activeIndex = 0;
                    multiSelected = new Set();
                    render();
                }
            }
        }

        function handleSubmit(newTab) {
            const { filtered, numberSelection } = getFiltered();
            const bookmarkNumbers = getBookmarkNumbers(filtered);
            if (multiSelected.size > 0) {
                openMultiSelected(filtered, newTab);
            } else if (numberSelection) {
                openByNumbers(filtered, bookmarkNumbers, numberSelection, newTab);
            } else if (filtered[activeIndex]) {
                activateEntry(filtered[activeIndex], newTab);
            }
        }

        function close() {
            backdrop.remove();
            paletteOpen = false;
        }

        // ── Toast ──
        let toastEl = null;
        let toastTimer = null;
        function showToast(msg) {
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.style.cssText = [
                    'position:absolute',
                    'bottom:60px',
                    'left:50%',
                    'transform:translateX(-50%)',
                    'background:#1e293b',
                    'color:#e0e6ed',
                    'padding:8px 14px',
                    'border-radius:4px',
                    'font-size:13px',
                    'box-shadow:0 4px 12px rgba(0,0,0,0.5)',
                    'border:1px solid #334155',
                    'z-index:20',
                    'pointer-events:none',
                ].join(';');
                container.style.position = 'relative';
                container.appendChild(toastEl);
            }
            toastEl.textContent = msg;
            toastEl.style.display = 'block';
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                if (toastEl) toastEl.style.display = 'none';
            }, 1800);
        }

        // ── Cheatsheet ──
        let cheatsheetEl = null;
        const cheatsheetItems = [
            ['↑ ↓', 'Navigate'],
            ['→', 'Expand selected group'],
            ['← / Esc', 'Back / clear / close'],
            ['Enter', 'Open'],
            ['Ctrl+Enter', 'Open in new tab'],
            ['Ctrl+Space', 'Toggle multi-select'],
            ['1-9 (then Enter)', 'Open by number(s) — e.g. "foo 1,3-5"'],
            ['Ctrl+C', 'Copy URL of selected entry'],
            ['Ctrl+Shift+C', 'Copy as Markdown link'],
            ['Ctrl+N', 'Quick-add current page'],
            ['Ctrl+`', 'Cycle through profiles'],
            ['Ctrl+/', 'Toggle palette (outside palette)'],
            ['F1', 'Show this cheatsheet'],
            ['? <query>', 'Search Google'],
            ['> <query>', 'Search actions only'],
            ['/ <query>', 'Search bookmarks only'],
            ['@ <query>', 'Search groups only'],
            ['* <query>', 'Search favorites only'],
        ];
        function showCheatsheet() {
            if (cheatsheetEl) {
                cheatsheetEl.style.display = 'flex';
                return;
            }
            cheatsheetEl = document.createElement('div');
            cheatsheetEl.style.cssText = [
                'position:absolute',
                'inset:0',
                'background:rgba(2,6,23,0.96)',
                'z-index:10',
                'padding:20px 24px',
                'overflow-y:auto',
                'display:flex',
                'flex-direction:column',
                'gap:12px',
            ].join(';');
            const header = document.createElement('div');
            header.style.cssText =
                'display:flex;justify-content:space-between;align-items:center;color:#e0e6ed;font-size:14px;font-weight:600';
            header.innerHTML =
                '<span>Keyboard Shortcuts</span><span style="color:#64748b;font-size:12px">Click anywhere or press Esc to close</span>';
            cheatsheetEl.appendChild(header);
            const grid = document.createElement('div');
            grid.style.cssText =
                'display:grid;grid-template-columns:220px 1fr;row-gap:6px;column-gap:16px;font-size:13px';
            for (const [k, d] of cheatsheetItems) {
                const a = document.createElement('div');
                a.style.cssText = 'color:#94a3b8;font-family:monospace';
                a.textContent = k;
                const b = document.createElement('div');
                b.style.cssText = 'color:#b2bac2';
                b.textContent = d;
                grid.appendChild(a);
                grid.appendChild(b);
            }
            cheatsheetEl.appendChild(grid);
            cheatsheetEl.addEventListener('click', hideCheatsheet);
            container.style.position = 'relative';
            container.appendChild(cheatsheetEl);
        }
        function hideCheatsheet() {
            if (cheatsheetEl) cheatsheetEl.style.display = 'none';
        }
        function cheatsheetVisible() {
            return cheatsheetEl && cheatsheetEl.style.display !== 'none';
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
                if (cheatsheetVisible()) {
                    hideCheatsheet();
                    return;
                }
                close();
                return;
            }
            if (e.key === 'F1') {
                e.preventDefault();
                if (cheatsheetVisible()) hideCheatsheet();
                else showCheatsheet();
                return;
            }
            if (e.key === 'c' && e.ctrlKey && !e.altKey) {
                const { filtered } = getFiltered();
                const entry = filtered[activeIndex];
                if (entry && entry.kind === 'bookmark' && entry.bookmark) {
                    e.preventDefault();
                    const url = entry.bookmark.url;
                    const name = entry.bookmark.name || '';
                    if (e.shiftKey) {
                        copyText('[' + name + '](' + url + ')').then((ok) =>
                            showToast(ok ? 'Copied markdown link' : 'Copy failed'),
                        );
                    } else {
                        copyText(url).then((ok) => showToast(ok ? 'Copied URL' : 'Copy failed'));
                    }
                    return;
                }
            }
            if (e.key === 'n' && e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                showToast('Saving\u2026');
                quickAddCurrentPage(getActiveProfile())
                    .then(() => {
                        showToast('Saved to ' + getActiveProfile() + ' / Quick Adds');
                        cachedGroups = null;
                        cachedProfile = null;
                        lastFetch = 0;
                    })
                    .catch((err) => {
                        console.error('[WebBookmarks] Quick-add failed:', err);
                        showToast('Save failed: ' + (err && err.message ? err.message : 'unknown'));
                    });
                return;
            }

            const { filtered } = getFiltered();
            const maxIdx = filtered.length - 1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, maxIdx);
                render();
                return;
            }
            if (e.key === 'ArrowUp') {
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
            if (e.key === '`' && e.ctrlKey) {
                const disabled = getDisabledProfiles();
                const visible = (profiles || []).filter((p) => p !== 'all' && !disabled.has(p));
                if (visible.length < 2) return;
                e.preventDefault();
                const current = getActiveProfile();
                const idx = visible.indexOf(current);
                const delta = e.shiftKey ? -1 : 1;
                const nextProfile = visible[(idx + delta + visible.length) % visible.length];
                setActiveProfile(nextProfile);
                getGroups()
                    .then((newGroups) => {
                        allEntries = buildEntries(newGroups, profiles);
                        query = '';
                        input.value = '';
                        activeIndex = 0;
                        multiSelected = new Set();
                        renderTabs();
                        render();
                    })
                    .catch((err) => {
                        console.error('[WebBookmarks] Failed to switch profile:', err);
                    });
                return;
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit(true);
                return;
            }
        });

        // ── Mount ──
        document.body.appendChild(backdrop);
        input.focus();
        render();

        // Return a handle to populate data after open
        return {
            setData(newGroups, newProfiles) {
                profiles = newProfiles;
                allEntries = buildEntries(newGroups, newProfiles);
                loading = false;
                if (tabsEl) renderTabs();
                else if (newProfiles && newProfiles.length > 1) {
                    tabsEl = document.createElement('div');
                    tabsEl.className = 'wbp-profile-tabs';
                    container.insertBefore(tabsEl, listEl);
                    renderTabs();
                }
                render();
            },
            setError(msg) {
                loading = false;
                listEl.innerHTML = '';
                const el = document.createElement('div');
                el.className = 'wbp-empty';
                el.textContent = 'Failed to load: ' + msg;
                listEl.appendChild(el);
            },
        };
    }

    // ── Global hotkey: Ctrl + / (toggle) ───────────────
    document.addEventListener(
        'keydown',
        async (e) => {
            const isSlash = e.code === 'Slash' || e.key === '/' || e.key === '\u00F7';
            if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && isSlash) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (paletteOpen) {
                    // Close palette on second Ctrl+/
                    const backdrop = document.querySelector('.wbp-backdrop');
                    if (backdrop) backdrop.remove();
                    paletteOpen = false;
                    return;
                }

                const profile = getActiveProfile();
                const profiles = cachedProfiles || ['home'];

                // If in-memory cache is warm, open instantly
                if (cachedGroups && cachedProfile === profile && Date.now() - lastFetch < CACHE_TTL) {
                    openPalette(cachedGroups, profiles, false);
                    return;
                }

                // Try local storage for instant display, then refresh from API
                const localItems = getLocalBookmarks(profile);
                if (localItems) {
                    const localGroups = itemsToGroups(localItems);
                    const handle = openPalette(localGroups, profiles, false);
                    // Refresh in background
                    getGroups()
                        .then((freshGroups) => {
                            const freshProfiles = cachedProfiles || profiles;
                            if (paletteOpen) handle.setData(freshGroups, freshProfiles);
                        })
                        .catch(() => {}); // stale data is fine
                    return;
                }

                // No local data — show loading state
                const handle = openPalette(null, null, true);
                try {
                    const groups = await getGroups();
                    const freshProfiles = cachedProfiles || (await fetchProfiles().catch(() => ['home']));
                    cachedProfiles = freshProfiles;
                    if (paletteOpen) handle.setData(groups, freshProfiles);
                } catch (err) {
                    console.error('[WebBookmarks] Failed to fetch bookmarks:', err);
                    if (paletteOpen) handle.setError(err.message);
                }
            }
        },
        true,
    );
})();
