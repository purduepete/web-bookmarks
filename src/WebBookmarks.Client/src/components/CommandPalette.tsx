import { useState, useEffect, useRef, useMemo, useCallback, memo, type ReactElement } from 'react';
import type { WebBookmarksItem, BookmarkGroup } from '../types';
import { openUrls, sanitizeUrl, resolveBookmarkUrl } from '../utils';
import { focusModalInput } from '../lib/modalFocus';
import type { PaletteEntry, MruEntry } from '../palette-core';
import {
    detectNumberSelection,
    filterEntries,
    buildPaletteEntries,
    assignBookmarkNumbers,
    applyMru,
    applyMruMany,
} from '../palette-core';

interface Props {
    groups: BookmarkGroup[];
    onClose: (navigating?: boolean) => void;
    onAction: (action: string, payload?: string) => void;
    profiles: string[];
    activeProfile: string;
    isPaletteMode: boolean;
}

// ── MRU (most-recently-used) tracking ──────────────────
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
    const list = applyMru(getMru(profile), id, Date.now());
    try {
        localStorage.setItem(mruKey(profile), JSON.stringify(list));
    } catch {
        /* quota */
    }
}
// Batch variant: records several ids with a single storage read + write, instead
// of one read/parse/stringify/write round-trip per opened bookmark.
function recordMruMany(profile: string, ids: number[]) {
    if (ids.length === 0) return;
    const list = applyMruMany(getMru(profile), ids, Date.now());
    try {
        localStorage.setItem(mruKey(profile), JSON.stringify(list));
    } catch {
        /* quota */
    }
}

const GOOGLE_URL = 'https://www.google.com/search?q=';

// Row icons hoisted to module scope so each is allocated once instead of being
// rebuilt for every row on every render (perf fix for #33 / P1).
const ICON_CHECK = (
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
);
const ICON_ACTION = (
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
);
const ICON_GROUP = (
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
);
const ICON_BOOKMARK = (
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
);
const ICON_STAR = (
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
);
const KIND_ICON: Record<PaletteEntry['kind'], ReactElement> = {
    action: ICON_ACTION,
    group: ICON_GROUP,
    bookmark: ICON_BOOKMARK,
};

interface PaletteRowProps {
    index: number;
    entry: PaletteEntry;
    seq: number | undefined;
    isActive: boolean;
    isNumberSelected: boolean;
    isMultiSelected: boolean;
    showDivider: boolean;
    onHover: (index: number) => void;
    onClick: (index: number, entry: PaletteEntry, newTab: boolean) => void;
}

// A single palette row, memoized so that changing the active index (e.g. on
// mouse-move) only re-renders the two rows whose active state actually flips,
// instead of re-rendering the whole list. This relies on the parent passing
// referentially stable `onHover`/`onClick` and a stable `entry` (#33 / P1).
const PaletteRow = memo(function PaletteRow({
    index,
    entry,
    seq,
    isActive,
    isNumberSelected,
    isMultiSelected,
    showDivider,
    onHover,
    onClick,
}: PaletteRowProps) {
    return (
        <div>
            {showDivider && <div className="palette-divider" />}
            <div
                className={`palette-item${isActive ? ' palette-item-active' : ''}${isNumberSelected ? ' palette-item-selected' : ''}${isMultiSelected ? ' palette-item-multi' : ''}`}
                onMouseEnter={() => onHover(index)}
                onClick={(e) => onClick(index, entry, e.ctrlKey || e.metaKey)}
            >
                <span className="palette-item-num">
                    {isMultiSelected ? ICON_CHECK : seq != null ? seq : ''}
                </span>
                <span className="palette-item-kind">{KIND_ICON[entry.kind]}</span>
                <span className="palette-item-label">
                    {entry.bookmark?.isFavorite && (
                        <span className="palette-favorite-star">{ICON_STAR}</span>
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
});

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

export default function CommandPalette({
    groups,
    onClose,
    onAction,
    profiles,
    activeProfile,
    isPaletteMode,
}: Props) {
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
    const lastBookmarkRef = useRef<WebBookmarksItem | null>(null);
    const showToast = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 1800);
    }, []);

    useEffect(() => {
        focusModalInput(inputRef.current);
    }, []);

    // Build the flat list of entries via the shared palette-core builder; this
    // component only owns the host-specific action rows.
    const allEntries = useMemo<PaletteEntry[]>(() => {
        const actions: PaletteEntry[] = [
            {
                kind: 'action',
                label: 'New Bookmark',
                secondary: '',
                alias: 'add new +',
                action: 'new-bookmark',
            },
            {
                kind: 'action',
                label: 'Import Bookmarks',
                secondary: '',
                alias: '',
                action: 'import',
            },
            { kind: 'action', label: 'Bulk Edit', secondary: '', alias: '', action: 'bulk-edit' },
            {
                kind: 'action',
                label: 'Reload Bookmarks',
                secondary: '',
                alias: '',
                action: 'reload',
            },
            {
                kind: 'action',
                label: 'Copy as Markdown link',
                secondary: 'of highlighted bookmark',
                alias: 'copy',
                action: 'copy-markdown',
            },
            {
                kind: 'action',
                label: 'Keyboard Shortcuts',
                secondary: 'press F1',
                alias: 'help shortcuts cheatsheet',
                action: 'cheatsheet',
            },
        ];
        if (isPaletteMode) {
            actions.push({
                kind: 'action',
                label: 'Open Landing Page',
                secondary: '',
                alias: '',
                action: 'show-landing',
            });
        }
        actions.sort((a, b) => a.label.localeCompare(b.label));
        return buildPaletteEntries(groups, getMru(activeProfile), actions);
    }, [groups, profiles, activeProfile, isPaletteMode]);

    // Detect if the query ends with " <numbers>" for number-selection mode
    const { searchPart, numberSelection } = useMemo(() => detectNumberSelection(query), [query]);

    const filtered = useMemo(() => filterEntries(allEntries, searchPart), [allEntries, searchPart]);

    const displayList = filtered;

    // Sequential 1-based numbering for bookmarks in the display list
    const bookmarkNumbers = useMemo(() => assignBookmarkNumbers(displayList), [displayList]);

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
        // Track most-recently-highlighted bookmark so the Copy-as-Markdown action knows what to copy
        const entry = filtered[activeIndex];
        if (entry?.kind === 'bookmark' && entry.bookmark) {
            lastBookmarkRef.current = entry.bookmark;
        }
    }, [activeIndex, filtered]);

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
                if (entry.action === 'copy-markdown') {
                    const bm = lastBookmarkRef.current;
                    if (!bm) {
                        showToast('Highlight a bookmark first');
                        return;
                    }
                    void copyText(`[${bm.name}](${bm.url})`).then((ok) =>
                        showToast(ok ? `Copied: ${bm.name}` : 'Copy failed'),
                    );
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
                recordMruMany(
                    activeProfile,
                    entry.group.items.map((b) => b.id),
                );
                openUrls(
                    entry.group.items.map((b) => ({ name: b.name, url: b.url })),
                    newTab,
                );
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                const targetUrl = resolveBookmarkUrl(entry.bookmark, searchPart);
                recordMru(activeProfile, entry.bookmark.id);
                const safeUrl = sanitizeUrl(targetUrl);
                if (newTab) {
                    window.open(safeUrl, '_blank', 'noopener');
                } else {
                    window.location.href = safeUrl;
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
            const ids: number[] = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && displayList[idx]?.bookmark) {
                    const bm = displayList[idx].bookmark!;
                    ids.push(bm.id);
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                recordMruMany(activeProfile, ids);
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
            const ids: number[] = [];
            for (const idx of multiSelected) {
                const entry = displayList[idx];
                if (entry?.kind === 'bookmark' && entry.bookmark) {
                    ids.push(entry.bookmark.id);
                    toOpen.push({ name: entry.bookmark.name, url: entry.bookmark.url });
                } else if (entry?.kind === 'group' && entry.group) {
                    for (const b of entry.group.items) {
                        ids.push(b.id);
                        toOpen.push({ name: b.name, url: b.url });
                    }
                }
            }
            if (toOpen.length > 0) {
                recordMruMany(activeProfile, ids);
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
        [
            multiSelected,
            numberSelection,
            displayList,
            activeIndex,
            openMultiSelected,
            openByNumbers,
            activateEntry,
        ],
    );

    // Latest-value refs so the row callbacks below can stay referentially stable
    // (empty deps) without going stale — this is what keeps PaletteRow's memo
    // effective, so hovering doesn't re-render the whole list (#33 / P1).
    const multiSelectedRef = useRef(multiSelected);
    multiSelectedRef.current = multiSelected;
    const numberSelectionRef = useRef(numberSelection);
    numberSelectionRef.current = numberSelection;
    const activateEntryRef = useRef(activateEntry);
    activateEntryRef.current = activateEntry;
    const openByNumbersRef = useRef(openByNumbers);
    openByNumbersRef.current = openByNumbers;

    const handleRowHover = useCallback((i: number) => setActiveIndex(i), []);
    const handleRowClick = useCallback((i: number, entry: PaletteEntry, newTab: boolean) => {
        if (multiSelectedRef.current.size > 0) {
            setMultiSelected((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
            });
        } else if (numberSelectionRef.current) {
            openByNumbersRef.current(numberSelectionRef.current, newTab);
        } else {
            activateEntryRef.current(entry, false, newTab);
        }
    }, []);

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
            if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
                e.preventDefault();
                setActiveIndex((i) => (displayList.length ? (i + 1) % displayList.length : 0));
                return;
            }
            if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
                e.preventDefault();
                setActiveIndex((i) =>
                    displayList.length ? (i - 1 + displayList.length) % displayList.length : 0,
                );
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
            if (e.key === 'Tab') {
                const visible = profiles.filter((p) => p !== 'all');
                if (visible.length < 2) return;
                e.preventDefault();
                const idx = visible.indexOf(activeProfile);
                const delta = e.shiftKey ? -1 : 1;
                const next = visible[(idx + delta + visible.length) % visible.length];
                onAction('select-profile', next);
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
        [
            onClose,
            isPaletteMode,
            displayList,
            activeIndex,
            query,
            profiles,
            activeProfile,
            onAction,
            cheatsheetOpen,
            showToast,
            handleSubmit,
        ],
    );

    // URL preview for the highlighted entry
    const previewUrl = useMemo(() => {
        const entry = displayList[activeIndex];
        if (!entry) return '';
        if (entry.kind === 'bookmark' && entry.bookmark) {
            // Use the same resolver as the open path (line ~330) so the preview
            // can never drift from the URL that actually opens.
            return resolveBookmarkUrl(entry.bookmark, searchPart);
        }
        if (entry.kind === 'group' && entry.group)
            return `${entry.group.items.length} bookmarks — Enter to open all`;
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
        { keys: 'Tab / Shift+Tab', desc: 'Switch profile' },
        { keys: 'Ctrl+`', desc: 'Cycle through profiles' },
        { keys: 'Ctrl+Alt+/', desc: 'Toggle palette (outside palette)' },
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
            <div
                className="palette-container"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                style={{
                    position: 'relative',
                    minHeight: cheatsheetOpen ? 'min(70vh, 560px)' : undefined,
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
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
                        const seq = bookmarkNumbers.get(i);
                        const prevKind = i > 0 ? displayList[i - 1].kind : null;
                        return (
                            <PaletteRow
                                key={`${entry.kind}-${entry.label}-${i}`}
                                index={i}
                                entry={entry}
                                seq={seq}
                                isActive={i === activeIndex}
                                isNumberSelected={seq != null && !!selectedNumbers?.has(seq)}
                                isMultiSelected={multiSelected.has(i)}
                                showDivider={prevKind != null && prevKind !== entry.kind}
                                onHover={handleRowHover}
                                onClick={handleRowClick}
                            />
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
                            <span style={{ color: '#64748b', fontSize: 12 }}>
                                Click anywhere or press Esc to close
                            </span>
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
                                    <div style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                                        {it.keys}
                                    </div>
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
