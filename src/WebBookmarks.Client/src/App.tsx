import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchBookmarks, deleteBookmark, reorderBookmarks, fetchProfiles } from './api';
import type { WebBookmarksItem, BookmarkGroup } from './types';
import { wildcardMatch } from './utils';

import BookmarkGroupComponent from './components/BookmarkGroup';
import BookmarkModal from './components/BookmarkModal';
import CommandPalette from './components/CommandPalette';

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function openUrls(items: { name: string; url: string }[]) {
    if (isSafari && items.length > 1) {
        // Safari iOS limits window.open to ~1-2 per gesture.
        // Open a single helper page with links to all URLs.
        const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening bookmarks...</title>
<style>body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;padding:20px}
a{display:block;padding:14px;margin:8px 0;background:#16213e;color:#4fc3f7;border-radius:8px;text-decoration:none;font-size:17px}
a:active{background:#0f3460}</style></head><body>
<h2>Tap each to open:</h2>
${items.map((item) => `<a href="${item.url}" target="_blank">${item.name}</a>`).join('')}
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        window.location.href = blobUrl;
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

function navigateByShortcut(input: string, bookmarks: WebBookmarksItem[]): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;

    const parts = trimmed.split(/\s+/);
    const shortcut = parts[0].toLowerCase();
    const searchQuery = parts.slice(1).join(' ');

    let matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase() === shortcut);
    if (matches.length === 0) {
        matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase().includes(shortcut));
    }

    if (matches.length === 0) return false;

    openUrls(
        matches.map((m) => ({
            name: m.name,
            url: searchQuery && m.urls ? m.urls.replace('{q}', encodeURIComponent(searchQuery)) : m.url,
        })),
    );
    return true;
}

export default function App() {
    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>(() => {
        const cached = localStorage.getItem('bookmarks');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(() => !localStorage.getItem('bookmarks'));
    const [error, setError] = useState<string | null>(null);

    const [searchFilter, setSearchFilter] = useState('');
    const [startupMode, setStartupMode] = useState<'none' | 'prompt' | 'palette'>(() => {
        const saved = localStorage.getItem('startupMode');
        if (saved === 'prompt' || saved === 'palette') return saved;
        if (localStorage.getItem('promptEnabled') === 'true') return 'prompt';
        return 'none';
    });
    const [promptActive, setPromptActive] = useState(() => {
        const saved = localStorage.getItem('startupMode');
        if (saved === 'prompt') return true;
        if (!saved && localStorage.getItem('promptEnabled') === 'true') return true;
        return false;
    });
    const promptShown = useRef(false);
    const bookmarkInputRef = useRef<HTMLInputElement>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBookmark, setEditingBookmark] = useState<WebBookmarksItem | null>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const optionsRef = useRef<HTMLDivElement>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [startupPaletteHiding, setStartupPaletteHiding] = useState(() => {
        const saved = localStorage.getItem('startupMode');
        return saved === 'palette';
    });
    const [activeProfile, setActiveProfile] = useState<string>(() => {
        return localStorage.getItem('activeProfile') || 'home';
    });
    const [profiles, setProfiles] = useState<string[]>([]);

    // Close options dropdown when clicking outside
    useEffect(() => {
        if (!optionsOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
                setOptionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [optionsOpen]);

    // Ctrl+/ opens command palette
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setPaletteOpen((v) => !v);
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    const loadBookmarks = useCallback(() => {
        setError(null);
        fetchBookmarks(showHidden, activeProfile)
            .then((data) => {
                setBookmarks(data);
                localStorage.setItem('bookmarks', JSON.stringify(data));
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        fetchProfiles()
            .then(setProfiles)
            .catch(() => {});
    }, [showHidden, activeProfile]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    useEffect(() => {
        if (!loading && !promptActive) {
            bookmarkInputRef.current?.focus();
        }
    }, [loading, promptActive]);

    const groups: BookmarkGroup[] = useMemo(() => {
        const map = new Map<string, WebBookmarksItem[]>();
        for (const b of bookmarks) {
            const list = map.get(b.bookmarkGroup) ?? [];
            list.push(b);
            map.set(b.bookmarkGroup, list);
        }
        return Array.from(map.entries())
            .map(([name, items]) => ({ name, items: items.sort((a, b) => a.sortOrder - b.sortOrder) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [bookmarks]);

    const conflictIds = useMemo(() => {
        const ids = new Set<number>();
        for (let i = 0; i < bookmarks.length; i++) {
            const a = bookmarks[i].shortcut.trim().toLowerCase();
            if (!a) continue;
            for (let j = i + 1; j < bookmarks.length; j++) {
                const b = bookmarks[j].shortcut.trim().toLowerCase();
                if (!b) continue;
                if (a.includes(b) || b.includes(a)) {
                    ids.add(bookmarks[i].id);
                    ids.add(bookmarks[j].id);
                }
            }
        }
        return ids;
    }, [bookmarks]);

    const displayedGroups = useMemo(() => {
        let result = groups;
        const raw = searchFilter.trim();

        if (!raw) return result;

        if (raw.startsWith('/')) {
            // Bookmark-only filter
            const term = raw.slice(1);
            if (term) {
                result = result
                    .map((g) => ({
                        ...g,
                        items: g.items.filter(
                            (item) =>
                                wildcardMatch(item.name, term) ||
                                wildcardMatch(item.shortcut, term) ||
                                wildcardMatch(item.description, term),
                        ),
                    }))
                    .filter((g) => g.items.length > 0);
            }
        } else if (raw.startsWith('@')) {
            // Group-only filter
            const term = raw.slice(1);
            if (term) {
                result = result.filter((g) => wildcardMatch(g.name, term));
            }
        } else {
            // Search both groups and bookmarks
            result = result
                .filter(
                    (g) =>
                        wildcardMatch(g.name, raw) ||
                        g.items.some(
                            (item) =>
                                wildcardMatch(item.name, raw) ||
                                wildcardMatch(item.shortcut, raw) ||
                                wildcardMatch(item.description, raw),
                        ),
                )
                .map((g) => {
                    if (wildcardMatch(g.name, raw)) return g;
                    return {
                        ...g,
                        items: g.items.filter(
                            (item) =>
                                wildcardMatch(item.name, raw) ||
                                wildcardMatch(item.shortcut, raw) ||
                                wildcardMatch(item.description, raw),
                        ),
                    };
                });
        }

        return result;
    }, [groups, searchFilter]);

    const showPromptLoop = useCallback(() => {
        // Use setTimeout so the checkbox renders before the prompt blocks the UI
        setTimeout(() => {
            const input = window.prompt('Type `help` for a list of commands:');
            if (input !== null && input.trim().toLowerCase() !== 'help' && input.trim() !== '') {
                // Navigate immediately — don't setPromptActive(false) so the page stays blank during navigation
                if (navigateByShortcut(input, bookmarks)) return;
            }
            setPromptActive(false);
        }, 0);
    }, [bookmarks]);

    // Show prompt or palette on page load based on startupMode (once only)
    useEffect(() => {
        if (bookmarks.length > 0 && !promptShown.current) {
            promptShown.current = true;
            if (startupMode === 'prompt') {
                showPromptLoop();
            } else if (startupMode === 'palette') {
                setPaletteOpen(true);
                setPromptActive(false);
            }
        }
    }, [bookmarks]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleStartupModeChange = useCallback((mode: 'none' | 'prompt' | 'palette') => {
        setStartupMode(mode);
        localStorage.setItem('startupMode', mode);
    }, []);

    const handleProfileChange = useCallback((profile: string) => {
        setActiveProfile(profile);
        localStorage.setItem('activeProfile', profile);
    }, []);

    const openFilteredBookmarks = useCallback(() => {
        openUrls(displayedGroups.flatMap((g) => g.items).map((item) => ({ name: item.name, url: item.url })));
    }, [displayedGroups]);

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && searchFilter.trim()) {
                openFilteredBookmarks();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchFilter('');
            }
        },
        [searchFilter, openFilteredBookmarks],
    );

    const openCreateModal = useCallback(() => {
        setEditingBookmark(null);
        setModalOpen(true);
    }, []);

    const openEditModal = useCallback((item: WebBookmarksItem) => {
        setEditingBookmark(item);
        setModalOpen(true);
    }, []);

    const handleModalClose = useCallback(() => {
        setModalOpen(false);
        setEditingBookmark(null);
    }, []);

    const handleModalSaved = useCallback(() => {
        setModalOpen(false);
        setEditingBookmark(null);
        loadBookmarks();
    }, [loadBookmarks]);

    const handleDelete = useCallback(
        async (item: WebBookmarksItem) => {
            if (!window.confirm(`Delete "${item.name}"?`)) return;
            try {
                await deleteBookmark(item.id);
                loadBookmarks();
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Delete failed');
            }
        },
        [loadBookmarks],
    );

    const handleReorder = useCallback(
        async (groupName: string, activeId: number, overId: number) => {
            const group = groups.find((g) => g.name === groupName);
            if (!group) return;
            const items = [...group.items];
            const oldIndex = items.findIndex((i) => i.id === activeId);
            const newIndex = items.findIndex((i) => i.id === overId);
            if (oldIndex < 0 || newIndex < 0) return;

            const [moved] = items.splice(oldIndex, 1);
            items.splice(newIndex, 0, moved);
            const entries = items.map((i, pos) => ({ id: i.id, sortOrder: pos }));

            // Optimistic update
            setBookmarks((prev) => {
                const next = [...prev];
                for (const entry of entries) {
                    const b = next.find((b) => b.id === entry.id);
                    if (b) b.sortOrder = entry.sortOrder;
                }
                return next;
            });

            try {
                await reorderBookmarks(entries);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Reorder failed');
                loadBookmarks();
            }
        },
        [groups, loadBookmarks],
    );

    if (loading) return null;
    if (error) return <div className="loading-msg text-danger">{error}</div>;
    if (promptActive) return null;

    return (
        <div className="app-body">
            <div className="header-spacer" />

            <div id="colMain" style={startupPaletteHiding ? { display: 'none' } : undefined}>
                {profiles.length > 1 && (
                    <div className="profile-tabs">
                        {profiles.map((p) => (
                            <button
                                key={p}
                                className={`profile-tab${p === activeProfile ? ' profile-tab-active' : ''}`}
                                onClick={() => handleProfileChange(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                )}
                <div className="input-group input-group-sm mb-3">
                    <span className="input-group-text input-label-text" onClick={loadBookmarks}>
                        Search
                    </span>
                    <input
                        ref={bookmarkInputRef}
                        className="form-control"
                        placeholder="/ bookmarks · @ groups"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                    <button
                        className="btn-palette input-group-text"
                        onClick={() => setPaletteOpen(true)}
                        title="Command Palette (Ctrl+/)"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="10.5" cy="10.5" r="7" />
                            <line x1="15.5" y1="15.5" x2="22" y2="22" />
                        </svg>
                    </button>
                    <div className="dropdown-options-wrap" ref={optionsRef}>
                        <button
                            className="btn-options input-group-text"
                            onClick={() => setOptionsOpen((v) => !v)}
                            title="Options"
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
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                        {optionsOpen && (
                            <div className="dropdown-options-menu">
                                <label className="dropdown-options-item">
                                    <input
                                        type="checkbox"
                                        className="form-check-input mt-0 me-1"
                                        checked={showHidden}
                                        onChange={(e) => setShowHidden(e.target.checked)}
                                    />
                                    Hidden
                                </label>
                                <label className="dropdown-options-item">
                                    <input
                                        type="checkbox"
                                        className="form-check-input mt-0 me-1"
                                        checked={editMode}
                                        onChange={(e) => setEditMode(e.target.checked)}
                                    />
                                    Edit
                                </label>
                            </div>
                        )}
                    </div>
                    <span className="input-group-text startup-mode-group">
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'prompt'}
                                onChange={() => handleStartupModeChange('prompt')}
                            />
                            Prompt
                        </label>
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'palette'}
                                onChange={() => handleStartupModeChange('palette')}
                            />
                            Palette
                        </label>
                        <label className="startup-mode-option">
                            <input
                                type="radio"
                                className="form-check-input mt-0 me-1"
                                name="startupMode"
                                checked={startupMode === 'none'}
                                onChange={() => handleStartupModeChange('none')}
                            />
                            None
                        </label>
                    </span>
                    <button
                        className="btn-new-bookmark input-group-text"
                        onClick={openCreateModal}
                        title="New Bookmark"
                    >
                        +
                    </button>
                    <button
                        className={`btn-clear input-group-text${searchFilter ? '' : ' btn-clear-inactive'}`}
                        onClick={() => searchFilter && setSearchFilter('')}
                        aria-label="Clear"
                        tabIndex={searchFilter ? 0 : -1}
                    >
                        ×
                    </button>
                </div>

                {displayedGroups.map((g) => (
                    <BookmarkGroupComponent
                        key={g.name}
                        group={g}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onReorder={handleReorder}
                        conflictIds={conflictIds}
                        editMode={editMode}
                    />
                ))}
            </div>

            {modalOpen && (
                <BookmarkModal
                    bookmark={editingBookmark}
                    allBookmarks={bookmarks}
                    activeProfile={activeProfile}
                    onClose={handleModalClose}
                    onSaved={handleModalSaved}
                />
            )}

            {paletteOpen && (
                <CommandPalette
                    groups={groups}
                    onClose={(navigating) => {
                        setPaletteOpen(false);
                        if (startupPaletteHiding && !navigating) setStartupPaletteHiding(false);
                    }}
                />
            )}
        </div>
    );
}
