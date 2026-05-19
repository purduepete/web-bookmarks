import type { WebBookmarksItem } from './types';

const API_BASE = import.meta.env.PROD ? 'https://webbookmarksapi.azurewebsites.net/api/bookmarks' : '/api/bookmarks';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export async function fetchBookmarks(includeHidden = false, profile?: string): Promise<WebBookmarksItem[]> {
    let lastError: Error | undefined;
    const params = new URLSearchParams();
    if (includeHidden) params.set('includeHidden', 'true');
    if (profile) params.set('profile', profile);
    const qs = params.toString();
    const url = qs ? `${API_BASE}?${qs}` : API_BASE;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch bookmarks: ${res.status}`);
            const data: unknown[] = await res.json();
            return data.map((raw: any) => ({
                ...raw,
                name: raw.name ?? '',
                shortcut: raw.shortcut ?? '',
                description: raw.description ?? '',
                url: raw.url ?? '',
                bookmarkGroup: raw.bookmarkGroup ?? '',
                profile: raw.profile ?? '',
            })) as WebBookmarksItem[];
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < MAX_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }
    throw lastError!;
}

export async function createBookmark(item: Omit<WebBookmarksItem, 'id'>): Promise<WebBookmarksItem> {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error(`Failed to create bookmark: ${res.status}`);
    return await res.json();
}

export async function updateBookmark(id: number, item: WebBookmarksItem): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error(`Failed to update bookmark: ${res.status}`);
}

export async function deleteBookmark(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete bookmark: ${res.status}`);
}

export async function reorderBookmarks(entries: { id: number; sortOrder: number }[]): Promise<void> {
    const res = await fetch(`${API_BASE}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
    });
    if (!res.ok) throw new Error(`Failed to reorder bookmarks: ${res.status}`);
}

export async function checkAlias(
    alias: string,
    excludeId?: number,
): Promise<{ isDuplicate: boolean; matches: { id: number; name: string; shortcut: string }[] }> {
    const params = new URLSearchParams({ alias });
    if (excludeId !== undefined) params.set('excludeId', String(excludeId));
    const res = await fetch(`${API_BASE}/check-alias?${params}`);
    if (!res.ok) throw new Error(`Failed to check alias: ${res.status}`);
    return await res.json();
}

export async function fetchGroups(profile?: string): Promise<string[]> {
    const params = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    const res = await fetch(`${API_BASE}/groups${params}`);
    if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
    return await res.json();
}

export async function fetchProfiles(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/profiles`);
    if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
    return await res.json();
}

export async function bulkCreateBookmarks(items: Omit<WebBookmarksItem, 'id'>[]): Promise<{ imported: number }> {
    const res = await fetch(`${API_BASE}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error(`Failed to bulk import: ${res.status}`);
    return await res.json();
}

export async function bulkUpdateBookmarks(
    ids: number[],
    profile?: string,
    bookmarkGroup?: string,
    shortcut?: string,
    isVisible?: boolean,
): Promise<{ updated: number }> {
    const clearShortcut = shortcut === '' ? true : null;
    const res = await fetch(`${API_BASE}/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ids,
            profile: profile ?? null,
            bookmarkGroup: bookmarkGroup ?? null,
            shortcut: shortcut || null,
            isVisible: isVisible ?? null,
            clearShortcut,
        }),
    });
    if (!res.ok) throw new Error(`Failed to bulk update: ${res.status}`);
    return await res.json();
}

export async function bulkDeleteBookmarks(ids: number[]): Promise<{ deleted: number }> {
    const res = await fetch(`${API_BASE}/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids),
    });
    if (!res.ok) throw new Error(`Failed to bulk delete: ${res.status}`);
    return await res.json();
}

export async function toggleFavorite(id: number): Promise<{ id: number; isFavorite: boolean }> {
    const res = await fetch(`${API_BASE}/${id}/favorite`, {
        method: 'PATCH',
    });
    if (!res.ok) throw new Error(`Failed to toggle favorite: ${res.status}`);
    return await res.json();
}
