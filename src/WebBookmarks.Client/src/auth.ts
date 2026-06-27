const STORAGE_KEY = 'webbookmarks_api_key';

export function getApiKey(): string | null {
    return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
    localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
    localStorage.removeItem(STORAGE_KEY);
}

// Auth-failure signal. apiFetch raises this when the API rejects a key (401)
// so the UI can drop back to the login gate in-place, instead of doing a full
// page reload — a reload re-fires the same authenticated calls with the same
// bad key and produces a 401 → reload loop / request storm.
const UNAUTHORIZED_EVENT = 'webbookmarks:unauthorized';

export function notifyUnauthorized(): void {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export function onUnauthorized(handler: () => void): () => void {
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}
