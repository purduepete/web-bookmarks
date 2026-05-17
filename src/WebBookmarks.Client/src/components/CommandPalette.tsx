import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { WebBookmarksItem, BookmarkGroup } from '../types';
import { wildcardMatch, openUrls } from '../utils';

interface Props {
    groups: BookmarkGroup[];
    onClose: (navigating?: boolean) => void;
    onAction: (action: string, payload?: string) => void;
    editMode: boolean;
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

export default function CommandPalette({
    groups,
    onClose,
    onAction,
    editMode,
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

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Build the flat list of entries: groups first, then bookmarks, then actions at the bottom
    const allEntries = useMemo<PaletteEntry[]>(() => {
        const entries: PaletteEntry[] = [];
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
        entries.push({ kind: 'action', label: 'New Bookmark', secondary: '', alias: '', action: 'new-bookmark' });
        entries.push({ kind: 'action', label: 'Import Bookmarks', secondary: '', alias: '', action: 'import' });
        entries.push({ kind: 'action', label: 'Bulk Edit', secondary: '', alias: '', action: 'bulk-edit' });
        entries.push({
            kind: 'action',
            label: `${editMode ? 'Disable' : 'Enable'} Edit Mode`,
            secondary: editMode ? 'on' : 'off',
            alias: '',
            action: 'toggle-edit',
        });
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
    }, [groups, editMode, profiles, activeProfile, isPaletteMode]);

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
        if (q === '>') return allEntries.filter((e) => e.kind === 'action');
        if (q === '/') return allEntries.filter((e) => e.kind === 'bookmark');
        if (q === '@') return allEntries.filter((e) => e.kind === 'group');
        if (q === '*') return allEntries.filter((e) => e.kind === 'bookmark' && e.bookmark?.isFavorite);
        if (!q) return allEntries;
        if (q.startsWith('>')) {
            const sub = q.slice(1).trim();
            return allEntries.filter(
                (e) => e.kind === 'action' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
            );
        }
        if (q.startsWith('/')) {
            const sub = q.slice(1).trim();
            return allEntries.filter(
                (e) =>
                    e.kind === 'bookmark' &&
                    (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
            );
        }
        if (q.startsWith('@')) {
            const sub = q.slice(1).trim();
            return allEntries.filter(
                (e) => e.kind === 'group' && (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub)),
            );
        }
        if (q.startsWith('*')) {
            const sub = q.slice(1).trim();
            return allEntries.filter(
                (e) =>
                    e.kind === 'bookmark' &&
                    e.bookmark?.isFavorite &&
                    (wildcardMatch(e.label, sub) || wildcardMatch(e.secondary, sub) || wildcardMatch(e.alias, sub)),
            );
        }
        return allEntries.filter(
            (e) => wildcardMatch(e.label, q) || wildcardMatch(e.secondary, q) || wildcardMatch(e.alias, q),
        );
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
                onAction(entry.action, entry.actionPayload);
                setQuery('');
                onClose();
                return;
            }
            if (entry.kind === 'group' && entry.group) {
                if (isTouchDevice && !fromSubmit) {
                    setQuery(query === entry.group.name ? '' : entry.group.name);
                    return;
                }
                openUrls(
                    entry.group.items.map((b) => ({ name: b.name, url: b.url })),
                    newTab,
                );
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                if (newTab) {
                    window.open(entry.bookmark.url, '_blank', 'noopener');
                } else {
                    window.location.href = entry.bookmark.url;
                }
            }
            if (!newTab) onClose(true);
            else setQuery('');
        },
        [onClose, onAction, isTouchDevice, newTabMode, query],
    );

    const openByNumbers = useCallback(
        (nums: Set<number>, newTabArg = false) => {
            const newTab = isTouchDevice ? newTabMode : newTabArg;
            const toOpen: { name: string; url: string }[] = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && displayList[idx]?.bookmark) {
                    const bm = displayList[idx].bookmark!;
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                if (!newTab) onClose(true);
                else setQuery('');
            }
        },
        [displayList, bookmarkNumbers, onClose, isTouchDevice, newTabMode],
    );

    const openMultiSelected = useCallback(
        (newTabArg = false) => {
            const newTab = isTouchDevice ? newTabMode : newTabArg;
            const toOpen: { name: string; url: string }[] = [];
            for (const idx of multiSelected) {
                const entry = displayList[idx];
                if (entry?.kind === 'bookmark' && entry.bookmark) {
                    toOpen.push({ name: entry.bookmark.name, url: entry.bookmark.url });
                } else if (entry?.kind === 'group' && entry.group) {
                    for (const b of entry.group.items) {
                        toOpen.push({ name: b.name, url: b.url });
                    }
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen, newTab);
                onClose(true);
            }
        },
        [displayList, multiSelected, onClose, isTouchDevice, newTabMode],
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
                if (isPaletteMode) {
                    setQuery('');
                } else {
                    onClose();
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
        [onClose, isPaletteMode, displayList, activeIndex, query],
    );

    // URL preview for the highlighted entry
    const previewUrl = useMemo(() => {
        const entry = displayList[activeIndex];
        if (!entry) return '';
        if (entry.kind === 'bookmark' && entry.bookmark) return entry.bookmark.url;
        if (entry.kind === 'group' && entry.group) return `${entry.group.items.length} bookmarks — Enter to open all`;
        if (entry.kind === 'action') return 'Action — Enter to execute';
        return '';
    }, [displayList, activeIndex]);

    const selectedNumbers = numberSelection;

    return (
        <div
            className="palette-backdrop"
            onMouseDown={() => {
                if (!isPaletteMode) onClose();
            }}
        >
            <div className="palette-container" onMouseDown={(e) => e.stopPropagation()}>
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
                        {isPaletteMode && (
                            <button
                                type="button"
                                className="palette-close-btn"
                                onClick={() => onAction('show-landing')}
                                aria-label="Close palette"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                )}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSubmit();
                    }}
                >
                    <input
                        ref={inputRef}
                        className="palette-input"
                        placeholder="Search… (> actions, / bookmarks, @ groups, * favorites)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="go"
                    />
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
                                        {isMultiSelected ? '✓' : seq != null ? seq : ''}
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
                                        {entry.bookmark?.isFavorite && <span className="palette-favorite-star">★</span>}
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
                                {newTabMode ? '↗ New tab' : '→ Same tab'}
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
                                <kbd>←</kbd> back
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
            </div>
        </div>
    );
}
