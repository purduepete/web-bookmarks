import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchBookmarks, deleteBookmark } from './api';
import type { WebBookmarksItem, BookmarkGroup } from './types';
import GroupsSidebar from './components/GroupsSidebar';
import BookmarkGroupComponent from './components/BookmarkGroup';
import BookmarkModal from './components/BookmarkModal';

function openUrls(urls: string[]) {
    for (let i = 0; i < urls.length; i++) {
        if (i === urls.length - 1) {
            window.location.href = urls[i];
        } else {
            window.open(urls[i], '_blank', 'noopener');
        }
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
        matches.map((m) => (searchQuery && m.urls ? m.urls.replace('{q}', encodeURIComponent(searchQuery)) : m.url)),
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

    const [groupFilter, setGroupFilter] = useState('');
    const [bookmarkFilter, setBookmarkFilter] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [promptEnabled, setPromptEnabled] = useState(() => localStorage.getItem('promptEnabled') === 'true');
    const [promptActive, setPromptActive] = useState(() => localStorage.getItem('promptEnabled') === 'true');
    const promptShown = useRef(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBookmark, setEditingBookmark] = useState<WebBookmarksItem | null>(null);
    const [showHidden, setShowHidden] = useState(false);

    const loadBookmarks = useCallback(() => {
        setError(null);
        fetchBookmarks(showHidden)
            .then((data) => {
                setBookmarks(data);
                localStorage.setItem('bookmarks', JSON.stringify(data));
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [showHidden]);

    useEffect(() => {
        loadBookmarks();
    }, [loadBookmarks]);

    const groups: BookmarkGroup[] = useMemo(() => {
        const map = new Map<string, WebBookmarksItem[]>();
        for (const b of bookmarks) {
            const list = map.get(b.bookmarkGroup) ?? [];
            list.push(b);
            map.set(b.bookmarkGroup, list);
        }
        return Array.from(map.entries())
            .map(([name, items]) => ({ name, items }))
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

        if (selectedGroup) {
            result = result.filter((g) => g.name === selectedGroup);
        } else if (groupFilter) {
            const lower = groupFilter.toLowerCase();
            result = result.filter((g) => g.name.toLowerCase().includes(lower));
        }

        if (bookmarkFilter) {
            const lower = bookmarkFilter.toLowerCase();
            result = result
                .map((g) => ({
                    ...g,
                    items: g.items.filter(
                        (item) =>
                            item.name.toLowerCase().includes(lower) ||
                            item.shortcut.toLowerCase().includes(lower) ||
                            item.description.toLowerCase().includes(lower),
                    ),
                }))
                .filter((g) => g.items.length > 0);
        }

        return result;
    }, [groups, selectedGroup, groupFilter, bookmarkFilter]);

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

    // Show prompt on page load if checkbox was saved as enabled (once only)
    useEffect(() => {
        if (promptEnabled && bookmarks.length > 0 && !promptShown.current) {
            promptShown.current = true;
            showPromptLoop();
        }
    }, [bookmarks]); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePromptToggle = useCallback((checked: boolean) => {
        setPromptEnabled(checked);
        localStorage.setItem('promptEnabled', String(checked));
    }, []);

    const openFilteredBookmarks = useCallback(() => {
        openUrls(displayedGroups.flatMap((g) => g.items).map((item) => item.url));
    }, [displayedGroups]);

    const handleBookmarkKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && bookmarkFilter.trim()) {
                openFilteredBookmarks();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setBookmarkFilter('');
            }
        },
        [bookmarkFilter, openFilteredBookmarks],
    );

    const handleGroupKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && groupFilter.trim()) {
                openFilteredBookmarks();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setGroupFilter('');
            }
        },
        [groupFilter, openFilteredBookmarks],
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

    if (loading) return null;
    if (error) return <div className="loading-msg text-danger">{error}</div>;
    if (promptActive) return null;

    return (
        <div className="app-body">
            <div className="header-spacer" />

            <div id="colLeft">
                <GroupsSidebar
                    groups={groups}
                    filter={groupFilter}
                    onFilterChange={setGroupFilter}
                    onKeyDown={handleGroupKeyDown}
                    selectedGroup={selectedGroup}
                    onGroupSelect={(name) => {
                        setSelectedGroup(name);
                        if (name) {
                            document
                                .getElementById(`group-${name}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }}
                />
            </div>

            <div id="colRight">
                <div className="input-group input-group-sm mb-3">
                    <span className="input-group-text input-label-text" onClick={loadBookmarks}>
                        Bookmark
                    </span>
                    <input
                        className="form-control"
                        value={bookmarkFilter}
                        onChange={(e) => setBookmarkFilter(e.target.value)}
                        onKeyDown={handleBookmarkKeyDown}
                    />
                    <span className="input-group-text">
                        <input
                            type="checkbox"
                            className="form-check-input mt-0 me-1"
                            checked={showHidden}
                            onChange={(e) => setShowHidden(e.target.checked)}
                            aria-label="Show Hidden"
                        />
                        <span className="label-prompt">Hidden?</span>
                    </span>
                    <span className="input-group-text">
                        <input
                            type="checkbox"
                            className="form-check-input mt-0 me-1"
                            checked={promptEnabled}
                            onChange={(e) => handlePromptToggle(e.target.checked)}
                            aria-label="Prompt"
                        />
                        <span className="label-prompt">Prompt?</span>
                    </span>
                    <button
                        className="btn-new-bookmark input-group-text"
                        onClick={openCreateModal}
                        title="New Bookmark"
                    >
                        +
                    </button>
                    <button
                        className={`btn-clear input-group-text${bookmarkFilter ? '' : ' btn-clear-hidden'}`}
                        onClick={() => setBookmarkFilter('')}
                        aria-label="Clear"
                        tabIndex={bookmarkFilter ? 0 : -1}
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
                        conflictIds={conflictIds}
                    />
                ))}
            </div>

            {modalOpen && (
                <BookmarkModal bookmark={editingBookmark} onClose={handleModalClose} onSaved={handleModalSaved} />
            )}
        </div>
    );
}
