import type { WebBookmarksItem } from './types';
import { getApiKey, clearApiKey, notifyUnauthorized } from './auth';

const API_BASE =
    import.meta.env.VITE_API_BASE ??
    (import.meta.env.PROD ? 'https://webbookmarksapi.azurewebsites.net/api/bookmarks' : '/api/bookmarks');

// Per-request timeout, and a transient-only retry policy. We retry network
// errors/timeouts and a small set of transient HTTP statuses with exponential
// backoff + jitter — never 4xx (auth/validation) failures, which won't recover.
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 500;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// Must match WebBookmarks.Api Program.cs `const int MaxBulkItems = 1000`: the API
// rejects any bulk request larger than this. The bulk helpers below chunk
// oversized inputs to this size transparently, so no caller can exceed the cap.
export const MAX_BULK_ITEMS = 1000;

// Carries the HTTP status so the retry policy can decide whether to retry.
// Exported for regression tests of the transient-only retry policy.
export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

// fetch with an abort-based timeout so a hung request can't wait forever.
function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Decides whether a failed request should be retried. Exported so the
// transient-only policy (retry timeouts/network/transient 5xx; never 4xx or
// deterministic errors) can be locked in by regression tests.
export function isRetryable(err: unknown): boolean {
    if (err instanceof HttpError) return RETRYABLE_STATUS.has(err.status);
    // A surfaced 401 (handled below) must not be retried.
    if (err instanceof Error && err.message === 'Unauthorized') return false;
    // Request timeout: fetchWithTimeout aborts the controller, which rejects with
    // an AbortError (a DOMException in browsers, not an Error subclass) → retry.
    if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError') return true;
    // Genuine network failures make fetch() reject with a TypeError → retry.
    if (err instanceof TypeError) return true;
    // Everything else is deterministic and won't recover on retry — e.g. a
    // SyntaxError from a 200 response with invalid JSON, or a programming error.
    // Fail fast instead of stalling ~15s through the backoff schedule.
    return false;
}

// Runs an idempotent operation, retrying only transient failures.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (attempt === MAX_RETRIES || !isRetryable(e)) break;
            const delay = BASE_RETRY_DELAY_MS * 2 ** attempt + Math.random() * 200;
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// Wraps fetch to attach the stored API key and handle auth failures centrally.
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const key = getApiKey();
    const headers = new Headers(init.headers);
    if (key) headers.set('X-Api-Key', key);
    const res = await fetchWithTimeout(input, { ...init, headers });
    if (res.status === 401) {
        // Drop the rejected key and signal the UI to show the login gate.
        // We intentionally do NOT reload the page: a reload would re-run the
        // same authenticated requests with the same bad key and loop, hammering
        // the API with 401s (a self-inflicted request storm). The login gate
        // unmounts the app instead, stopping further calls until a valid key.
        clearApiKey();
        notifyUnauthorized();
        throw new Error('Unauthorized');
    }
    return res;
}

// Issues an authenticated request, throws a labelled error on non-2xx, and
// returns the parsed JSON body (or undefined for empty 204 responses).
// A `body` is JSON-serialized and sent with the appropriate Content-Type.
// Idempotent GETs are retried on transient failures; mutations run once so a
// retry can never duplicate a write.
async function request<T>(
    url: string,
    opts: { method?: string; body?: unknown; label: string },
): Promise<T> {
    const method = opts.method ?? 'GET';
    const init: RequestInit = { method };
    if (opts.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(opts.body);
    }
    const run = async (): Promise<T> => {
        const res = await apiFetch(url, init);
        if (!res.ok) throw new HttpError(res.status, `Failed to ${opts.label}: ${res.status}`);
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
    };
    return method === 'GET' ? withRetry(run) : run();
}

// Validates a key against the API without persisting it. Used by the login gate.
// Returns `false` ONLY for a real auth rejection (401/403). Transient failures
// (network errors, timeouts, 5xx) are retried and then re-thrown, so a brief
// network blip is never mistaken for an invalid key (which would wrongly clear a
// valid key / block sign-in). Callers must catch to distinguish "wrong key" from
// "couldn't reach the server".
export async function validateApiKey(key: string): Promise<boolean> {
    return withRetry(async () => {
        const res = await fetchWithTimeout(`${API_BASE}/profiles`, { headers: { 'X-Api-Key': key } });
        if (res.ok) return true;
        if (res.status === 401 || res.status === 403) return false;
        // Not an auth verdict — surface it (retryable if transient) rather than
        // reporting a possibly-valid key as invalid.
        throw new HttpError(res.status, `Failed to validate key: ${res.status}`);
    });
}

export async function fetchBookmarks(includeHidden = false, profile?: string): Promise<WebBookmarksItem[]> {
    const params = new URLSearchParams();
    if (includeHidden) params.set('includeHidden', 'true');
    if (profile) params.set('profile', profile);
    const qs = params.toString();
    const url = qs ? `${API_BASE}?${qs}` : API_BASE;
    return withRetry(async () => {
        const res = await apiFetch(url);
        if (!res.ok) throw new HttpError(res.status, `Failed to fetch bookmarks: ${res.status}`);
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
    });
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
    return inBulkChunks(entries, (chunk) =>
        request<void>(`${API_BASE}/reorder`, { method: 'POST', body: chunk, label: 'reorder bookmarks' }),
    ).then(() => undefined);
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

// Runs `fn` over `items` in sequential chunks of at most MAX_BULK_ITEMS and
// returns each chunk's result, so a large bulk operation transparently stays
// within the API's per-request cap without any caller having to remember to
// batch. An empty input still invokes `fn` once, preserving single-request
// semantics for callers that read the result.
export async function inBulkChunks<T, R>(items: T[], fn: (chunk: T[]) => Promise<R>): Promise<R[]> {
    if (items.length <= MAX_BULK_ITEMS) return [await fn(items)];
    const results: R[] = [];
    for (let i = 0; i < items.length; i += MAX_BULK_ITEMS) {
        results.push(await fn(items.slice(i, i + MAX_BULK_ITEMS)));
    }
    return results;
}

// Blocked URL schemes, mirrored from Program.cs HasUnsafeScheme.
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

// Mirror of the API's HasUnsafeScheme: strip control/whitespace chars (browsers do
// this before parsing a URL, so "java\tscript:" would still execute) then test the
// scheme prefix. Exported for regression tests.
export function hasUnsafeScheme(value: string | null | undefined): boolean {
    if (!value || !value.trim()) return false;
    let v = '';
    for (const ch of value) {
        const c = ch.codePointAt(0) ?? 0;
        // Strip C0/C1 control chars and whitespace (browsers do this before parsing).
        if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || /\s/.test(ch)) continue;
        v += ch;
    }
    v = v.toLowerCase();
    return BLOCKED_SCHEMES.some((s) => v.startsWith(s));
}

// Mirror of the API's ValidateBookmark (Program.cs) length caps + scheme checks.
// Returns the first validation message for an item, or null if it passes.
export function validateBulkItem(item: Omit<WebBookmarksItem, 'id'>): string | null {
    if (!item.name || !item.name.trim()) return 'Name is required.';
    if (item.name.length > 200) return 'Name must be 200 characters or fewer.';
    if (item.shortcut && item.shortcut.length > 100) return 'Shortcut must be 100 characters or fewer.';
    if (item.description && item.description.length > 1000) return 'Description must be 1000 characters or fewer.';
    if (item.bookmarkGroup && item.bookmarkGroup.length > 200) return 'Group must be 200 characters or fewer.';
    if (item.profile && item.profile.length > 100) return 'Profile must be 100 characters or fewer.';
    if (item.url && item.url.length > 2048) return 'URL must be 2048 characters or fewer.';
    if (item.urls && item.urls.length > 4096) return 'URLs must be 4096 characters or fewer.';
    if (hasUnsafeScheme(item.url)) return 'URL uses a disallowed scheme.';
    if (hasUnsafeScheme(item.urls)) return 'URL uses a disallowed scheme.';
    return null;
}

export function bulkCreateBookmarks(items: Omit<WebBookmarksItem, 'id'>[]): Promise<{ imported: number }> {
    // Validate the WHOLE payload before sending any chunk. inBulkChunks commits
    // chunks sequentially, so a later chunk rejected by the API would leave the
    // earlier chunks already written — the UI reports total failure and a retry
    // silently duplicates the committed rows. Failing fast here keeps the import
    // all-or-nothing from the client's perspective.
    for (let i = 0; i < items.length; i++) {
        const err = validateBulkItem(items[i]);
        if (err) {
            return Promise.reject(new Error(`Bookmark ${i + 1} ("${items[i].name || 'untitled'}"): ${err}`));
        }
    }
    return inBulkChunks(items, (chunk) =>
        request<{ imported: number }>(`${API_BASE}/bulk`, { method: 'POST', body: chunk, label: 'bulk import' }),
    ).then((results) => ({ imported: results.reduce((sum, r) => sum + r.imported, 0) }));
}

export function bulkUpdateBookmarks(
    ids: number[],
    profile?: string,
    bookmarkGroup?: string,
    shortcut?: string,
    isVisible?: boolean,
): Promise<{ updated: number }> {
    const clearShortcut = shortcut === '' ? true : null;
    return inBulkChunks(ids, (chunk) =>
        request<{ updated: number }>(`${API_BASE}/bulk`, {
            method: 'PUT',
            body: {
                ids: chunk,
                profile: profile ?? null,
                bookmarkGroup: bookmarkGroup ?? null,
                shortcut: shortcut || null,
                isVisible: isVisible ?? null,
                clearShortcut,
            },
            label: 'bulk update',
        }),
    ).then((results) => ({ updated: results.reduce((sum, r) => sum + r.updated, 0) }));
}

export function bulkDeleteBookmarks(ids: number[]): Promise<{ deleted: number }> {
    return inBulkChunks(ids, (chunk) =>
        request<{ deleted: number }>(`${API_BASE}/bulk-delete`, { method: 'POST', body: chunk, label: 'bulk delete' }),
    ).then((results) => ({ deleted: results.reduce((sum, r) => sum + r.deleted, 0) }));
}

export function toggleFavorite(id: number): Promise<{ id: number; isFavorite: boolean }> {
    return request(`${API_BASE}/${id}/favorite`, { method: 'PATCH', label: 'toggle favorite' });
}
