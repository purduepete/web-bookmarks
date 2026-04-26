import type { WebBookmarksItem } from './types';

const API_BASE = import.meta.env.PROD ? 'https://webbookmarksapi.azurewebsites.net/api/bookmarks' : '/api/bookmarks';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export async function fetchBookmarks(): Promise<WebBookmarksItem[]> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(API_BASE);
            if (!res.ok) throw new Error(`Failed to fetch bookmarks: ${res.status}`);
            return await res.json();
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < MAX_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }
    throw lastError!;
}
