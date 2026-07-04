import { useMemo } from 'react';
import type { WebBookmarksItem, BookmarkGroup } from '../types';
import { wildcardMatch } from '../utils';

// Derives the grouped views of the bookmark list:
//  - groups: all bookmarks grouped by bookmarkGroup, items sorted by sortOrder
//  - paletteGroups: visible-only groups for the command palette
//  - conflictIds: bookmark ids whose shortcut alias overlaps another's
//  - displayedGroups: `groups` narrowed by the search filter, where a leading
//    '/' filters bookmarks, '@' filters groups, '*' filters favorites, and
//    anything else searches both group names and bookmark fields.
export function useBookmarkGroups(bookmarks: WebBookmarksItem[], searchFilter: string) {
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

    const paletteGroups: BookmarkGroup[] = useMemo(() => {
        return groups
            .map((g) => ({ ...g, items: g.items.filter((b) => b.isVisible) }))
            .filter((g) => g.items.length > 0);
    }, [groups]);

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

    return { groups, paletteGroups, conflictIds, displayedGroups };
}
