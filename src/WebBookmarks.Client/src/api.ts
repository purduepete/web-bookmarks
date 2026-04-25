import type { WebBookmarksItem } from './types';

const API_BASE = '/api/bookmarks';

export async function fetchBookmarks(): Promise<WebBookmarksItem[]> {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`Failed to fetch bookmarks: ${res.status}`);
    return res.json();
}
