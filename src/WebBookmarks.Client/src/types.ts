export interface WebBookmarksItem {
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
    items: WebBookmarksItem[];
}
