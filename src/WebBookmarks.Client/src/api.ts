import type { WebBookmarksItem } from './types';
import { getApiKey, clearApiKey } from './auth';

const API_BASE =
    import.meta.env.VITE_API_BASE ??
    (import.meta.env.PROD ? 'https://webbookmarksapi.azurewebsites.net/api/bookmarks' : '/api/bookmarks');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

// Wraps fetch to attach the stored API key and handle auth failures centrally.
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const key = getApiKey();
    const headers = new Headers(init.headers);
    if (key) headers.set('X-Api-Key', key);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) {
        clearApiKey();
        window.location.reload();
        throw new Error('Unauthorized');
    }
    return res;
}

// Issues an authenticated request, throws a labelled error on non-2xx, and
// returns the parsed JSON body (or undefined for empty 204 responses).
// A `body` is JSON-serialized and sent with the appropriate Content-Type.
async function request<T>(
    url: string,
    opts: { method?: string; body?: unknown; label: string },
): Promise<T> {
    const init: RequestInit = {};
    if (opts.method) init.method = opts.method;
    if (opts.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(opts.body);
    }
    const res = await apiFetch(url, init);
    if (!res.ok) throw new Error(`Failed to ${opts.label}: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

// Validates a key against the API without persisting it. Used by the login gate.
export async function validateApiKey(key: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/profiles`, { headers: { 'X-Api-Key': key } });
        return res.ok;
    } catch {
        return false;
    }
}

export async function fetchBookmarks(includeHidden = false, profile?: string): Promise<WebBookmarksItem[]> {
    let lastError: Error | undefined;
    const params = new URLSearchParams();
    if (includeHidden) params.set('includeHidden', 'true');
    if (profile) params.set('profile', profile);
    const qs = params.toString();
    const url = qs ? `${API_BASE}?${qs}` : API_BASE;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const res = await apiFetch(url);
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

export function createBookmark(item: Omit<WebBookmarksItem, 'id'>): Promise<WebBookmarksItem> {
    return request(API_BASE, { method: 'POST', body: item, label: 'create bookmark' });
}

export function updateBookmark(id: number, item: WebBookmarksItem): Promise<void> {
    return request(`${API_BASE}/${id}`, { method: 'PUT', body: item, label: 'update bookmark' });
}

export function deleteBookmark(id: number): Promise<void> {
    return request(`${API_BASE}/${id}`, { method: 'DELETE', label: 'delete bookmark' });
}

export function reorderBookmarks(entries: { id: number; sortOrder: number }[]): Promise<void> {
    return request(`${API_BASE}/reorder`, { method: 'POST', body: entries, label: 'reorder bookmarks' });
}

export function checkAlias(
    alias: string,
    excludeId?: number,
): Promise<{ isDuplicate: boolean; matches: { id: number; name: string; shortcut: string }[] }> {
    const params = new URLSearchParams({ alias });
    if (excludeId !== undefined) params.set('excludeId', String(excludeId));
    return request(`${API_BASE}/check-alias?${params}`, { label: 'check alias' });
}

export function fetchGroups(profile?: string, exact?: boolean): Promise<string[]> {
    const params = new URLSearchParams();
    if (profile) params.set('profile', profile);
    if (exact) params.set('exact', 'true');
    const qs = params.toString();
    return request(`${API_BASE}/groups${qs ? `?${qs}` : ''}`, { label: 'fetch groups' });
}

export function fetchProfiles(): Promise<string[]> {
    return request(`${API_BASE}/profiles`, { label: 'fetch profiles' });
}

export function bulkCreateBookmarks(items: Omit<WebBookmarksItem, 'id'>[]): Promise<{ imported: number }> {
    return request(`${API_BASE}/bulk`, { method: 'POST', body: items, label: 'bulk import' });
}

export function bulkUpdateBookmarks(
    ids: number[],
    profile?: string,
    bookmarkGroup?: string,
    shortcut?: string,
    isVisible?: boolean,
): Promise<{ updated: number }> {
    const clearShortcut = shortcut === '' ? true : null;
    return request(`${API_BASE}/bulk`, {
        method: 'PUT',
        body: {
            ids,
            profile: profile ?? null,
            bookmarkGroup: bookmarkGroup ?? null,
            shortcut: shortcut || null,
            isVisible: isVisible ?? null,
            clearShortcut,
        },
        label: 'bulk update',
    });
}

export function bulkDeleteBookmarks(ids: number[]): Promise<{ deleted: number }> {
    return request(`${API_BASE}/bulk-delete`, { method: 'POST', body: ids, label: 'bulk delete' });
}

export function toggleFavorite(id: number): Promise<{ id: number; isFavorite: boolean }> {
    return request(`${API_BASE}/${id}/favorite`, { method: 'PATCH', label: 'toggle favorite' });
}
