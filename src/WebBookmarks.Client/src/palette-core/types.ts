// Shared, host-agnostic types for the command palette. These are consumed by
// both the React client and (via the userscript build) the Tampermonkey
// userscript, so they must not depend on React, the DOM, or any host API.

// A single bookmark record as returned by the WebBookmarks API. This is the
// canonical shape; the React client re-exports it as `WebBookmarksItem`.
export interface Bookmark {
    id: number;
    name: string;
    shortcut: string;
    description: string;
    url: string;
    urls: string | null;
    isVisible: boolean;
    bookmarkGroup: string;
    sortOrder: number;
    profile: string;
    isFavorite: boolean;
}

export interface BookmarkGroup {
    name: string;
    items: Bookmark[];
}

// A row in the palette: a bookmark, a group, or an action.
export interface PaletteEntry {
    kind: 'bookmark' | 'group' | 'action';
    label: string;
    secondary: string;
    alias: string;
    bookmark?: Bookmark;
    group?: BookmarkGroup;
    action?: string;
    actionPayload?: string;
    isRecent?: boolean;
}

// A most-recently-used record, persisted per profile by each host.
export interface MruEntry {
    id: number;
    count: number;
    ts: number;
}
