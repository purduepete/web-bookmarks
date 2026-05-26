import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { WebBookmarksItem, BookmarkGroup } from '../types';
import { wildcardMatch, openUrls } from '../utils';

interface Props {
    groups: BookmarkGroup[];
    onClose: (navigating?: boolean) => void;
    onAction: (action: string, payload?: string) => void;
    profiles: string[];
    activeProfile: string;
    isPaletteMode: boolean;
}

interface PaletteEntry {
    kind: 'bookmark' | 'group' | 'action';
    label: string;
    secondary: string;
    alias: string;
    bookmark?: WebBookmarksItem;
    group?: BookmarkGroup;
    action?: string;
    actionPayload?: string;
    isRecent?: boolean;
}

// ── MRU (most-recently-used) tracking ──────────────────
const MRU_LIMIT = 5;
const MRU_MAX_ENTRIES = 50;
interface MruEntry {
    id: number;
    count: number;
    ts: number;
}
function mruKey(profile: string) {
    return `mru:${profile}`;
}
function getMru(profile: string): MruEntry[] {
    try {
        const raw = localStorage.getItem(mruKey(profile));
        return raw ? (JSON.parse(raw) as MruEntry[]) : [];
    } catch {
        return [];
    }
}
function recordMru(profile: string, id: number) {
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
    // Sort by frecency: recency-weighted count
    list.sort((a, b) => b.ts - a.ts || b.count - a.count);
    if (list.length > MRU_MAX_ENTRIES) list.length = MRU_MAX_ENTRIES;
    try {
        localStorage.setItem(mruKey(profile), JSON.stringify(list));
    } catch {
        /* quota */
    }
}

const GOOGLE_URL = 'https://www.google.com/search?q=';

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch {
            return false;
        }
    }
}

function parseNumberSelection(input: string): Set<number> | null {
    const nums = new Set<number>();
    const parts = input.split(',').map((s) => s.trim());
    for (const part of parts) {
        if (!part) continue;
        const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const lo = parseInt(rangeMatch[1], 10);
            const hi = parseInt(rangeMatch[2], 10);
            if (isNaN(lo) || isNaN(hi)) return null;
            for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) nums.add(i);
        } else if (/^\d+$/.test(part)) {
            nums.add(parseInt(part, 10));
        } else {
            return null;
        }
    }
    return nums.size > 0 ? nums : null;
}

export default function CommandPalette({ groups, onClose, onAction, profiles, activeProfile, isPaletteMode }: Props) {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set()); // set of filtered indices
    const isTouchDevice = useMemo(() => window.matchMedia('(hover: none)').matches, []);
    const [newTabMode, setNewTabMode] = useState(false);
    const submitFiredRef = useRef(false);
    const [toast, setToast] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
    const showToast = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 1800);
    }, []);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Build the flat list of entries: recents (when no query), groups, bookmarks, actions
    const allEntries = useMemo<PaletteEntry[]>(() => {
        const entries: PaletteEntry[] = [];
        // Recents (only injected when query is empty — handled in `filtered` step,
        // but we precompute the lookup here so they reuse the same data)
        const mru = getMru(activeProfile);
        const allBookmarks: WebBookmarksItem[] = [];
        for (const g of groups) for (const b of g.items) allBookmarks.push(b);
        const bmById = new Map<number, WebBookmarksItem>();
        for (const b of allBookmarks) bmById.set(b.id, b);
        const recents: PaletteEntry[] = [];
        for (const m of mru) {
            const b = bmById.get(m.id);
            if (!b) continue;
            recents.push({
                kind: 'bookmark',
                label: b.name,
                secondary: b.bookmarkGroup,
                alias: b.shortcut,
                bookmark: b,
                isRecent: true,
            });
            if (recents.length >= MRU_LIMIT) break;
        }
        entries.push(...recents);
        // Groups
        for (const g of groups) {
            entries.push({
                kind: 'group',
                label: g.name,
                secondary: `${g.items.length} bookmark${g.items.length !== 1 ? 's' : ''}`,
                alias: '',
                group: g,
            });
        }
        // Bookmarks
        for (const g of groups) {
            for (const b of g.items) {
                entries.push({
                    kind: 'bookmark',
                    label: b.name,
                    secondary: b.bookmarkGroup,
                    alias: b.shortcut,
                    bookmark: b,
                });
            }
        }
        // Actions (at the bottom)
        entries.push({ kind: 'action', label: 'New Bookmark', secondary: '', alias: 'add new +', action: 'new-bookmark' });
        entries.push({ kind: 'action', label: 'Import Bookmarks', secondary: '', alias: '', action: 'import' });
        entries.push({ kind: 'action', label: 'Bulk Edit', secondary: '', alias: '', action: 'bulk-edit' });
        entries.push({ kind: 'action', label: 'Reload Bookmarks', secondary: '', alias: '', action: 'reload' });
        entries.push({ kind: 'action', label: 'Keyboard Shortcuts', secondary: 'press F1', alias: 'help shortcuts cheatsheet', action: 'cheatsheet' });
        if (isPaletteMode) {
            entries.push({ kind: 'action', label: 'Show Landing', secondary: '', alias: '', action: 'show-landing' });
        }
        for (const p of profiles) {
            if (p === 'all' || p === activeProfile) continue;
            entries.push({
                kind: 'action',
                label: `Profile: ${p}`,
                secondary: '',
                alias: '',
                action: 'select-profile',
                actionPayload: p,
            });
        }
        return entries;
    }, [groups, profiles, activeProfile, isPaletteMode]);

    // Detect if the query ends with " <numbers>" for number-selection mode
    const { searchPart, numberSelection } = useMemo(() => {
        const match = query.match(/^(.*?)\s+([\d,\s\-]+)$/);
        if (match) {
            const sel = parseNumberSelection(match[2]);
            return { searchPart: match[1], numberSelection: sel };
        }
        return { searchPart: query, numberSelection: null as Set<number> | null };
    }, [query]);

    const filtered = useMemo(() => {
        const q = searchPart.trim();
        if (!q) return allEntries;
        // Strip recents once a query is active (recents only show on empty query)
        const source = allEntries.filter((e) => !e.isRecent);
        // Google explicit search: prefix with "?"
        if (q.startsWith('?')) {
            const sub = q.slice(1).trim();
            if (!sub) return source;
            return [
                {
                    kind: 'action' as const,
                    label: `Search Google: ${sub}`,
                    secondary: 'Google',
                    alias: '',
                    action: 'google-search',
                    actionPayload: sub,
                },
            ];
        }
        if (q === '>') return source.filter((e) => e.kind === 'action');
        if (q === '/') return source.filter((e) => e.kind === 'bookmark');
        if (q === '@') return source.filter((e) => e.kind === 'group');
        if (q === '*') return source.filter((e) => e.kind === 'bookmark' && e.bookmark?.isFavorite);
        let result: PaletteEntry[];
        if (q.startsWith('>')) {
            const sub = q.slice(1).trim();
            result = source.filter(
                (e) => e.kind === 'action' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
            );
        } else if (q.startsWith('/')) {
            const sub = q.slice(1).trim();
            result = source.filter(
                (e) =>
                    e.kind === 'bookmark' &&
                    (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
            );
        } else if (q.startsWith('@')) {
            const sub = q.slice(1).trim();
            result = source.filter(
                (e) => e.kind === 'group' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
            );
        } else if (q.startsWith('*')) {
            const sub = q.slice(1).trim();
            result = source.filter(
                (e) =>
                    e.kind === 'bookmark' &&
                    e.bookmark?.isFavorite &&
                    (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
            );
        } else {
            result = source.filter(
                (e) => wildcardMatch(e.label, q) || wildcardMatch(e.secondary, q) || wildcardMatch(e.alias, q),
            );
            // Also include bookmarks with search URLs when the first word matches alias or name (e.g. "g hello world", "seek msft")
            if (q.includes(' ')) {
                const shortcutPart = q.split(/\s+/)[0].toLowerCase();
                for (const e of source) {
                    if (
                        e.kind === 'bookmark' &&
                        e.bookmark?.urls &&
                        (e.alias.toLowerCase() === shortcutPart || e.label.toLowerCase().startsWith(shortcutPart)) &&
                        !result.includes(e)
                    ) {
                        result.push(e);
                    }
                }
            }
        }
        // Google fallback: if nothing matched, offer a web search
        if (result.length === 0) {
            result = [
                {
                    kind: 'action' as const,
                    label: `Search Google: ${q}`,
                    secondary: 'No bookmark matches \u2014 search the web',
                    alias: '',
                    action: 'google-search',
                    actionPayload: q,
                },
            ];
        }
        return result;
    }, [allEntries, searchPart]);

    const displayList = filtered;

    // Sequential 1-based numbering for bookmarks in the display list
    const bookmarkNumbers = useMemo(() => {
        const map = new Map<number, number>();
        let seq = 1;
        for (let i = 0; i < displayList.length; i++) {
            if (displayList[i].kind === 'bookmark') {
                map.set(i, seq++);
            }
        }
        return map;
    }, [displayList]);

    // Reset active index and clear multi-select when list changes
    useEffect(() => {
        setActiveIndex(0);
        setMultiSelected(new Set());
    }, [filtered]);

    // Scroll active item into view
    useEffect(() => {
        const container = listRef.current;
        if (!container) return;
        const item = container.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const activateEntry = useCallback(
        (entry: PaletteEntry, fromSubmit = false, newTabArg = false) => {
            const newTab = isTouchDevice ? newTabMode : newTabArg;
            if (entry.kind === 'action' && entry.action) {
                if (entry.action === 'google-search') {
                    const u = GOOGLE_URL + encodeURIComponent(entry.actionPayload || '');
                    if (newTab) window.open(u, '_blank', 'noopener');
                    else window.location.href = u;
                    if (!newTab) onClose(true);
                    return;
                }
                if (entry.action === 'cheatsheet') {
                    setCheatsheetOpen(true);
                    return;
                }
                onAction(entry.action, entry.actionPayload);
                setQuery('');
                if (entry.action !== 'reload') onClose();
                return;
            }
            if (entry.kind === 'group' && entry.group) {
                if (isTouchDevice && !fromSubmit) {
                    setQuery(query === entry.group.name ? '' : entry.group.name);
                    return;
                }
                for (const b of entry.group.items) recordMru(activeProfile, b.id);
                openUrls(
                    entry.group.items.map((b) => ({ name: b.name, url: b.url })),
                    newTab,
                );
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                let targetUrl = entry.bookmark.url;
                if (entry.bookmark.urls) {
                    const q = searchPart.trim();
                    const parts = q.split(/\s+/);
                    const alias = (entry.bookmark.shortcut || '').trim().toLowerCase();
                    const firstWord = parts[0].toLowerCase();
                    if (
                        parts.length > 1 &&
                        ((alias && firstWord === alias) || entry.bookmark.name.toLowerCase().startsWith(firstWord))
                    ) {
                        targetUrl = entry.bookmark.urls.replace('{q}', encodeURIComponent(parts.slice(1).join(' ')));
                    }
                }
                recordMru(activeProfile, entry.bookmark.id);
                if (newTab) {
                    window.open(targetUrl, '_blank', 'noopener');
                } else {
                    window.location.href = targetUrl;
                }
            }
            if (!newTab) onClose(true);
        },
        [onClose, onAction, isTouchDevice, newTabMode, query, searchPart, activeProfile],
    );

    const openByNumbers = useCallback(
        (nums: Set<number>, newTabArg = false) => {
            const newTab = isTouchDevice ? newTabMode : newTabArg;
            const toOpen: { name: string; url: string }[] = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && displayList[idx]?.bookmark) {
                    const bm = displayList[idx].bookmark!;
                    recordMru(activeProfile, bm.id);
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                if (!newTab) onClose(true);
            }
        },
        [displayList, bookmarkNumbers, onClose, isTouchDevice, newTabMode, activeProfile],
    );

    const openMultiSelected = useCallback(
        (newTabArg = false) => {
            const newTab = isTouchDevice ? newTabMode : newTabArg;
            const toOpen: { name: string; url: string }[] = [];
            for (const idx of multiSelected) {
                const entry = displayList[idx];
                if (entry?.kind === 'bookmark' && entry.bookmark) {
                    recordMru(activeProfile, entry.bookmark.id);
                    toOpen.push({ name: entry.bookmark.name, url: entry.bookmark.url });
                } else if (entry?.kind === 'group' && entry.group) {
                    for (const b of entry.group.items) {
                        recordMru(activeProfile, b.id);
                        toOpen.push({ name: b.name, url: b.url });
                    }
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                onClose(true);
            }
        },
        [displayList, multiSelected, onClose, isTouchDevice, newTabMode, activeProfile],
    );

    const handleSubmit = useCallback(
        (newTab = false) => {
            if (submitFiredRef.current) return;
            submitFiredRef.current = true;
            setTimeout(() => {
                submitFiredRef.current = false;
            }, 300);
            if (multiSelected.size > 0) {
                openMultiSelected(newTab);
            } else if (numberSelection) {
                openByNumbers(numberSelection, newTab);
            } else if (displayList[activeIndex]) {
                activateEntry(displayList[activeIndex], true, newTab);
            }
        },
        [multiSelected, numberSelection, displayList, activeIndex, openMultiSelected, openByNumbers, activateEntry],
    );

    // Native keyup listener as fallback for iOS virtual keyboard
    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(e.ctrlKey || e.metaKey);
            }
        };
        input.addEventListener('keyup', handler);
        return () => input.removeEventListener('keyup', handler);
    }, [handleSubmit]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (cheatsheetOpen) {
                    setCheatsheetOpen(false);
                    return;
                }
                if (isPaletteMode) {
                    setQuery('');
                } else {
                    onClose();
                }
                return;
            }
            if (e.key === 'F1') {
                e.preventDefault();
                setCheatsheetOpen((v) => !v);
                return;
            }
            // Copy URL / Copy as Markdown for the active entry
            if (e.key === 'c' && e.ctrlKey && !e.altKey) {
                const entry = displayList[activeIndex];
                if (!entry) return;
                let url = '';
                let name = '';
                if (entry.kind === 'bookmark' && entry.bookmark) {
                    url = entry.bookmark.url;
                    name = entry.bookmark.name;
                }
                if (!url) return;
                e.preventDefault();
                if (e.shiftKey) {
                    void copyText(`[${name}](${url})`).then((ok) =>
                        showToast(ok ? 'Copied markdown link' : 'Copy failed'),
                    );
                } else {
                    void copyText(url).then((ok) => showToast(ok ? 'Copied URL' : 'Copy failed'));
                }
                return;
            }
            if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, displayList.length - 1));
                return;
            }
            if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'ArrowRight') {
                const entry = displayList[activeIndex];
                if (entry?.kind === 'group' && entry.group) {
                    e.preventDefault();
                    setQuery(entry.group.name);
                }
                return;
            }
            if (e.key === 'ArrowLeft') {
                if (query) {
                    e.preventDefault();
                    setQuery('');
                }
                return;
            }
            if (e.key === ' ' && e.ctrlKey) {
                // Toggle multi-select on current item
                e.preventDefault();
                setMultiSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(activeIndex)) {
                        next.delete(activeIndex);
                    } else {
                        next.add(activeIndex);
                    }
                    return next;
                });
                return;
            }
            if (e.key === 'Enter') {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    handleSubmit(true);
                }
                // Otherwise handled by form onSubmit for reliable iOS support
                return;
            }
        },
        [onClose, isPaletteMode, displayList, activeIndex, query, profiles, activeProfile, onAction, cheatsheetOpen, showToast, handleSubmit],
    );

    // URL preview for the highlighted entry
    const previewUrl = useMemo(() => {
        const entry = displayList[activeIndex];
        if (!entry) return '';
        if (entry.kind === 'bookmark' && entry.bookmark) {
            if (entry.bookmark.urls) {
                const q = searchPart.trim();
                const parts = q.split(/\s+/);
                const alias = (entry.bookmark.shortcut || '').trim().toLowerCase();
                const firstWord = parts[0].toLowerCase();
                if (
                    parts.length > 1 &&
                    ((alias && firstWord === alias) || entry.bookmark.name.toLowerCase().startsWith(firstWord))
                ) {
                    return entry.bookmark.urls.replace('{q}', encodeURIComponent(parts.slice(1).join(' ')));
                }
            }
            return entry.bookmark.url;
        }
        if (entry.kind === 'group' && entry.group) return `${entry.group.items.length} bookmarks — Enter to open all`;
        if (entry.kind === 'action') return 'Action — Enter to execute';
        return '';
    }, [displayList, activeIndex, searchPart]);

    const selectedNumbers = numberSelection;

    const cheatsheetItems: { keys: string; desc: string }[] = [
        { keys: '↑ ↓ / Ctrl+J Ctrl+K', desc: 'Navigate' },
        { keys: '→', desc: 'Expand selected group' },
        { keys: '← / Esc', desc: 'Back / clear / close' },
        { keys: 'Enter', desc: 'Open' },
        { keys: 'Ctrl+Enter', desc: 'Open in new tab' },
        { keys: 'Ctrl+Space', desc: 'Toggle multi-select' },
        { keys: '1-9 (then Enter)', desc: 'Open by number(s) — e.g. "foo 1,3-5"' },
        { keys: 'Ctrl+C', desc: 'Copy URL of selected entry' },
        { keys: 'Ctrl+Shift+C', desc: 'Copy as Markdown link' },
        { keys: 'Ctrl+`', desc: 'Cycle through profiles' },
        { keys: 'Ctrl+/', desc: 'Toggle palette (outside palette)' },
        { keys: 'F1', desc: 'Show this cheatsheet' },
        { keys: '? <query>', desc: 'Search Google' },
        { keys: '> <query>', desc: 'Search actions only' },
        { keys: '/ <query>', desc: 'Search bookmarks only' },
        { keys: '@ <query>', desc: 'Search groups only' },
        { keys: '* <query>', desc: 'Search favorites only' },
    ];

    return (
        <div
            className="palette-backdrop"
            onMouseDown={() => {
                if (!isPaletteMode) onClose();
            }}
        >
            <div className="palette-container" style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSubmit();
                    }}
                >
                    <div className="palette-search-row">
                        <input
                            ref={inputRef}
                            className="palette-input"
                            placeholder="Search… (> actions, / bookmarks, @ groups, * favorites)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            enterKeyHint="go"
                        />
                        {isPaletteMode && (
                            <button
                                type="button"
                                className="palette-close-btn"
                                onClick={() => {
                                    if (isTouchDevice) {
                                        setQuery('');
                                        inputRef.current?.focus();
                                    } else {
                                        onAction('show-landing');
                                    }
                                }}
                                aria-label="Close palette"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <button
                        type="submit"
                        tabIndex={-1}
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            width: 1,
                            height: 1,
                            padding: 0,
                            margin: -1,
                            overflow: 'hidden',
                            clip: 'rect(0,0,0,0)',
                            border: 0,
                        }}
                    />
                </form>
                {(profiles.length > 1 || isPaletteMode) && (
                    <div className="palette-profile-tabs">
                        {profiles
                            .filter((p) => p !== 'all')
                            .map((p) => (
                                <button
                                    key={p}
                                    className={`palette-profile-tab${p === activeProfile ? ' palette-profile-tab-active' : ''}`}
                                    onClick={() => onAction('select-profile', p)}
                                >
                                    {p}
                                </button>
                            ))}
                    </div>
                )}
                <div className="palette-list" ref={listRef}>
                    {displayList.length === 0 && <div className="palette-empty">No matches</div>}
                    {displayList.map((entry, i) => {
                        const isActive = i === activeIndex;
                        const seq = bookmarkNumbers.get(i);
                        const isNumberSelected = seq != null && selectedNumbers?.has(seq);
                        const isMultiSelected = multiSelected.has(i);
                        const prevKind = i > 0 ? displayList[i - 1].kind : null;
                        const showDivider = prevKind != null && prevKind !== entry.kind;
                        return (
                            <div key={`${entry.kind}-${entry.label}-${i}`}>
                                {showDivider && <div className="palette-divider" />}
                                <div
                                    className={`palette-item${isActive ? ' palette-item-active' : ''}${isNumberSelected ? ' palette-item-selected' : ''}${isMultiSelected ? ' palette-item-multi' : ''}`}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    onClick={(e) => {
                                        const newTab = e.ctrlKey || e.metaKey;
                                        if (multiSelected.size > 0) {
                                            setMultiSelected((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(i)) next.delete(i);
                                                else next.add(i);
                                                return next;
                                            });
                                        } else if (numberSelection) {
                                            openByNumbers(numberSelection, newTab);
                                        } else {
                                            activateEntry(entry, false, newTab);
                                        }
                                    }}
                                >
                                    <span className="palette-item-num">
                                        {isMultiSelected ? (
                                            <svg
                                                width="12"
                                                height="12"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        ) : seq != null ? (
                                            seq
                                        ) : (
                                            ''
                                        )}
                                    </span>
                                    <span className="palette-item-kind">
                                        {entry.kind === 'action' ? (
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                            </svg>
                                        ) : entry.kind === 'group' ? (
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                            </svg>
                                        ) : (
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="palette-item-label">
                                        {entry.bookmark?.isFavorite && (
                                            <span className="palette-favorite-star">
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    stroke="currentColor"
                                                    strokeWidth="1"
                                                >
                                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                                </svg>
                                            </span>
                                        )}
                                        {entry.label}
                                    </span>
                                    <span
                                        className={`palette-item-alias${entry.alias ? '' : ' palette-item-alias-empty'}`}
                                    >
                                        {entry.alias || ''}
                                    </span>
                                    <span className="palette-item-secondary">{entry.secondary}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="palette-footer">
                    {previewUrl && <div className="palette-preview">{previewUrl}</div>}
                    {isTouchDevice ? (
                        <span>
                            <button
                                type="button"
                                className={`palette-newtab-toggle${newTabMode ? ' palette-newtab-toggle-active' : ''}`}
                                onClick={() => setNewTabMode((v) => !v)}
                            >
                                {newTabMode ? (
                                    <>
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>{' '}
                                        New tab
                                    </>
                                ) : (
                                    <>
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <line x1="5" y1="12" x2="19" y2="12" />
                                            <polyline points="12 5 19 12 12 19" />
                                        </svg>{' '}
                                        Same tab
                                    </>
                                )}
                            </button>
                        </span>
                    ) : (
                        <div className="palette-shortcuts">
                            <span>
                                <kbd>↑↓</kbd> navigate
                            </span>
                            <span>
                                <kbd>→</kbd> expand group
                            </span>
                            <span>
                                <kbd>←</kbd> back/clear
                            </span>
                            <span>
                                <kbd>Ctrl+Space</kbd> select
                            </span>
                            <span>
                                <kbd>Enter</kbd> open
                            </span>
                            <span>
                                <kbd>Ctrl+Enter</kbd> new tab
                            </span>
                            <span>
                                <kbd>Esc</kbd> {isPaletteMode ? 'clear' : 'close'}
                            </span>
                            <span>
                                <kbd>1-5</kbd> open by number
                            </span>
                        </div>
                    )}
                </div>
                {cheatsheetOpen && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(2, 6, 23, 0.96)',
                            zIndex: 10,
                            padding: '20px 24px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                        }}
                        onClick={() => setCheatsheetOpen(false)}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: '#e0e6ed',
                                fontSize: 14,
                                fontWeight: 600,
                            }}
                        >
                            <span>Keyboard Shortcuts</span>
                            <span style={{ color: '#64748b', fontSize: 12 }}>Click anywhere or press Esc to close</span>
                        </div>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '220px 1fr',
                                rowGap: 6,
                                columnGap: 16,
                                fontSize: 13,
                            }}
                        >
                            {cheatsheetItems.map((it, idx) => (
                                <div key={idx} style={{ display: 'contents' }}>
                                    <div style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{it.keys}</div>
                                    <div style={{ color: '#b2bac2' }}>{it.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {toast && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 60,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#1e293b',
                            color: '#e0e6ed',
                            padding: '8px 14px',
                            borderRadius: 4,
                            fontSize: 13,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                            border: '1px solid #334155',
                            zIndex: 20,
                            pointerEvents: 'none',
                        }}
                    >
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}
