import { useState, useEffect, useMemo } from 'react';
import { fetchBookmarks } from './api';
import type { WebBookmarksItem, BookmarkGroup } from './types';
import GroupsSidebar from './components/GroupsSidebar';
import BookmarkGroupComponent from './components/BookmarkGroup';

export default function App() {
    const [bookmarks, setBookmarks] = useState<WebBookmarksItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [groupFilter, setGroupFilter] = useState('');
    const [bookmarkFilter, setBookmarkFilter] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

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

    if (loading) return <div className="loading-msg">Loading bookmarks…</div>;
    if (error) return <div className="loading-msg text-danger">{error}</div>;

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
                    <span className="input-group-text input-label-text">Bookmark</span>
                    <input
                        className="form-control"
                        value={bookmarkFilter}
                        onChange={(e) => setBookmarkFilter(e.target.value)}
                    />
                </div>

                {displayedGroups.map((g) => (
                    <BookmarkGroupComponent key={g.name} group={g} />
                ))}
            </div>
        </div>
    );
}
