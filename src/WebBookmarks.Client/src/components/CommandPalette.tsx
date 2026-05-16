import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { WebBookmarksItem, BookmarkGroup } from '../types';
import { wildcardMatch } from '../utils';

interface Props {
    groups: BookmarkGroup[];
    onClose: (navigating?: boolean) => void;
}

interface PaletteEntry {
    kind: 'bookmark' | 'group';
    label: string;
    secondary: string;
    alias: string;
    bookmark?: WebBookmarksItem;
    group?: BookmarkGroup;
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

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function openUrls(items: { name: string; url: string }[]) {
    if (items.length === 0) return;
    if (isSafari && items.length > 1) {
        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening bookmarks...</title>
<style>body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;padding:20px}
a{display:block;padding:14px;margin:8px 0;background:#16213e;color:#4fc3f7;border-radius:8px;text-decoration:none;font-size:17px}
a:active{background:#0f3460}</style></head><body>
<h2>Tap each to open:</h2>
${items.map((item) => `<a href="${item.url}" target="_blank">${item.name}</a>`).join('')}
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        window.location.href = URL.createObjectURL(blob);
    } else {
        let i = 0;
        function next() {
            if (i < items.length - 1) {
                window.open(items[i].url, '_blank', 'noopener');
                i++;
                setTimeout(next, 500);
            } else {
                window.location.href = items[i].url;
            }
        }
        next();
    }
}

export default function CommandPalette({ groups, onClose }: Props) {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set()); // set of filtered indices
    const isTouchDevice = useMemo(() => window.matchMedia('(hover: none)').matches, []);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Build the flat list of entries: groups first, then bookmarks (numbered)
    const allEntries = useMemo<PaletteEntry[]>(() => {
        const entries: PaletteEntry[] = [];
        for (const g of groups) {
            entries.push({
                kind: 'group',
                label: g.name,
                secondary: `${g.items.length} bookmark${g.items.length !== 1 ? 's' : ''}`,
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
                    alias: b.shortcut,
                    bookmark: b,
                });
            }
        }
        return entries;
    }, [groups]);

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
        (entry: PaletteEntry, fromSubmit = false) => {
            if (entry.kind === 'group' && entry.group) {
                if (isTouchDevice && !fromSubmit) {
                    setQuery(query === entry.group.name ? '' : entry.group.name);
                    return;
                }
                openUrls(entry.group.items.map((b) => ({ name: b.name, url: b.url })));
            } else if (entry.kind === 'bookmark' && entry.bookmark) {
                window.location.href = entry.bookmark.url;
            }
            onClose(true);
        },
        [onClose, isTouchDevice, query],
    );

    const openByNumbers = useCallback(
        (nums: Set<number>) => {
            const toOpen: { name: string; url: string }[] = [];
            for (const [idx, seq] of bookmarkNumbers) {
                if (nums.has(seq) && displayList[idx]?.bookmark) {
                    const bm = displayList[idx].bookmark!;
                    toOpen.push({ name: bm.name, url: bm.url });
                }
            }
            if (toOpen.length > 0) {
                openUrls(toOpen);
                onClose(true);
            }
        },
        [displayList, bookmarkNumbers, onClose],
    );

    const openMultiSelected = useCallback(() => {
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
            openUrls(toOpen);
            onClose(true);
        }
    }, [displayList, multiSelected, onClose]);

    const handleSubmit = useCallback(() => {
        if (multiSelected.size > 0) {
            openMultiSelected();
        } else if (numberSelection) {
            openByNumbers(numberSelection);
        } else if (displayList[activeIndex]) {
            activateEntry(displayList[activeIndex], true);
        }
    }, [multiSelected, numberSelection, displayList, activeIndex, openMultiSelected, openByNumbers, activateEntry]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
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
                // Handled by form onSubmit for reliable iOS support
                return;
            }
        },
        [onClose, displayList, activeIndex, query],
    );

    // URL preview for the highlighted entry
    const previewUrl = useMemo(() => {
        const entry = displayList[activeIndex];
        if (!entry) return '';
        if (entry.kind === 'bookmark' && entry.bookmark) return entry.bookmark.url;
        if (entry.kind === 'group' && entry.group) return `${entry.group.items.length} bookmarks — Enter to open all`;
        return '';
    }, [displayList, activeIndex]);

    const selectedNumbers = numberSelection;

    return (
        <div className="palette-backdrop" onMouseDown={() => onClose()}>
            <div className="palette-container" onMouseDown={(e) => e.stopPropagation()}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSubmit();
                    }}
                >
                    <input
                        ref={inputRef}
                        className="palette-input"
                        placeholder="Search bookmarks and groups…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="go"
                    />
                </form>
                <div className="palette-list" ref={listRef}>
                    {displayList.length === 0 && <div className="palette-empty">No matches</div>}
                    {displayList.map((entry, i) => {
                        const isActive = i === activeIndex;
                        const seq = bookmarkNumbers.get(i);
                        const isNumberSelected = seq != null && selectedNumbers?.has(seq);
                        const isMultiSelected = multiSelected.has(i);
                        return (
                            <div key={`${entry.kind}-${entry.label}-${i}`}>
                                <div
                                    className={`palette-item${isActive ? ' palette-item-active' : ''}${isNumberSelected ? ' palette-item-selected' : ''}${isMultiSelected ? ' palette-item-multi' : ''}`}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    onClick={() => {
                                        if (multiSelected.size > 0) {
                                            setMultiSelected((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(i)) next.delete(i);
                                                else next.add(i);
                                                return next;
                                            });
                                        } else if (numberSelection) {
                                            openByNumbers(numberSelection);
                                        } else {
                                            activateEntry(entry);
                                        }
                                    }}
                                >
                                    <span className="palette-item-num">
                                        {isMultiSelected ? '✓' : seq != null ? seq : ''}
                                    </span>
                                    <span className="palette-item-kind">
                                        {entry.kind === 'group' ? (
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
                                    <span className="palette-item-label">{entry.label}</span>
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
                    <span>
                        <kbd>↑↓</kbd> navigate &nbsp; <kbd>→</kbd> expand group &nbsp; <kbd>←</kbd> back &nbsp;{' '}
                        <kbd>Ctrl+Space</kbd> select &nbsp; <kbd>Enter</kbd> open &nbsp; <kbd>Esc</kbd> close
                    </span>
                    <span className="palette-footer-hint">Type a number range to open multiple (e.g. 1-5)</span>
                </div>
            </div>
        </div>
    );
}
