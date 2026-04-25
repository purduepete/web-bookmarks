import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchBookmarks } from './api';
import type { WebBookmarksItem, BookmarkGroup } from './types';
import GroupsSidebar from './components/GroupsSidebar';
import BookmarkGroupComponent from './components/BookmarkGroup';

function navigateByShortcut(input: string, bookmarks: WebBookmarksItem[]) {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Split into shortcut and optional search query
    const parts = trimmed.split(/\s+/);
    const shortcut = parts[0].toLowerCase();
    const searchQuery = parts.slice(1).join(' ');

    // Find matching bookmarks (exact match first, then partial)
    let matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase() === shortcut);
    if (matches.length === 0) {
        matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase().includes(shortcut));
    }

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const isLast = i === matches.length - 1;
        const url = searchQuery && match.urls ? match.urls.replace('{q}', encodeURIComponent(searchQuery)) : match.url;

        if (isLast) {
            // Last match replaces the current page
            window.location.href = url;
        } else {
            // Other matches open in new tabs
            window.open(url, '_blank', 'noopener');
        }
    }
}

export default function App() {
    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [groupFilter, setGroupFilter] = useState('');
    const [bookmarkFilter, setBookmarkFilter] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [promptEnabled, setPromptEnabled] = useState(() => localStorage.getItem('promptEnabled') === 'true');
    const [promptActive, setPromptActive] = useState(() => localStorage.getItem('promptEnabled') === 'true');
    const promptShown = useRef(false);

    useEffect(() => {
        fetchBookmarks()
            .then(setBookmarks)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

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

    const displayedGroups = useMemo(() => {
        let result = groups;

        if (selectedGroup) {
            result = result.filter((g) => g.name === selectedGroup);
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
    }, [groups, selectedGroup, bookmarkFilter]);

    const showPromptLoop = useCallback(() => {
        // Use setTimeout so the checkbox renders before the prompt blocks the UI
        setTimeout(() => {
            const input = window.prompt('Type `help` for a list of commands:');
            if (input !== null && input.trim().toLowerCase() !== 'help' && input.trim() !== '') {
                navigateByShortcut(input, bookmarks);
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

    const handleBookmarkKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && bookmarkFilter.trim()) {
                navigateByShortcut(bookmarkFilter, bookmarks);
            }
        },
        [bookmarkFilter, bookmarks],
    );

    const reloadBookmarks = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchBookmarks()
            .then(setBookmarks)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

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
                    selectedGroup={selectedGroup}
                    onGroupSelect={setSelectedGroup}
                />
            </div>

            <div id="colRight">
                <div className="input-group input-group-sm mb-3">
                    <span className="input-group-text input-label-text" onClick={reloadBookmarks}>
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
                            checked={promptEnabled}
                            onChange={(e) => handlePromptToggle(e.target.checked)}
                            aria-label="Prompt"
                        />
                        <span className="label-prompt">Prompt?</span>
                    </span>
                </div>

                {displayedGroups.map((g) => (
                    <BookmarkGroupComponent key={g.name} group={g} />
                ))}
            </div>
        </div>
    );
}
