import type { WebBookmarksItem } from '../types';

// Local (offline) bookmark cache, keyed per profile. Reads adopt-and-migrate the
// legacy un-profiled `bookmarks` key exactly once, after which it is never read
// again; writes only ever touch the profile-aware `bookmarks_<profile>` key.
export function getLocalBookmarks(profile: string): WebBookmarksItem[] | null {
    try {
        const cached = localStorage.getItem(`bookmarks_${profile}`);
        if (cached) return JSON.parse(cached);
        // One-time migration from the legacy un-profiled key: adopt it under the
        // profile-aware key, then drop the legacy key so it's never read again.
        const legacy = localStorage.getItem('bookmarks');
        if (legacy) {
            localStorage.setItem(`bookmarks_${profile}`, legacy);
            localStorage.removeItem('bookmarks');
            return JSON.parse(legacy);
        }
        return null;
    } catch {
        return null;
    }
}

export function setLocalBookmarks(profile: string, data: WebBookmarksItem[]) {
    // Best-effort offline cache: a full store (QuotaExceededError) or a disabled
    // localStorage must never bubble up, or it would reject the fetch success path
    // and surface an error even though fresh bookmarks loaded fine.
    try {
        localStorage.setItem(`bookmarks_${profile}`, JSON.stringify(data));
        // Drop the legacy un-profiled key if an older build left it behind.
        localStorage.removeItem('bookmarks');
    } catch {
        // Ignore: skip the offline cache write, still render the fresh data.
    }
}

// True when no cached bookmarks exist for the profile (nor under the legacy key),
// used to decide whether the app should show a loading state on first paint.
export function hasNoCachedBookmarks(profile: string): boolean {
    return !localStorage.getItem(`bookmarks_${profile}`) && !localStorage.getItem('bookmarks');
}
