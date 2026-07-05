import type { Bookmark } from './types';
import { resolveBookmarkUrl } from './url';

// Resolves a raw "<shortcut> <terms…>" command against the bookmark list into the
// concrete targets to open. Matching order: exact alias, then partial (substring)
// alias, then — for search-URL bookmarks — by name prefix (e.g. "seek msft").
// Pure and host-neutral so the React app and the userscript resolve shortcuts
// identically instead of each re-implementing the rules (which could drift).
export function resolveShortcutTargets(
    input: string,
    bookmarks: Bookmark[],
): { name: string; url: string }[] {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const parts = trimmed.split(/\s+/);
    const shortcut = parts[0].toLowerCase();
    const searchQuery = parts.slice(1).join(' ');

    let matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase() === shortcut);
    if (matches.length === 0) {
        matches = bookmarks.filter((b) => b.shortcut.trim().toLowerCase().includes(shortcut));
    }
    // Also match by name for bookmarks with search URLs (e.g. "seek msft").
    if (matches.length === 0 && searchQuery) {
        matches = bookmarks.filter((b) => b.urls && b.name.toLowerCase().startsWith(shortcut));
    }

    return matches.map((m) => ({ name: m.name, url: resolveBookmarkUrl(m, trimmed) }));
}
