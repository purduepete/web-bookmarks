import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchBookmarks, deleteBookmark, reorderBookmarks, fetchProfiles, toggleFavorite } from './api';
import type { WebBookmarksItem, BookmarkGroup } from './types';
import { wildcardMatch, openUrls } from './utils';

import BookmarkGroupComponent from './components/BookmarkGroup';
import BookmarkModal from './components/BookmarkModal';
import ImportModal from './components/ImportModal';
import BulkEditModal from './components/BulkEditModal';
import CommandPalette from './components/CommandPalette';

function navigateByShortcut(input: string, bookmarks: WebBookmarksItem[], openInNewTab = false): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;

    const parts = trimmed.split(/\s+/);
    const shortcut = parts[0].toLowerCase();
    const searchQuery = parts.slice(1).join(' ');

    let matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase() === shortcut);
    if (matches.length === 0) {
        matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase().includes(shortcut));
    }
    // Also match by name for bookmarks with search URLs (e.g. "seek msft")
    if (matches.length === 0 && searchQuery) {
        matches = bookmarks.filter((b) => b.urls && b.name.toLowerCase().startsWith(shortcut));
    }

    if (matches.length === 0) return false;

    openUrls(
        matches.map((m) => ({
            name: m.name,
            url: searchQuery && m.urls ? m.urls.replace('{q}', encodeURIComponent(searchQuery)) : m.url,
        })),
        openInNewTab,
    );
    return true;
}

export default function App() {
    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>(() => {
        const profile = localStorage.getItem('activeProfile') || 'home';
        try {
            const cached = localStorage.getItem(`bookmarks_${profile}`) || localStorage.getItem('bookmarks');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(() => {
        const profile = localStorage.getItem('activeProfile') || 'home';
        return !localStorage.getItem(`bookmarks_${profile}`) && !localStorage.getItem('bookmarks');
    });
    const [error, setError] = useState<string | null>(null);

    const [searchFilter, setSearchFilter] = useState('');
    const [startupMode, setStartupMode] = useState<'none' | 'prompt' | 'palette'>(() => {
        const saved = localStorage.getItem('startupMode');
        if (saved === 'prompt' || saved === 'palette') return saved;
        return 'none';
    });
    const [promptActive, setPromptActive] = useState(() => {
        return localStorage.getItem('startupMode') === 'prompt';
    });
    const promptShown = useRef(false);
    const bookmarkInputRef = useRef<HTMLInputElement>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBookmark, setEditingBookmark] = useState<WebBookmarksItem | null>(null);
    const [showHidden, setShowHidden] = useState(true);
    const [editMode, setEditMode] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const optionsRef = useRef<HTMLDivElement>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [startupPaletteHiding, setStartupPaletteHiding] = useState(() => {
        const saved = localStorage.getItem('startupMode');
        return saved === 'palette';
    });
    const [activeProfile, setActiveProfile] = useState<string>(() => {
        return localStorage.getItem('activeProfile') || 'home';
    });
    const [profiles, setProfiles] = useState<string[]>(() => {
        try {
            const cached = localStorage.getItem('profiles');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [disabledProfiles, setDisabledProfiles] = useState<Set<string>>(() => {
        try {
            const cached = localStorage.getItem('disabledProfiles');
            return cached ? new Set(JSON.parse(cached)) : new Set();
        } catch {
            return new Set();
        }
    });

    function toggleDisabledProfile(profile: string) {
        setDisabledProfiles((prev) => {
            const next = new Set(prev);
            if (next.has(profile)) next.delete(profile);
            else next.add(profile);
            localStorage.setItem('disabledProfiles', JSON.stringify([...next]));
            return next;
        });
    }

    function getLocalBookmarks(profile: string): WebBookmarksItem[] | null {
        try {
            const cached = localStorage.getItem(`bookmarks_${profile}`);
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    }

    function setLocalBookmarks(profile: string, data: WebBookmarksItem[]) {
        localStorage.setItem(`bookmarks_${profile}`, JSON.stringify(data));
        // Also keep legacy key for backwards compat
        localStorage.setItem('bookmarks', JSON.stringify(data));
    }

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
                if (startupMode === 'palette') {
                    setPaletteOpen(true);
                    setStartupPaletteHiding(true);
                    setEditMode(false);
                } else {
                    setPaletteOpen((v) => {
                        if (v) setStartupPaletteHiding(false);
                        return !v;
                    });
                }
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [startupMode]);

    const loadBookmarks = useCallback(() => {
        setError(null);
        // Immediately show locally cached bookmarks for this profile
        const local = getLocalBookmarks(activeProfile);
        if (local) setBookmarks(local);
        // Fetch fresh data in background
        fetchBookmarks(showHidden, activeProfile)
            .then((data) => {
                setBookmarks(data);
                setLocalBookmarks(activeProfile, data);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        fetchProfiles()
            .then((data) => {
                setProfiles(data);
                localStorage.setItem('profiles', JSON.stringify(data));
            })
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
        } else if (raw.startsWith('*')) {
            // Favorites filter
            const term = raw.slice(1);
            result = result
                .map((g) => ({
                    ...g,
                    items: g.items.filter(
                        (item) =>
                            item.isFavorite &&
                            (!term ||
                                wildcardMatch(item.name, term) ||
                                wildcardMatch(item.shortcut, term) ||
                                wildcardMatch(item.description, term)),
                    ),
                }))
                .filter((g) => g.items.length > 0);
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
            let input: string | null = null;
            try {
                input = window.prompt('Type `help` for a list of commands:');
            } catch {
                // prompt() not supported (e.g. VS Code Simple Browser)
                setPromptActive(false);
                return;
            }
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

    // Re-open palette when returning via back/forward (bfcache) on iPad/Safari
    useEffect(() => {
        const handlePageShow = (e: PageTransitionEvent) => {
            if (e.persisted && startupMode === 'palette') {
                setPaletteOpen(true);
                setStartupPaletteHiding(true);
            }
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, [startupMode]);

    const handleStartupModeChange = useCallback((mode: 'none' | 'prompt' | 'palette') => {
        setStartupMode(mode);
        localStorage.setItem('startupMode', mode);
    }, []);

    const handleProfileChange = useCallback((profile: string) => {
        setActiveProfile(profile);
        localStorage.setItem('activeProfile', profile);
    }, []);

    const openFilteredBookmarks = useCallback(
        (newTab = false) => {
            openUrls(
                displayedGroups.flatMap((g) => g.items).map((item) => ({ name: item.name, url: item.url })),
                newTab,
            );
        },
        [displayedGroups],
    );

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && searchFilter.trim()) {
                openFilteredBookmarks(e.ctrlKey || e.metaKey);
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

    const handleToggleFavorite = useCallback(
        async (item: WebBookmarksItem) => {
            // Optimistic update
            setBookmarks((prev) => prev.map((b) => (b.id === item.id ? { ...b, isFavorite: !b.isFavorite } : b)));
            try {
                await toggleFavorite(item.id);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Toggle favorite failed');
                loadBookmarks();
            }
        },
        [loadBookmarks],
    );

    if (loading) return null;
    if (error) return <div className="loading-msg text-danger">{error}</div>;
    if (promptActive) return null;

    return (
        <div className="app-body">
            <div className="header-spacer" />

            <div id="colMain" style={startupPaletteHiding ? { display: 'none' } : undefined}>
                {profiles.filter((p) => !disabledProfiles.has(p)).length > 1 && (
                    <div className="profile-tabs">
                        {profiles
                            .filter((p) => !disabledProfiles.has(p))
                            .map((p) => (
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
                        placeholder="/ bookmarks · @ groups · * favorites"
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
                                <div className="dropdown-options-divider" />
                                <button
                                    className="dropdown-options-item dropdown-options-btn"
                                    onClick={() => {
                                        setImportOpen(true);
                                        setOptionsOpen(false);
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    Import
                                </button>
                                <button
                                    className="dropdown-options-item dropdown-options-btn"
                                    onClick={() => {
                                        setBulkEditOpen(true);
                                        setOptionsOpen(false);
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                    Bulk Edit
                                </button>
                                {profiles.filter((p) => p !== 'all').length > 1 && (
                                    <>
                                        <div className="dropdown-options-divider" />
                                        <div className="dropdown-options-heading">Profiles</div>
                                        {profiles
                                            .filter((p) => p !== 'all')
                                            .map((p) => (
                                                <label key={p} className="dropdown-options-item">
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input mt-0 me-1"
                                                        checked={!disabledProfiles.has(p)}
                                                        onChange={() => toggleDisabledProfile(p)}
                                                    />
                                                    {p}
                                                </label>
                                            ))}
                                    </>
                                )}
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
                        onToggleFavorite={handleToggleFavorite}
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

            {importOpen && (
                <ImportModal
                    activeProfile={activeProfile}
                    onClose={() => {
                        setImportOpen(false);
                    }}
                    onImported={loadBookmarks}
                />
            )}

            {bulkEditOpen && (
                <BulkEditModal
                    bookmarks={bookmarks}
                    activeProfile={activeProfile}
                    onClose={() => {
                        setBulkEditOpen(false);
                    }}
                    onChanged={loadBookmarks}
                />
            )}

            {paletteOpen && (
                <CommandPalette
                    groups={groups}
                    onClose={(navigating) => {
                        if (startupMode === 'palette' && !navigating) return;
                        setPaletteOpen(false);
                        if (startupPaletteHiding && !navigating) setStartupPaletteHiding(false);
                    }}
                    onAction={(action, payload) => {
                        switch (action) {
                            case 'new-bookmark':
                                setEditingBookmark(null);
                                setModalOpen(true);
                                setPaletteOpen(false);
                                break;
                            case 'import':
                                setImportOpen(true);
                                setPaletteOpen(false);
                                break;
                            case 'bulk-edit':
                                setBulkEditOpen(true);
                                setPaletteOpen(false);
                                break;
                            case 'select-profile':
                                if (payload) handleProfileChange(payload);
                                break;
                            case 'reload':
                                loadBookmarks();
                                break;
                            case 'show-landing':
                                setStartupPaletteHiding(false);
                                setPaletteOpen(false);
                                setTimeout(() => bookmarkInputRef.current?.focus(), 0);
                                break;
                        }
                    }}
                    profiles={profiles.filter((p) => !disabledProfiles.has(p))}
                    activeProfile={activeProfile}
                    isPaletteMode={startupMode === 'palette'}
                />
            )}
        </div>
    );
}
